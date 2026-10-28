# ADR-0009 — Mode « réseau local seulement » tant que le magasin n'a pas de domaine

Date : 28/10/2026 · Statut : **Accepté** — demande de l'utilisateur du 28/10/2026 (« il faut juste faire marcher en réseau local l'appli client/serveur »). Complète ADR-0007 et ADR-0008 sans les remplacer.

## Contexte
ADR-0008 suppose un domaine par client chez OVH : certificat par défi DNS-01, DNS local qui résout le domaine vers le serveur, relais pour l'accès distant. L'utilisateur n'a encore ni compte OVH ni domaine, et veut livrer une version d'essai qui marche **dans le réseau du magasin**.

Le HTTP simple ne suffit pas : l'application exige un contexte sécurisé (cookie de session `Secure`, `crypto.randomUUID` à l'encaissement, caméra pour les codes-barres, notifications et installation de la PWA). Il faut donc du HTTPS, sans domaine.

## Décision
- **Sans `APP_DOMAIN`**, le magasin est servi à `https://<LAN_IP>` ; seul `LAN_IP` est obligatoire. Les clés OVH, WireGuard et le DNS local sont ignorés ou retirés.
- **Certificat** : l'autorité interne de Caddy (`tls internal`) signe un certificat pour l'adresse IP du serveur. `Caddyfile-local` remplace `Caddyfile` ; le reste du site (`site.caddy`) est commun aux deux modes, le certificat OVH passe dans `tls-ovh.caddy`.
- **Confiance** : l'installateur approuve cette autorité sur le PC serveur. Chaque tablette, téléphone ou PC l'installe **une fois** depuis `http://<LAN_IP>`, page « Préparer cet appareil » qui sert le certificat et les étapes Android, iPhone/iPad et Windows.
- **Sauvegardes** : sur le PC et le disque externe ; `rclone` n'est livré que si le magasin a un coffre (`BACKUP_S3_BUCKET`) et le mot de passe du coffre n'est créé qu'alors. L'installateur garde `rclone.exe` dans le dossier des données pour qu'une mise à jour sans lui ne casse pas le coffre.
- **Passage au domaine** : remplir `APP_DOMAIN` et les clés OVH, reconstruire, relancer l'installateur : il réinstalle le DNS local et le `Caddyfile` OVH. Les données restent ; l'adresse des tablettes change (une fois).

## Conséquences
- Pas d'accès distant (boss hors du magasin) avant le domaine : le relais d'ADR-0008 ne sait aiguiller que par nom.
- Une étape manuelle par appareil (certificat), décrite sur la page et dans `LISEZ-MOI.txt`. Les certificats feuilles de Caddy se renouvellent seuls ; l'autorité racine vaut 10 ans.
- La box doit réserver l'adresse du serveur : si elle change, le certificat ne correspond plus.
- Tâche : T-100.
