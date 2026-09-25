-- T-021 quick search (RG-DEV-06): accent- and case-insensitive word-prefix search over code,
-- designation and active sale-unit labels, served by a trigram index (CDC technique §208).

-- Both extensions ship with PostgreSQL (contrib); no new dependency.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;

-- unaccent() is only STABLE (it looks its dictionary up through search_path); naming the
-- dictionary makes the result fixed, so it may back an index and a trigger-maintained column.
CREATE FUNCTION immutable_unaccent(text) RETURNS text
  LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT
  AS $$ SELECT public.unaccent('public.unaccent'::regdictionary, $1) $$;

-- One normalization for the stored text and for every searched word: lower case, no accents,
-- anything but a-z and 0-9 becomes a single space (« Huile végétale 1 L » → « huile vegetale 1 l »).
CREATE FUNCTION search_normalize(text) RETURNS text
  LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT
  AS $$ SELECT regexp_replace(lower(immutable_unaccent($1)), '[^a-z0-9]+', ' ', 'g') $$;

-- AlterTable
ALTER TABLE "products" ADD COLUMN "search_text" TEXT NOT NULL DEFAULT '';

-- Leading space: a word starts wherever « ␠word » appears, so « LIKE '% ri%' » is a word prefix.
CREATE FUNCTION product_search_text(p_id uuid, p_sku text, p_name text) RETURNS text
  LANGUAGE sql STABLE
  AS $$
    SELECT ' ' || btrim(search_normalize(concat_ws(' ', p_sku, p_name, (
      SELECT string_agg("label", ' ' ORDER BY "factor", "label")
        FROM "product_units"
       WHERE "product_id" = p_id AND "is_active"
    ))))
  $$;

CREATE FUNCTION products_search_text() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW."search_text" := product_search_text(NEW."id", NEW."sku", NEW."name");
  RETURN NEW;
END;
$$;

CREATE TRIGGER "products_search_text_trg"
  BEFORE INSERT OR UPDATE OF "sku", "name" ON "products"
  FOR EACH ROW EXECUTE FUNCTION products_search_text();

-- A unit added, renamed, (de)activated or removed changes the words of its product.
CREATE FUNCTION product_units_search_text() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  target uuid := CASE WHEN TG_OP = 'DELETE' THEN OLD."product_id" ELSE NEW."product_id" END;
BEGIN
  UPDATE "products"
     SET "search_text" = product_search_text("id", "sku", "name")
   WHERE "id" = target;
  RETURN NULL;
END;
$$;

CREATE TRIGGER "product_units_search_text_trg"
  AFTER INSERT OR DELETE OR UPDATE OF "label", "is_active" ON "product_units"
  FOR EACH ROW EXECUTE FUNCTION product_units_search_text();

-- Existing products.
UPDATE "products" SET "search_text" = product_search_text("id", "sku", "name");

-- CreateIndex
CREATE INDEX "products_search_text_trgm_idx" ON "products" USING GIN ("search_text" gin_trgm_ops);
