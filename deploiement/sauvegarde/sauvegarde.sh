#!/usr/bin/env bash
# regie — sauvegardes et restauration (histoire 9.2). Aucun secret dans ce script : il ne lit que des chemins de fichiers.
#
# Sous-commandes :
#   base               DANS le CT regie, chaque nuit : pg_dump, chiffré par age (clé PUBLIQUE), copié vers pve-nipogi, daté dans le dossier d'état
#   vzdump             SUR l'hôte Proxmox, chaque semaine : vzdump du CT sans les secrets, daté dans le CT (lu par /sante)
#   restaurer-base     DANS un conteneur vierge : déchiffre un dump (clé PRIVÉE fournie à la main) et le rejoue dans une base vide
#   lister             comme restaurer-base, mais ne fait que lister le contenu du dump (vérifie qu'il se déchiffre et se lit)
#
# Réglages (environnement, jamais de valeur secrète : ce sont des chemins et des noms) :
#   REGIE_SAUVEGARDE_ETAT    dossier d'état lu par /sante (fichiers base_le et vzdump_le) ; défaut /var/lib/regie/sauvegarde/etat
#   SAUVEGARDE_LOCAL         dossier des dumps chiffrés dans le CT ; défaut /var/lib/regie/sauvegarde/dumps
#   SAUVEGARDE_DESTINATION   dossier local ou utilisateur@hote:dossier (rsync par SSH, clé propre au CT) ; obligatoire pour « base »
#   AGE_DESTINATAIRES        fichier de clés publiques age (une par ligne) ; obligatoire pour « base »
#   AGE_IDENTITE             fichier de clé privée age, posé à la main le temps de la restauration, jamais stocké ; pour « restaurer-base »
#   CONSERVATION_JOURS       dumps gardés dans le CT ; défaut 14
#   PGHOST PGPORT PGDATABASE PGUSER PGPASSFILE   connexion standard de PostgreSQL ; le mot de passe est dans le fichier PGPASSFILE
#   CTID, STOCKAGE_VZDUMP, CHEMINS_SECRETS_EXCLUS, DOSSIER_ETAT_CT   pour « vzdump »

set -euo pipefail
shopt -s inherit_errexit 2>/dev/null || true

ETAT="${REGIE_SAUVEGARDE_ETAT:-/var/lib/regie/sauvegarde/etat}"
LOCAL="${SAUVEGARDE_LOCAL:-/var/lib/regie/sauvegarde/dumps}"
CONSERVATION_JOURS="${CONSERVATION_JOURS:-14}"
# Par défaut, là où Podman range les secrets du CT (dont regie_cle_maitresse) : jamais dans une sauvegarde (AD-9).
CHEMINS_SECRETS_EXCLUS="${CHEMINS_SECRETS_EXCLUS:-/home/regie/.local/share/containers/storage/secrets /run/secrets /etc/regie/secrets}"

dire() { printf '[regie/sauvegarde] %s\n' "$*"; }
mourir() { printf '[regie/sauvegarde] %s\n' "$*" >&2; exit 1; }
maintenant_utc() { date -u +%Y-%m-%dT%H:%M:%SZ; }
exiger() { command -v "$1" >/dev/null 2>&1 || mourir "commande absente : $1"; }

# Écrit la date seulement quand tout est bon : /sante ne doit jamais annoncer une sauvegarde qui n'existe pas.
marquer() {
  mkdir -p "$ETAT"
  local temporaire
  temporaire="$(mktemp "$ETAT/.$1.XXXXXX")"
  printf '%s\n' "$(maintenant_utc)" > "$temporaire"
  chmod 0644 "$temporaire"
  mv -f "$temporaire" "$ETAT/$1"
}

somme() { if command -v sha256sum >/dev/null 2>&1; then sha256sum "$1"; else shasum -a 256 "$1"; fi | cut -d' ' -f1; }

