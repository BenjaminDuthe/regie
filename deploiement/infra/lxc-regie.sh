#!/usr/bin/env bash
# regie — création rejouable du CT 140 « regie » sur pve-media (histoire 0.2).
#
# Usage (en root sur l'hôte Proxmox `pve`, 192.168.20.200) :
#   ./lxc-regie.sh                                   # crée ou met à niveau le CT, puis l'installe
#   pct exec 140 -- /root/lxc-regie.sh tester-gpu    # encode une vidéo de test sur l'Arc (VAAPI)
#   pct exec 140 -- /root/lxc-regie.sh tester-boot   # vérifie que le conteneur Quadlet de test tourne
#
# Sous-commandes :
#   hote          (défaut) côté hôte : CT, idmap élargi, /dev/dri, pare-feu, puis « conteneur » dans le CT
#   conteneur     dans le CT : Podman rootless, utilisateur regie avec linger, conteneur Quadlet de test
#   tester-gpu    dans le CT : ffmpeg dans un conteneur rootless encode en H.264 par VAAPI sur l'Arc
#   tester-boot   dans le CT : le conteneur Quadlet de test est actif sans session ouverte
#
# Aucun secret dans ce script.

set -euo pipefail
shopt -s inherit_errexit

# ── Paramètres (surchargeables par l'environnement) ───────────────────────────
CTID="${CTID:-140}"
NOM_CT="${NOM_CT:-regie}"
STOCKAGE="${STOCKAGE:-local-nvme}"
DISQUE_GO="${DISQUE_GO:-40}"
COEURS="${COEURS:-4}"
MEMOIRE_MO="${MEMOIRE_MO:-4096}"
ADRESSE="${ADRESSE:-192.168.20.140}"
MASQUE="${MASQUE:-24}"
PASSERELLE="${PASSERELLE:-192.168.20.1}"
DNS="${DNS:-1.1.1.1}"
CT_MODELE_RESEAU="${CT_MODELE_RESEAU:-101}"      # CT dont on reprend le pont et le VLAN (nginx)
PLAGE_IDMAP="${PLAGE_IDMAP:-231072}"             # 65 536 pour le CT + 165 536 pour Podman rootless
RENDU="${RENDU:-/dev/dri/renderD128}"            # nœud de rendu de l'Arc B570

# Pare-feu : seuls ces voisins sont joignables sur le réseau local.
NGINX="${NGINX:-192.168.20.17}"                  # CT 101, seul autorisé à entrer
AUTHENTIK="${AUTHENTIK:-192.168.20.115}"         # CT 115, port 9000
SAUVEGARDE="${SAUVEGARDE:-192.168.20.201}"       # pve-nipogi, Proxmox Backup Server (8007)
PORT_COEUR="${PORT_COEUR:-4321}"

UTILISATEUR=regie
IMAGE_TEST="docker.io/library/debian:trixie-slim"

dire() { printf '\033[1m[regie/lxc]\033[0m %s\n' "$*"; }
mourir() { printf '\033[1;31m[regie/lxc] %s\033[0m\n' "$*" >&2; exit 1; }

# ══ Côté hôte Proxmox ═════════════════════════════════════════════════════════

modele_debian13() {
  local modele
  modele="$(pveam list local | awk '{print $1}' | grep -E 'debian-13-standard_.*_amd64\.tar\.zst$' | sort -V | tail -n1 || true)"
  [[ -n "$modele" ]] || mourir "Aucun modèle Debian 13 dans le stockage local : pveam update puis pveam download local debian-13-standard_…"
  echo "$modele"
}

verifier_subid() {
  # La plage est déjà élargie pour le CT 130 (deploiement/forgejo/installer.sh) ; on ne fait que vérifier.
  local fichier
  for fichier in /etc/subuid /etc/subgid; do
    local plage
    plage="$(grep -E '^root:100000:' "$fichier" | head -n1 | cut -d: -f3 || true)"
    [[ -n "$plage" ]] && (( plage >= PLAGE_IDMAP )) ||
      mourir "$fichier : il faut root:100000:${PLAGE_IDMAP} (lance d'abord deploiement/forgejo/installer.sh ou ajuste à la main)."
  done
}

