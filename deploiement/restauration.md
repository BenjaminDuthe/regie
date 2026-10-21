# Sauvegarde et restauration de regie (histoire 9.2)

Ce document décrit une procédure. Rien ici n'a été exécuté contre une machine réelle : les scripts ont été testés en local
(`coeur/test/sauvegarde.test.ts`). La première répétition réelle est à faire par Benjamin, puis à signer en bas.

## Ce qui est sauvegardé, et ce qui ne l'est jamais

| Élément | Comment | Quand | Où |
| --- | --- | --- | --- |
| Base PostgreSQL | `sauvegarde.sh base` : `pg_dump` chiffré par age (clés publiques), sans fichier en clair | chaque nuit | dossier local du CT (14 jours) et copie sur pve-nipogi |
| Conteneur entier | `sauvegarde.sh vzdump` : `vzdump` du CT, sans les dossiers de secrets | chaque dimanche | stockage Proxmox qui pointe vers pve-nipogi |
| Clé maîtresse du coffre (`regie_cle_maitresse`) | **jamais sauvegardée avec le reste** | — | Vaultwarden, hors du CT |
| Clé privée age | **jamais stockée** sur le CT ni avec les dumps | — | Vaultwarden |

La clé maîtresse et la clé privée age ne voyagent jamais avec les dumps : qui vole une sauvegarde ne peut ni la lire, ni
ouvrir le coffre des jetons. Conséquence : sans la clé maîtresse en Vaultwarden, les jetons du coffre sont perdus (il faut
reconnecter les comptes), le reste est intact.

## Installation (une fois, par Benjamin)

1. Dans le CT : copier `sauvegarde.sh` vers `/usr/local/lib/regie/`, les unités `regie-sauvegarde-base.*` vers
   `/etc/systemd/system/`, créer `/etc/regie/sauvegarde.env` (chemins et noms seulement : `SAUVEGARDE_DESTINATION`,
   `AGE_DESTINATAIRES`, `PGHOST`, `PGDATABASE`, `PGUSER`, `PGPASSFILE`). Activer `regie-sauvegarde-base.timer`.
2. Sur l'hôte Proxmox : la même chose avec `regie-sauvegarde-vzdump.*` et `/etc/regie/sauvegarde-hote.env` (`CTID`,
   `STOCKAGE_VZDUMP`). Activer `regie-sauvegarde-vzdump.timer`.
3. Monter le dossier d'état (`REGIE_SAUVEGARDE_ETAT`, fichiers `base_le` et `vzdump_le`) en **lecture seule** dans le
   conteneur du cœur et régler `REGIE_SAUVEGARDE_ETAT` à ce chemin. `/sante` annonce alors l'âge de chaque sauvegarde et
   passe en alerte si elle dépasse 26 h (base) ou 8 jours (conteneur).
4. Générer une paire de clés age ailleurs que sur le CT ; ne déposer que la clé **publique** dans `AGE_DESTINATAIRES` ;
   ranger la clé privée dans Vaultwarden.

## Restaurer

À faire sur un conteneur vierge (jamais par-dessus l'existant).

1. Récupérer le dump chiffré le plus récent sur pve-nipogi (ou le dernier `vzdump` si le conteneur entier est perdu).
2. Retrouver dans Vaultwarden la clé privée age et la clé maîtresse du coffre. Poser la clé privée dans un fichier
   temporaire lisible par le seul utilisateur (`AGE_IDENTITE`), la clé maîtresse comme secret Podman `regie_cle_maitresse`.
3. Vérifier d'abord que le dump se lit : `sauvegarde.sh lister` (déchiffre et liste, ne change rien).
4. Créer une base vide, puis `sauvegarde.sh restaurer-base` (elle refuse une base non vide).
5. Démarrer le cœur avec `REGIE_MODE=restauration` : le service lit mais n'écrit rien, ne lance ni planificateur ni
   publication. Cela évite qu'une restauration republie des vidéos déjà en ligne.
6. Contrôler : `/sante` répond ; la bibliothèque affiche les vidéos ; les réglages (gabarit, hôtes déclarés) sont là ;
   un jeton d'API se vérifie. Si la clé maîtresse manque, reconnecter les comptes de réseaux sociaux.
7. Effacer le fichier de clé privée temporaire, puis redémarrer le cœur **sans** `REGIE_MODE=restauration`.
8. Les publications dont l'état était en cours au moment de la sauvegarde sont revues par le réconciliateur : vérifier à
   la main sur le réseau avant tout rejeu (voir l'histoire 7.3).

## Répétition de restauration

| Date | Dump utilisé | Résultat (vidéos, réglages, `/sante`) | Signature |
| --- | --- | --- | --- |
| ____ / ____ / ________ | | | Benjamin : ____________ |
