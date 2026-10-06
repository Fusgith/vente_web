# ADR-0008 — Cloud chez OVH, partagé entre les clients : relais VPS sans déchiffrement, sauvegardes chiffrées au magasin

Date : 06/10/2026 · Statut : **Accepté** — choix de l'utilisateur du 06/10/2026. Précise ADR-0001 (« Cloudflare Tunnel ou équivalent », « stockage cloud ») et remplace les décisions T1 et T2 du CDC technique (§13).

## Contexte
L'utilisateur livre des applications de gestion sur mesure à **plusieurs clients**, toujours en réseau local d'abord (ADR-0001) : une coupure d'Internet ne doit jamais bloquer une transaction. Deux besoins restent dans le cloud : la **sauvegarde** hors du site et l'**accès à distance** de quelques responsables (ici le boss et l'admin : tableau de bord, demandes de remise). L'utilisateur vend un **package unique** et ne veut pas que chaque client ouvre un abonnement cloud : la partie cloud tourne sur **son** compte OVH, partagée entre ses clients.

Partager une infrastructure entre clients impose trois garanties : un client ne voit jamais les données d'un autre ; le serveur partagé ne peut rien lire ; un magasin compromis ne compromet pas les autres.

## Décision
- **Un seul fournisseur** : OVH (compte du développeur), pour les zones DNS, le relais et les sauvegardes ; centres de données européens.
- **Un domaine par client** (ex. `app.epicerie-rasoa.com`), dont la zone DNS est chez OVH ; titulaire du domaine : le client. Au magasin, le DNS local le résout vers le PC serveur (CDC technique §2.1) ; à l'extérieur, vers le relais.
- **Certificats au magasin** : Caddy les obtient par défi DNS-01 avec l'API OVH (binaire Caddy avec le module `caddy-dns/ovh`). Une **clé API OVH par client**, limitée à la zone DNS de son domaine.
- **Relais : un petit VPS OVH partagé** (Linux) :
  - chaque magasin y ouvre un tunnel **WireGuard sortant** (service Windows, `PersistentKeepalive`) : aucun port ouvert sur la box, même derrière un NAT d'opérateur. Une adresse de tunnel par magasin ; aucun routage d'un magasin à l'autre (pas de transfert IP sur le VPS) ;
  - le VPS aiguille le trafic HTTPS **sans le déchiffrer**, d'après le nom demandé (SNI : nginx `stream` + `ssl_preread`), vers le tunnel du magasin concerné, et transmet l'adresse du client par le **protocole PROXY** ;
  - TLS s'arrête au magasin : le VPS ne détient ni certificat, ni mot de passe, ni donnée ;
  - au magasin, Caddy écoute le tunnel sur une adresse à part (son adresse WireGuard), n'y accepte le protocole PROXY que du relais et y pose `x-access-origin: remote` ; le reste du CDC technique §2.2 est inchangé.
- **Sauvegardes : OVH Object Storage** (API S3), un compartiment par client ; `rclone` chiffre **au magasin** (`crypt`) avec une clé propre au client : OVH et le développeur ne stockent que des fichiers illisibles. L'identifiant S3 du magasin écrit sans pouvoir effacer (un rançongiciel sur le PC ne détruit pas l'historique) ; la rétention (§2.3) s'applique côté OVH (expiration des objets) ou, à défaut, depuis le VPS. La clé de chiffrement est remise au client (enveloppe scellée), copie chez le développeur.
- **Seconde sauvegarde au magasin** : un disque externe, pour que la reprise ne dépende pas que du développeur ni d'Internet.
- **Surveillance depuis le VPS** (T-082) : joignabilité de chaque magasin par son tunnel, fraîcheur de sa dernière sauvegarde ; l'alerte part vers le développeur. Le VPS est lui-même surveillé de l'extérieur.
- **Installation paramétrée par client** : `pnpm dist` (ADR-0006) reçoit, en plus du nom, le domaine, les clés WireGuard, le compartiment et les identifiants de sauvegarde ; les secrets vont dans le `.env` du magasin, jamais dans le dépôt. Variables prévues (noms figés à T-080 et T-081) : `OVH_ENDPOINT` (`ovh-eu`), `OVH_APPLICATION_KEY`, `OVH_APPLICATION_SECRET`, `OVH_CONSUMER_KEY`, `BACKUP_S3_ENDPOINT`, `BACKUP_S3_REGION`, `BACKUP_S3_BUCKET`, `BACKUP_S3_ACCESS_KEY`, `BACKUP_S3_SECRET_KEY`, `BACKUP_PASSPHRASE`.

## Conséquences
- Le magasin vend toujours sans Internet ni relais (ADR-0001 inchangé). Relais en panne ⇒ **tous** les clients perdent l'accès à distance en même temps, jamais la vente : la configuration du VPS est un script, réinstallable en moins d'une heure.
- Trajet distant plus long (appareil du boss → VPS en Europe → magasin) : quelques centaines de millisecondes, sans gêne pour le tableau de bord ni l'accord d'une remise.
- Le développeur paie OVH chaque mois pour tous ses clients (VPS, stockage qui grossit, domaines) : le prix du package doit couvrir ce coût dans la durée (forfait annuel recommandé). Décision commerciale, hors de cet ADR.
- Le développeur héberge des données de ses clients, chiffrées : clauses de réversibilité (remise des clés et des données) et de sous-traitance des données personnelles au contrat. Hors code.
- Tâches : T-080 (WireGuard au lieu de `cloudflared` ; Caddy avec `caddy-dns/ovh` et l'écoute du tunnel), T-081 (Object Storage, `crypt`, disque externe), T-082 (surveillance depuis le VPS), T-086 (le relais partagé).

## Alternatives écartées
- Cloudflare Tunnel (T1) : gratuit et sans serveur à entretenir, mais un second fournisseur, et Cloudflare déchiffre le trafic à son entrée.
- Tailscale Funnel : un tiers de plus, un compte par client.
- Relais qui déchiffre (Caddy sur le VPS) : certificats plus simples, mais le serveur partagé verrait les données et les mots de passe de tous les clients.
- Un VPS par client : isolement total, coût multiplié par le nombre de clients.
- Port ouvert sur la box : souvent impossible (pas d'IP publique fixe, NAT d'opérateur) et expose le PC du magasin à Internet.
- Backblaze B2 ou Cloudflare R2 (T2) : un second fournisseur à payer et à gérer.
