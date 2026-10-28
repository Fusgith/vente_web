# ADR-0010 — Licence d'essai liée au serveur du magasin

Date : 28/10/2026 · Statut : **Accepté** — demande de l'utilisateur du 28/10/2026 (« il faut brider l'appli tant qu'on n'a pas de serveur OVH… la protéger de toutes formes de copies et limiter dans le temps… Tout cela doit se régler avec l'outil de compilation »).

## Contexte
L'application est livrée au client pour un essai, sans serveur OVH ni relais (ADR-0009) : rien de distant ne peut vérifier qu'elle est payée. Il faut qu'une copie du dossier livré ne marche pas ailleurs, et que l'essai s'arrête à une date choisie par le vendeur, sans connexion Internet.

## Décision
- **Clé signée** : le vendeur possède une paire de clés Ed25519. La clé privée vit dans `Dist/.licence/` sur son PC (jamais versionnée, jamais livrée) ; l'outil de distribution (T-102) écrit la clé publique dans le JS construit (`api/dist/license-key.js`). Le code source la laisse vide : en développement et dans les tests, rien n'est vérifié (état `unchecked`).
- **Liée au serveur** : le serveur affiche un **code de 16 chiffres hexadécimaux** tiré de l'identifiant Windows de la machine (`MachineGuid`, à défaut `/etc/machine-id` puis le nom). La clé de licence = conditions `{ client, machine, expires | null }` + signature ; elle ne vaut que pour ce code.
- **Saisie** : la clé se colle sur l'écran « Activation » de n'importe quel appareil, et se garde dans la table des paramètres (`settings.license`) : pas de fichier à copier, la mise à jour du logiciel la conserve.
- **Verrou** : sans clé valide, toute l'API répond `403 LICENSE_REQUIRED`, sauf la route de la licence ; `/healthz` reste ouvert pour la surveillance. Tous les écrans, publics compris, montrent l'écran d'activation.
- **Horloge** : le serveur retient la date la plus tardive vue (écrite au plus une fois par heure) ; une horloge qui recule de plus d'un jour verrouille jusqu'à ce qu'on la remette à l'heure.
- **Renouvellement** : une nouvelle clé (nouvelle date ou sans fin) se saisit sur le même écran ; la dernière semaine, l'écran de connexion annonce la fin et ouvre la saisie.

## Conséquences
- Copier le dossier ou la base sur un autre PC : verrouillé (« clé faite pour un autre serveur »). Changer de PC serveur demande une nouvelle clé.
- Limites assumées : un développeur peut modifier le JS livré, cloner une machine virtuelle avec son identifiant, ou vider la base pour effacer la date retenue. La protection vise la copie ordinaire par le client, pas un attaquant outillé ; le relais OVH permettra plus tard une vérification en ligne.
- Perdre la clé privée du vendeur empêche de faire de nouvelles clés pour les serveurs déjà livrés : l'outil demande de la sauvegarder.
- Socket.IO n'est pas verrouillé : sans session ouverte (API verrouillée), il ne sert rien.
- Tâches : T-101 (licence), T-102 (outil de distribution qui fabrique les clés).