ecrire_pare_feu() {
  local fichier="/etc/pve/firewall/${CTID}.fw"
  cat >"$fichier" <<EOF
# regie — pare-feu du CT ${CTID} (${NOM_CT}).
# Entrée : le cœur depuis nginx seulement. Sortie : Internet, nginx, Authentik et la sauvegarde ; le reste du réseau local est refusé.
# Écrit par deploiement/infra/lxc-regie.sh ; toute modification manuelle sera écrasée.
[OPTIONS]
enable: 1
policy_in: DROP
policy_out: DROP

[IPSET internet] # tout sauf les réseaux privés, locaux et réservés
0.0.0.0/1
128.0.0.0/1
!10.0.0.0/8
!100.64.0.0/10
!127.0.0.0/8
!169.254.0.0/16
!172.16.0.0/12
!192.168.0.0/16
!224.0.0.0/3

[RULES]
IN ACCEPT -source ${NGINX} -p tcp -dport ${PORT_COEUR} -log nolog # nginx → cœur
OUT ACCEPT -dest +internet -log nolog # Internet (DNS, paquets, images, Meta)
OUT ACCEPT -dest ${NGINX} -p tcp -dport 80,443 -log nolog # nginx
OUT ACCEPT -dest ${AUTHENTIK} -p tcp -dport 9000 -log nolog # Authentik
OUT ACCEPT -dest ${SAUVEGARDE} -p tcp -dport 8007 -log nolog # Proxmox Backup Server
OUT DROP -log info # tout le reste, journalisé
EOF
  dire "Pare-feu écrit : $fichier (entrée et sortie refusées par défaut)"
}

