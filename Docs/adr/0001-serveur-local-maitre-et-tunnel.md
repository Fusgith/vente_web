# ADR-0001 — Serveur local maître au magasin, accès distant par tunnel, pas de synchronisation bidirectionnelle

Date : 21/09/2026 · Statut : **Accepté** par l'utilisateur le 21/09/2026

## Contexte
Le magasin doit vendre même sans Internet ; le boss doit voir ventes et encaissements en temps réel depuis l'extérieur. Un cloud seul bloque la vente en cas de coupure ; une synchronisation bidirectionnelle entre un serveur local et un cloud impose la résolution de conflits (files d'attente, réservations, numéros de facture) et multiplie les bugs. Or le « temps réel » du boss exige de toute façon que le magasin soit connecté à cet instant.

## Décision
Une seule base de données maître, PostgreSQL, sur un mini-PC dans le magasin. Les postes du magasin y accèdent par le Wi-Fi local. Le boss et l'admin y accèdent depuis l'extérieur par un tunnel sortant chiffré (Cloudflare Tunnel ou équivalent) sous le même nom de domaine, résolu localement vers le mini-PC (DNS local). Les sauvegardes chiffrées partent vers un stockage cloud toutes les 15 minutes. Aucune écriture n'a lieu ailleurs que sur ce serveur.

## Conséquences
- Le Wi-Fi local et le mini-PC deviennent des infrastructures critiques : onduleur, IP fixe, plan de reprise testé (RPO 15 min, RTO 2 h).
- Sans Internet : magasin 100 % fonctionnel, boss sans temps réel jusqu'au retour de la connexion.
- La PWA n'a aucune logique de détection de réseau ni de mode hors ligne ; le service worker ne met en cache que l'enveloppe applicative.
- Une réplique cloud en lecture seule (réplication logique) peut être ajoutée en V2 sans changer ce choix.

## Alternatives écartées
- Cloud seul — vente impossible en cas de coupure Internet.
- Cloud maître + tablettes hors ligne (offline-first) — files, réservations et numérotation sans trou impossibles à garantir hors ligne.
- Serveur local + cloud avec synchronisation bidirectionnelle — complexité et risques disproportionnés pour un seul magasin.
