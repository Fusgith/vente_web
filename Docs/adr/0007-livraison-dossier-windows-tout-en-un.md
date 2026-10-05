# ADR-0007 — Livraison : un dossier Windows tout-en-un, sans Docker

Date : 05/10/2026 · Statut : **Accepté** — choix de l'utilisateur du 05/10/2026 (option A). Remplace, **pour le serveur du magasin seulement**, Docker Compose (ADR-0003) et le mini-PC Linux (CDC technique §10.2, décision T4).

## Contexte
L'utilisateur veut livrer l'application en **copiant des fichiers** sur le serveur du magasin, sans faire installer « mille et une choses » au client ni l'obliger à acheter un serveur coûteux. Le CDC technique prévoyait un mini-PC Linux avec Docker : installation et mises à jour en ligne de commande, hors de portée d'un intégrateur qui veut copier un dossier.

ADR-0001 reste entier : une seule base maître, **dans le magasin**, pour vendre même sans Internet. Un hébergement web chargé par FTP (FileZilla) est donc exclu : sans Internet, plus de ventes ; et ces hébergements ne font pas tourner Node.js avec PostgreSQL.

## Décision
- Le serveur du magasin est un **PC Windows 10 ou 11 64 bits** (dédié de préférence, pas le PC de caisse) ; 8 Go de mémoire suffisent pour un magasin (estimation de l'agent ; les 16 Go du §10.2 sont une marge).
- `pnpm dist` produit, dans `Dist/<nom-simplifié>/`, un **dossier autonome** qui contient tout ce qui tourne :
  - Node.js portable (`node.exe`), l'API construite et ses modules ;
  - PostgreSQL en binaires officiels pour Windows (archive zip, extensions `pg_trgm` et `unaccent` comprises) ;
  - la PWA construite, servie par Caddy (un seul exécutable : TLS, en-tête `x-access-origin`, proxy `/api` et `/socket.io`, CDC §2.2) ;
  - `cloudflared` (un seul exécutable) pour l'accès du boss à distance (ADR-0001) ;
  - des scripts à double-cliquer, messages en français : **Installer** (une fois, en administrateur), **Mettre à jour**, **Sauvegarder**, **Restaurer**.
- **Installer** crée la base, la configuration (`.env`, secrets générés sur place) et les services Windows (démarrage automatique au boot, redémarrage en cas d'arrêt), puis ouvre le pare-feu sur le réseau local.
- **Les données vivent hors du dossier de l'application** (base, fichiers émis, sauvegardes, `.env`) : copier une nouvelle version ne peut jamais les écraser.
- **Mettre à jour** = copier le nouveau dossier (clé USB, partage réseau ou FileZilla si un serveur SFTP est activé sur le PC), puis un double-clic : sauvegarde complète, arrêt des services, migrations (`prisma migrate deploy`), redémarrage ; retour arrière possible sur la version précédente gardée à côté.
- Docker reste l'outil du **développement** (base de dev, `pnpm demarrer`) ; la CI ne change pas.

## Conséquences
- Rien à installer chez le client hormis Windows ; pas de Linux ni de Docker à maîtriser.
- Le dossier pèse quelques centaines de Mo (PostgreSQL surtout) ; T-080 retire ce qui ne sert pas (outils graphiques, documentation).
- Windows Update redémarre le PC : les services repartent seuls ; heures d'activité à régler hors ouverture (notice d'installation).
- La reprise après panne (§2.3) devient : copier le dossier sur un autre PC Windows, **Installer**, **Restaurer** la dernière sauvegarde, repointer le DNS local.
- Les dépendances binaires (Node, PostgreSQL, Caddy, cloudflared, l'outil de service Windows de l'API) sont choisies et justifiées au journal avec T-080 ; leurs versions sont figées par la construction.
- Le code de l'application (API, PWA, règles) ne change pas.

## Alternatives écartées
- **B — mini-PC Linux + Docker Compose** (plan initial) : installation et mises à jour en ligne de commande.
- **Docker Desktop sur un PC Windows** : lourd, licence payante au-delà d'une certaine taille d'entreprise, fragile aux redémarrages (déjà déconseillé par T4).
- **Hébergement web par FTP** : contraire à ADR-0001 (pas de vente sans Internet) et incompatible avec Node.js + PostgreSQL.