hote() {
  [[ "$(id -u)" -eq 0 ]] || mourir "À lancer en root sur l'hôte Proxmox."
  command -v pct >/dev/null || mourir "pct introuvable : ce n'est pas un hôte Proxmox."
  grep -qE '^\s*enable:\s*1' /etc/pve/firewall/cluster.fw 2>/dev/null ||
    mourir "Le pare-feu du centre de données est inactif : les règles du CT ne s'appliqueraient pas."
  [[ -c "$RENDU" ]] || mourir "$RENDU introuvable sur l'hôte : la carte Arc n'est pas visible."
  verifier_subid

  local pont tag
  pont="$(pct config "$CT_MODELE_RESEAU" | sed -nE 's/^net0:.*bridge=([^,]+).*/\1/p')"
  tag="$(pct config "$CT_MODELE_RESEAU" | sed -nE 's/^net0:.*tag=([0-9]+).*/\1/p')"
  [[ -n "$pont" ]] || mourir "Impossible de lire le pont réseau du CT ${CT_MODELE_RESEAU}."
  local reseau_ct="name=eth0,bridge=${pont},ip=${ADRESSE}/${MASQUE},gw=${PASSERELLE},firewall=1${tag:+,tag=${tag}}"

  if pct status "$CTID" >/dev/null 2>&1; then
    dire "CT ${CTID} déjà présent : mise à niveau de sa configuration."
    pct set "$CTID" --cores "$COEURS" --memory "$MEMOIRE_MO" --features nesting=1,keyctl=1 \
      --net0 "$reseau_ct" --nameserver "$DNS" --onboot 1 --dev0 /dev/net/tun,mode=0666
  else
    ping -c1 -W1 "$ADRESSE" >/dev/null 2>&1 && mourir "${ADRESSE} répond déjà : adresse occupée."
    local modele
    modele="$(modele_debian13)"
    dire "Création du CT ${CTID} (${NOM_CT}) depuis ${modele}."
    pct create "$CTID" "$modele" \
      --hostname "$NOM_CT" --unprivileged 1 --ostype debian \
      --cores "$COEURS" --memory "$MEMOIRE_MO" --swap 512 \
      --rootfs "${STOCKAGE}:${DISQUE_GO}" \
      --features nesting=1,keyctl=1 \
      --net0 "$reseau_ct" --nameserver "$DNS" --onboot 1 --start 0 \
      --dev0 /dev/net/tun,mode=0666   # réseau des conteneurs rootless (pasta)
  fi

  local conf="/etc/pve/lxc/${CTID}.conf"
  if ! grep -q '^lxc.idmap:' "$conf"; then
    pct status "$CTID" | grep -q stopped || pct stop "$CTID"
    {
      echo "lxc.idmap: u 0 100000 ${PLAGE_IDMAP}"
      echo "lxc.idmap: g 0 100000 ${PLAGE_IDMAP}"
    } >>"$conf"
    dire "idmap élargi à ${PLAGE_IDMAP} identifiants (Podman rootless)."
  fi

  ecrire_pare_feu

  # /dev/dri : le gid est celui du groupe render *dans* le CT, lu au premier démarrage.
  pct status "$CTID" | grep -q running || pct start "$CTID"
  local gid_render
  gid_render="$(pct exec "$CTID" -- getent group render | cut -d: -f3 || true)"
  [[ -n "$gid_render" ]] || mourir "Groupe render absent du CT ${CTID}."
  if ! pct config "$CTID" | grep -qE "^dev1: ${RENDU},gid=${gid_render}"; then
    pct set "$CTID" --dev1 "${RENDU},gid=${gid_render},mode=0660"
    pct reboot "$CTID"
    dire "${RENDU} transmis au CT avec le gid ${gid_render} (render)."
  fi

  local reseau_pret=""
  for _ in $(seq 1 30); do
    if pct exec "$CTID" -- getent hosts deb.debian.org >/dev/null 2>&1; then reseau_pret=1; break; fi
    sleep 2
  done
  [[ -n "$reseau_pret" ]] || mourir "Le CT ${CTID} n'a pas de réseau (deb.debian.org introuvable) après 60 s."

  pct push "$CTID" "$0" /root/lxc-regie.sh --perms 0700
  pct exec "$CTID" -- env LC_ALL=C.UTF-8 /root/lxc-regie.sh conteneur

  dire "Terminé. Contrôles :"
  dire "  pct exec ${CTID} -- /root/lxc-regie.sh tester-gpu"
  dire "  pct reboot ${CTID} && sleep 20 && pct exec ${CTID} -- /root/lxc-regie.sh tester-boot"
}

# ══ Dans le conteneur ═════════════════════════════════════════════════════════

en_regie() {
  # Commande systemd --user / podman en tant que regie, sans session ouverte.
  local uid
  uid="$(id -u "$UTILISATEUR")"
  cd "/home/${UTILISATEUR}"   # podman refuse de démarrer depuis /root
  runuser -u "$UTILISATEUR" -- env XDG_RUNTIME_DIR="/run/user/${uid}" \
    DBUS_SESSION_BUS_ADDRESS="unix:path=/run/user/${uid}/bus" HOME="/home/${UTILISATEUR}" "$@"
}

