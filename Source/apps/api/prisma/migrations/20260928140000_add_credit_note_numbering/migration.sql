-- T-053 credit notes (RG-FAC-05, RG-ANN-02, H36): gap-free yearly number, frozen content, the
-- register session that paid the refund back.
ALTER TABLE "credit_notes"
  ADD COLUMN "year" INTEGER NOT NULL,
  ADD COLUMN "seq" INTEGER NOT NULL,
  ADD COLUMN "snapshot" JSONB NOT NULL,
  ADD COLUMN "register_session_id" UUID;
CREATE UNIQUE INDEX "credit_notes_year_seq_key" ON "credit_notes"("year", "seq");
CREATE INDEX "credit_notes_register_session_id_idx" ON "credit_notes"("register_session_id");
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_register_session_id_fkey"
  FOREIGN KEY ("register_session_id") REFERENCES "register_sessions"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "credit_notes"
  ADD CONSTRAINT "credit_notes_seq_check" CHECK ("seq" >= 1 AND "year" >= 2000);

-- The new columns are frozen too: only pdf_path may be filled in after issue.
CREATE OR REPLACE FUNCTION credit_notes_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'credit_notes are never deleted (RG-FAC-05)' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NEW."id" IS DISTINCT FROM OLD."id"
     OR NEW."number" IS DISTINCT FROM OLD."number"
     OR NEW."year" IS DISTINCT FROM OLD."year"
     OR NEW."seq" IS DISTINCT FROM OLD."seq"
     OR NEW."invoice_id" IS DISTINCT FROM OLD."invoice_id"
     OR NEW."amount" IS DISTINCT FROM OLD."amount"
     OR NEW."reason" IS DISTINCT FROM OLD."reason"
     OR NEW."refund_method_id" IS DISTINCT FROM OLD."refund_method_id"
     OR NEW."refund_reference" IS DISTINCT FROM OLD."refund_reference"
     OR NEW."register_session_id" IS DISTINCT FROM OLD."register_session_id"
     OR NEW."snapshot" IS DISTINCT FROM OLD."snapshot"
     OR NEW."issued_by" IS DISTINCT FROM OLD."issued_by"
     OR NEW."approved_by" IS DISTINCT FROM OLD."approved_by"
     OR NEW."issued_at" IS DISTINCT FROM OLD."issued_at" THEN
    RAISE EXCEPTION 'credit_notes never change after issue, except pdf_path (RG-FAC-05)'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END $$;