sauvegarde_base() {
  exiger pg_dump; exiger age
  [ -n "${SAUVEGARDE_DESTINATION:-}" ] || mourir "SAUVEGARDE_DESTINATION n'est pas réglé"
  [ -s "${AGE_DESTINATAIRES:-}" ] || mourir "AGE_DESTINATAIRES absent ou vide : refus de produire un dump en clair"
  mkdir -p "$LOCAL"; chmod 0700 "$LOCAL"
  local nom fichier partiel
  nom="regie-base-$(date -u +%Y%m%dT%H%M%SZ).dump.age"
  fichier="$LOCAL/$nom"
  partiel="$fichier.partiel"
  # Le dump ne touche jamais le disque en clair : il passe par un tube directement dans age.
  # --no-owner : la restauration se fait avec un autre rôle ; la clé maîtresse n'est pas en base (seulement des données chiffrées par elle).
  pg_dump --format=custom --no-owner --no-privileges | age --recipients-file "$AGE_DESTINATAIRES" --output "$partiel"
  [ -s "$partiel" ] || mourir "dump vide : rien n'est copié ni daté"
  mv "$partiel" "$fichier"
  case "$SAUVEGARDE_DESTINATION" in
    *:*) exiger rsync; rsync -a --partial -e "ssh -o BatchMode=yes" "$fichier" "$SAUVEGARDE_DESTINATION/" ;;
    *) mkdir -p "$SAUVEGARDE_DESTINATION"; cp "$fichier" "$SAUVEGARDE_DESTINATION/$nom" ;;
  esac
  case "$SAUVEGARDE_DESTINATION" in
    *:*) : ;; # la somme distante est vérifiée par rsync lui-même ; la restauration de contrôle la prouve (restauration.md)
    *) [ "$(somme "$fichier")" = "$(somme "$SAUVEGARDE_DESTINATION/$nom")" ] || mourir "la copie diffère de l'original : non datée" ;;
  esac
  marquer base_le
  # Ménage local seulement ; la durée de garde côté pve-nipogi est réglée là-bas (restauration.md).
  find "$LOCAL" -maxdepth 1 -name 'regie-base-*.dump.age' -mtime +"$CONSERVATION_JOURS" -delete
  dire "dump chiffré copié : $nom"
}

sauvegarde_vzdump() {
  exiger vzdump; exiger pct
  : "${CTID:?CTID obligatoire (identifiant du CT regie)}"
  : "${STOCKAGE_VZDUMP:?STOCKAGE_VZDUMP obligatoire (stockage Proxmox pointant vers pve-nipogi)}"
  local dossier_ct="${DOSSIER_ETAT_CT:-/var/lib/regie/sauvegarde/etat}"
  [ -n "$CHEMINS_SECRETS_EXCLUS" ] || mourir "CHEMINS_SECRETS_EXCLUS vide : la clé maîtresse irait dans la sauvegarde"
  local exclusions=() chemin
  for chemin in $CHEMINS_SECRETS_EXCLUS; do exclusions+=(--exclude-path "$chemin"); done
  vzdump "$CTID" --storage "$STOCKAGE_VZDUMP" --mode snapshot --compress zstd "${exclusions[@]}"
  # La date est posée dans le CT, là où /sante la lit, seulement après un vzdump réussi (set -e).
  local temporaire
  temporaire="$(mktemp)"
  printf '%s\n' "$(maintenant_utc)" > "$temporaire"
  pct exec "$CTID" -- mkdir -p "$dossier_ct"
  pct push "$CTID" "$temporaire" "$dossier_ct/vzdump_le" --perms 0644
  rm -f "$temporaire"
  dire "vzdump du CT $CTID terminé"
}

# Vérifié AVANT tout tube : pg_restore ne doit jamais démarrer si le déchiffrement ne peut pas avoir lieu.
prerequis_dechiffrement() {
  exiger age
  [ -r "${AGE_IDENTITE:-}" ] || mourir "AGE_IDENTITE illisible : la clé privée se pose à la main, depuis Vaultwarden"
  [ -r "${1:-}" ] || mourir "usage : $0 restaurer-base|lister <dump.age>"
}

dechiffrer() { age --decrypt --identity "$AGE_IDENTITE" "$1"; }

restaurer_base() {
  exiger pg_restore
  prerequis_dechiffrement "${1:-}"
  dechiffrer "$1" | pg_restore --no-owner --no-privileges --exit-on-error --dbname "${PGDATABASE:?PGDATABASE obligatoire}"
  dire "base restaurée ; démarrer regie avec REGIE_MODE=restauration pour la vérifier"
}

lister() {
  exiger pg_restore
  prerequis_dechiffrement "${1:-}"
  dechiffrer "$1" | pg_restore --list > /dev/null
  dire "le dump se déchiffre et se lit"
}

case "${1:-}" in
  base) sauvegarde_base ;;
  vzdump) sauvegarde_vzdump ;;
  restaurer-base) shift; restaurer_base "${1:-}" ;;
  lister) shift; lister "${1:-}" ;;
  *) mourir "usage : $0 base | vzdump | restaurer-base <dump.age> | lister <dump.age>" ;;
esac