conteneur() {
  [[ "$(stat -fc %T /sys/fs/cgroup)" == cgroup2fs ]] || mourir "cgroups v2 absents du CT."
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -qq
  apt-get install -y -qq --no-install-recommends \
    ca-certificates curl podman uidmap passt fuse-overlayfs dbus-user-session systemd-container >/dev/null
  dire "Podman $(podman --version | awk '{print $3}') installé."

  id "$UTILISATEUR" >/dev/null 2>&1 ||
    adduser --shell /bin/bash --gecos 'regie' --disabled-password --home "/home/${UTILISATEUR}" "$UTILISATEUR"
  usermod -aG render,video "$UTILISATEUR"
  grep -q "^${UTILISATEUR}:" /etc/subuid || echo "${UTILISATEUR}:100000:65536" >>/etc/subuid
  grep -q "^${UTILISATEUR}:" /etc/subgid || echo "${UTILISATEUR}:100000:65536" >>/etc/subgid

  # Podman rootless attend network-online.target au boot ; dans le modèle Debian, personne ne le
  # demande et les conteneurs Quadlet restent en attente indéfiniment.
  systemctl add-wants multi-user.target network-online.target

  local uid
  uid="$(id -u "$UTILISATEUR")"
  loginctl enable-linger "$UTILISATEUR"
  systemctl start "user@${uid}.service"

  # Conteneur de test : démarré par Quadlet au boot, sans session ouverte (NFR-7).
  local dossier="/home/${UTILISATEUR}/.config/containers/systemd"
  install -d -o "$UTILISATEUR" -g "$UTILISATEUR" "/home/${UTILISATEUR}/.config" "/home/${UTILISATEUR}/.config/containers" "$dossier"
  cat >"${dossier}/regie-test.container" <<EOF
# regie — conteneur de test de l'histoire 0.2 : prouve le démarrage au boot sans session.
[Container]
ContainerName=regie-test
Image=${IMAGE_TEST}
Exec=sleep infinity

[Service]
Restart=always

[Install]
WantedBy=default.target
EOF
  chown "$UTILISATEUR:$UTILISATEUR" "${dossier}/regie-test.container"
  en_regie systemctl --user daemon-reload
  en_regie systemctl --user start regie-test.service
  dire "Conteneur Quadlet regie-test démarré (utilisateur ${UTILISATEUR}, linger actif)."
}

tester_boot() {
  local etat
  etat="$(en_regie systemctl --user is-active regie-test.service || true)"
  [[ "$etat" == active ]] || mourir "regie-test n'est pas actif (${etat})."
  # La session « manager » est celle du linger ; seule une session « user » fausserait le test.
  loginctl list-sessions --no-legend | awk '$5 == "user"' | grep -q . && dire "Attention : une session est ouverte, le test est moins probant."
  dire "regie-test actif sans action manuelle : $(en_regie podman ps --format '{{.Names}} {{.Status}}')"
}

tester_gpu() {
  [[ -c /dev/dri/renderD128 ]] || mourir "/dev/dri/renderD128 absent du CT."
  # Conteneur rootless : Debian trixie, pilote iHD (non-free) et ffmpeg, encodage H.264 par VAAPI.
  en_regie podman run --rm --device /dev/dri/renderD128 --group-add keep-groups "$IMAGE_TEST" bash -ec '
    sed -i "s/^Components: main$/Components: main non-free non-free-firmware/" /etc/apt/sources.list.d/debian.sources
    apt-get update -qq && DEBIAN_FRONTEND=noninteractive apt-get install -y -qq --no-install-recommends \
      ffmpeg intel-media-va-driver-non-free vainfo >/dev/null
    export LIBVA_DRIVER_NAME=iHD
    vainfo --display drm --device /dev/dri/renderD128 2>/dev/null | grep -E "Driver version|VAProfileH264.*EncSlice" | head -n3
    ffmpeg -hide_banner -loglevel error -vaapi_device /dev/dri/renderD128 \
      -f lavfi -i testsrc2=size=1920x1080:rate=30 -t 10 \
      -vf "format=nv12,hwupload" -c:v h264_vaapi -b:v 6M /tmp/test.mp4
    ffprobe -v error -show_entries stream=codec_name,width,height -of csv=p=0 /tmp/test.mp4
    echo "Encodage VAAPI sur l Arc : réussi."'
}

case "${1:-hote}" in
  hote) hote ;;
  conteneur) conteneur ;;
  tester-gpu) tester_gpu ;;
  tester-boot) tester_boot ;;
  *) mourir "Sous-commande inconnue : $1 (hote | conteneur | tester-gpu | tester-boot)" ;;
esac
