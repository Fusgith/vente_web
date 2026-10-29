# Dist

Livrables construits depuis `Source/` ; contenu reproductible, non versionné (voir `.gitignore`),
jamais modifié à la main.

- `<nom-simplifié>/` — dossier Windows tout-en-un d'un magasin (ADR-0007, T-080), construit par
  l'outil de distribution (double-clic sur `Outil de distribution.cmd`, T-102) ou par
  `pnpm dist --nom "…" [--nom-court "…"] [--client <paramètres>]` depuis `Source/`.
  Mode d'emploi pour le magasin : `LISEZ-MOI.txt` dans ce dossier.
  Avec `--client` (modèle : `Source/infra/windows/client.env.example`), il contient les secrets
  du magasin : à transporter tel quel, jamais à partager.
- `.telechargements/` — programmes tiers (Node.js, PostgreSQL, Caddy, WinSW, WireGuard), téléchargés
  une fois et vérifiés par empreinte SHA-256 (`Source/scripts/dist.mjs`) ; Caddy avec son module OVH
  n'a pas de version officielle : il est compilé une fois (commande donnée par `pnpm dist` s'il manque).
- `.outil/` — ce que garde l'outil de distribution : logo de l'application, et par magasin ses noms,
  ses paramètres (secrets) et son logo.
- `.licence/` — clé privée du vendeur qui signe les clés de licence (ADR-0010) et liste des clés
  émises : **à sauvegarder hors de ce PC**, jamais à partager.
