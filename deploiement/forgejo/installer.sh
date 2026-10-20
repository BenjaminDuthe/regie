#!/usr/bin/env bash
# regie — installation rejouable de Forgejo et de forgejo-runner dans le CT 130 « forgejo ».
#
# Usage (en root sur l'hôte Proxmox `pve`) :
#   RESEAU_WIREGUARD=10.10.0.0/24 ./installer.sh           # crée ou met à niveau le CT, puis l'installe
#   pct exec 130 -- /root/installer.sh creer-admin          # crée le compte administrateur (mot de passe à usage unique)
#   pct exec 130 -- /root/installer.sh enregistrer-runner   # Benjamin colle le jeton du runner (saisie masquée)
#
# Sous-commandes :
#   hote                 (défaut) côté hôte : CT, idmap élargi, pare-feu, puis lance « conteneur » dans le CT
#   conteneur            dans le CT : paquets, utilisateurs, binaires vérifiés, unités systemd
#   creer-admin          dans le CT : crée le compte administrateur en ligne de commande
#   enregistrer-runner   dans le CT : enregistre le runner avec un jeton saisi au clavier
#
# Aucun secret dans ce script : les clés internes de Forgejo sont générées dans le CT,
# le mot de passe administrateur est tiré au hasard par Forgejo, les jetons sont saisis au clavier.
# La page d'installation web reste verrouillée (INSTALL_LOCK = true) : personne sur le réseau
# ne peut s'approprier le compte administrateur entre le démarrage et la première connexion.

set -euo pipefail
shopt -s inherit_errexit   # un échec dans $(…) arrête aussi le script

# ── Paramètres (surchargeables par l'environnement) ───────────────────────────
CTID="${CTID:-130}"
NOM_CT="${NOM_CT:-forgejo}"
STOCKAGE="${STOCKAGE:-local-nvme}"
DISQUE_GO="${DISQUE_GO:-30}"
COEURS="${COEURS:-2}"
MEMOIRE_MO="${MEMOIRE_MO:-3072}"
ADRESSE="${ADRESSE:-192.168.20.130}"
MASQUE="${MASQUE:-24}"
PASSERELLE="${PASSERELLE:-192.168.20.1}"
CT_MODELE_RESEAU="${CT_MODELE_RESEAU:-101}"           # CT dont on reprend le pont et le VLAN (nginx)
RESEAUX_LOCAUX="${RESEAUX_LOCAUX:-192.168.1.0/24 192.168.20.0/24}"
RESEAU_WIREGUARD="${RESEAU_WIREGUARD:-}"              # obligatoire côté hôte, ex. 10.10.0.0/24
PLAGE_IDMAP="${PLAGE_IDMAP:-231072}"                  # 65 536 pour le CT + 165 536 pour Podman rootless

# Versions épinglées, identiques à deploiement/versions.json (« outils »).
# FORGEJO_VERSION= ou RUNNER_VERSION= vide : dernière version stable publiée (pour préparer une montée).
FORGEJO_VERSION="${FORGEJO_VERSION-16.0.5}"
RUNNER_VERSION="${RUNNER_VERSION-13.2.0}"
# Clé de signature des versions de Forgejo et de forgejo-runner (documentation officielle).
CLE_GPG_FORGEJO="EB114F5E6C0DC2BCDD183550A4B61A2DC5923710"

PORT_HTTP=3000
UTILISATEUR_FORGEJO=git
UTILISATEUR_RUNNER=runner
IMAGE_RUNNER_PAR_DEFAUT="docker.io/library/node:26.5.0-trixie@sha256:0473e7dc433a1310f436edee02aa79737ec78a4b345433ab0963d4a256f9ad85"

dire() { printf '\033[1m[regie/forgejo]\033[0m %s\n' "$*"; }
mourir() { printf '\033[1;31m[regie/forgejo] %s\033[0m\n' "$*" >&2; exit 1; }

# ══ Côté hôte Proxmox ═════════════════════════════════════════════════════════

elargir_subid() {
  # Podman rootless dans un CT non privilégié a besoin d'identifiants au-delà de 65 535.
  local fichier="$1"
  if grep -qE '^root:' "$fichier" && ! grep -qE '^root:100000:' "$fichier"; then
    mourir "$fichier : la plage de root ne commence pas à 100000 ; ajuste-la à la main (root:100000:${PLAGE_IDMAP}) puis relance."
  fi
  if grep -qE "^root:100000:[0-9]+$" "$fichier"; then
    local actuelle
    actuelle="$(grep -E '^root:100000:' "$fichier" | head -n1 | cut -d: -f3)"
    if (( actuelle < PLAGE_IDMAP )); then
      cp -a "$fichier" "$fichier.avant-regie-forgejo"
      sed -i -E "s/^root:100000:[0-9]+$/root:100000:${PLAGE_IDMAP}/" "$fichier"
      dire "$fichier : root:100000:${actuelle} → root:100000:${PLAGE_IDMAP} (copie : $fichier.avant-regie-forgejo)"
    fi
  else
    echo "root:100000:${PLAGE_IDMAP}" >>"$fichier"
    dire "$fichier : ajout de root:100000:${PLAGE_IDMAP}"
  fi
}

modele_debian13() {
  local modele
  modele="$(pveam list local | awk '{print $1}' | grep -E 'debian-13-standard_.*_amd64\.tar\.zst$' | sort -V | tail -n1 || true)"
  if [[ -z "$modele" ]]; then
    pveam update >/dev/null
    local nom
    nom="$(pveam available --section system | awk '{print $2}' | grep -E '^debian-13-standard_.*_amd64\.tar\.zst$' | sort -V | tail -n1)"
    [[ -n "$nom" ]] || mourir "Aucun modèle officiel Debian 13 trouvé par pveam."
    pveam download local "$nom" >/dev/null
    modele="local:vztmpl/$nom"
  fi
  echo "$modele"
}

ecrire_pare_feu() {
  local fichier="/etc/pve/firewall/${CTID}.fw"
  {
    echo "# regie — pare-feu du CT ${CTID} (${NOM_CT}) : 3000 et 22 depuis le réseau local et WireGuard seulement."
    echo "# Écrit par deploiement/forgejo/installer.sh ; toute modification manuelle sera écrasée."
    echo "[OPTIONS]"
    echo "enable: 1"
    echo "policy_in: DROP"
    echo "policy_out: ACCEPT"
    echo
    echo "[RULES]"
    local reseau
    for reseau in $RESEAUX_LOCAUX $RESEAU_WIREGUARD; do
      echo "IN ACCEPT -source ${reseau} -p tcp -dport ${PORT_HTTP} -log nolog # Forgejo (web)"
      echo "IN ACCEPT -source ${reseau} -p tcp -dport 22 -log nolog # Forgejo (git par SSH)"
      echo "IN ACCEPT -source ${reseau} -p icmp -log nolog"
    done
  } >"$fichier"
  dire "Pare-feu écrit : $fichier (politique d'entrée DROP)"
}

hote() {
  [[ "$(id -u)" -eq 0 ]] || mourir "À lancer en root sur l'hôte Proxmox."
  command -v pct >/dev/null || mourir "pct introuvable : ce n'est pas un hôte Proxmox."
  [[ -n "$RESEAU_WIREGUARD" ]] || mourir "RESEAU_WIREGUARD manquant (ex. RESEAU_WIREGUARD=10.10.0.0/24 ./installer.sh)."

  # Le pare-feu d'un CT ne s'applique que si celui du centre de données est actif.
  # On ne l'active pas d'office : cela change les règles de l'hôte entier.
  if ! grep -qE '^\s*enable:\s*1' /etc/pve/firewall/cluster.fw 2>/dev/null; then
    mourir "Le pare-feu du centre de données est inactif : active-le (Centre de données → Pare-feu → Options) après avoir vérifié les règles de l'hôte, puis relance."
  fi

  local pont tag
  pont="$(pct config "$CT_MODELE_RESEAU" | sed -nE 's/^net0:.*bridge=([^,]+).*/\1/p')"
  tag="$(pct config "$CT_MODELE_RESEAU" | sed -nE 's/^net0:.*tag=([0-9]+).*/\1/p')"
  [[ -n "$pont" ]] || mourir "Impossible de lire le pont réseau du CT ${CT_MODELE_RESEAU}."
  local reseau_ct="name=eth0,bridge=${pont},ip=${ADRESSE}/${MASQUE},gw=${PASSERELLE},firewall=1${tag:+,tag=${tag}}"

  elargir_subid /etc/subuid
  elargir_subid /etc/subgid

  if pct status "$CTID" >/dev/null 2>&1; then
    dire "CT ${CTID} déjà présent : mise à niveau de sa configuration."
    pct set "$CTID" --cores "$COEURS" --memory "$MEMOIRE_MO" --features nesting=1,keyctl=1 --net0 "$reseau_ct" --onboot 1 \
      --dev0 /dev/net/tun,mode=0666
  else
    local modele
    modele="$(modele_debian13)"
    dire "Création du CT ${CTID} (${NOM_CT}) depuis ${modele}."
    pct create "$CTID" "$modele" \
      --hostname "$NOM_CT" --unprivileged 1 --ostype debian \
      --cores "$COEURS" --memory "$MEMOIRE_MO" --swap 512 \
      --rootfs "${STOCKAGE}:${DISQUE_GO}" \
      --features nesting=1,keyctl=1 \
      --net0 "$reseau_ct" --onboot 1 --start 0 \
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

  pct status "$CTID" | grep -q running || pct start "$CTID"
  # Attendre le réseau du CT.
  local reseau_pret=""
  for _ in $(seq 1 30); do
    if pct exec "$CTID" -- getent hosts deb.debian.org >/dev/null 2>&1; then
      reseau_pret=1
      break
    fi
    sleep 2
  done
  [[ -n "$reseau_pret" ]] || mourir "Le CT ${CTID} n'a pas de réseau (deb.debian.org introuvable) après 60 s."

  pct push "$CTID" "$0" /root/installer.sh --perms 0700
  pct exec "$CTID" -- env LC_ALL=C.UTF-8 CTID="$CTID" FORGEJO_VERSION="$FORGEJO_VERSION" RUNNER_VERSION="$RUNNER_VERSION" \
    ADRESSE="$ADRESSE" /root/installer.sh conteneur

  dire "Terminé. À faire par Benjamin, dans l'ordre (voir deploiement/forgejo/README.md) :"
  dire "  1. pct exec ${CTID} -- /root/installer.sh creer-admin   (puis changer le mot de passe à la connexion)"
  dire "  2. Administration du site → Actions → Runners → créer un jeton d'enregistrement."
  dire "  3. pct exec ${CTID} -- /root/installer.sh enregistrer-runner   (coller le jeton, saisie masquée)"
  dire "  4. Créer le dépôt regie, puis le miroir poussé vers GitHub (jeton GitHub saisi dans l'interface)."
}

# ══ Dans le conteneur ═════════════════════════════════════════════════════════

derniere_version() {
  # $1 = URL de l'API des versions (Forgejo ou Gitea) ; rend la dernière version stable, sans « v ».
  curl -fsSL "$1?limit=20" |
    python3 -c 'import json,sys; print(next(r["tag_name"].lstrip("v") for r in json.load(sys.stdin) if not r["prerelease"] and not r["draft"]))'
}

telecharger_verifie() {
  # $1 = URL du binaire, $2 = destination. Vérifie SHA-256 puis signature GPG avant d'installer.
  local url="$1" destination="$2" travail nom
  travail="$(mktemp -d)"
  nom="$(basename "$url")"
  echec() { rm -rf "$travail"; mourir "$1"; }
  curl -fsSL -o "$travail/$nom" "$url" || echec "Téléchargement impossible : $url"
  curl -fsSL -o "$travail/$nom.sha256" "$url.sha256" || echec "Somme SHA-256 introuvable pour $nom."
  curl -fsSL -o "$travail/$nom.asc" "$url.asc" || echec "Signature GPG introuvable pour $nom."
  (cd "$travail" && sha256sum -c "$nom.sha256") || echec "Somme SHA-256 fausse pour $nom."
  export GNUPGHOME="$travail/gnupg"
  mkdir -m 700 "$GNUPGHOME"
  gpg --batch --quiet --keyserver hkps://keys.openpgp.org --recv-keys "$CLE_GPG_FORGEJO" ||
    echec "Clé GPG introuvable : $CLE_GPG_FORGEJO"
  gpg --batch --status-fd 1 --verify "$travail/$nom.asc" "$travail/$nom" 2>/dev/null |
    grep -qE "^\[GNUPG:\] VALIDSIG .* ${CLE_GPG_FORGEJO}\$" || echec "Signature GPG invalide pour $nom."
  unset GNUPGHOME
  install -m 0755 "$travail/$nom" "$destination"
  rm -rf "$travail"
  dire "$nom : somme SHA-256 et signature GPG vérifiées → $destination"
}

ecrire_si_absent() {
  # N'écrase jamais un fichier existant (rejouable sans perdre de réglage).
  local fichier="$1"
  if [[ -e "$fichier" ]]; then
    cat >/dev/null
  else
    cat >"$fichier"
  fi
}

conteneur() {
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -qq
  apt-get install -y -qq --no-install-recommends \
    ca-certificates curl git gnupg python3 sqlite3 openssh-server \
    podman uidmap passt fuse-overlayfs dbus-user-session systemd-container >/dev/null

  FORGEJO_VERSION="${FORGEJO_VERSION:-$(derniere_version https://codeberg.org/api/v1/repos/forgejo/forgejo/releases)}"
  RUNNER_VERSION="${RUNNER_VERSION:-$(derniere_version https://code.forgejo.org/api/v1/repos/forgejo/runner/releases)}"
  dire "Forgejo ${FORGEJO_VERSION}, forgejo-runner ${RUNNER_VERSION}."

  # ── Utilisateurs dédiés ──
  id "$UTILISATEUR_FORGEJO" >/dev/null 2>&1 ||
    adduser --system --shell /bin/bash --gecos 'Forgejo' --group --disabled-password --home /home/git "$UTILISATEUR_FORGEJO"
  id "$UTILISATEUR_RUNNER" >/dev/null 2>&1 ||
    adduser --shell /bin/bash --gecos 'forgejo-runner' --disabled-password --home /home/runner "$UTILISATEUR_RUNNER"
  # Plage subuid/subgid du runner, dans les identifiants que l'idmap élargi donne au CT.
  grep -q "^${UTILISATEUR_RUNNER}:" /etc/subuid || echo "${UTILISATEUR_RUNNER}:100000:65536" >>/etc/subuid
  grep -q "^${UTILISATEUR_RUNNER}:" /etc/subgid || echo "${UTILISATEUR_RUNNER}:100000:65536" >>/etc/subgid

  # ── Forgejo (SQLite) ──
  local installe_forgejo=""
  [[ -x /usr/local/bin/forgejo ]] && installe_forgejo="$(/usr/local/bin/forgejo --version | sed -nE 's/^[Ff]orgejo version ([0-9]+\.[0-9]+\.[0-9]+).*/\1/p')"
  if [[ "$installe_forgejo" != "$FORGEJO_VERSION" ]]; then
    telecharger_verifie \
      "https://codeberg.org/forgejo/forgejo/releases/download/v${FORGEJO_VERSION}/forgejo-${FORGEJO_VERSION}-linux-amd64" \
      /usr/local/bin/forgejo
  fi
  install -d -o "$UTILISATEUR_FORGEJO" -g "$UTILISATEUR_FORGEJO" -m 0750 /var/lib/forgejo
  install -d -o root -g "$UTILISATEUR_FORGEJO" -m 0770 /etc/forgejo
  if [[ ! -e /etc/forgejo/app.ini ]]; then   # n'écrase jamais un app.ini existant
    local cle_secrete jeton_interne
    cle_secrete="$(/usr/local/bin/forgejo generate secret SECRET_KEY)"
    jeton_interne="$(/usr/local/bin/forgejo generate secret INTERNAL_TOKEN)"
    cat >/etc/forgejo/app.ini <<EOF
; regie — Forgejo du CT ${CTID:-130}. Installation verrouillée : pas de page d'installation web.
; Les clés internes ci-dessous sont générées dans le CT à la première installation, jamais versionnées.
APP_NAME = Forgejo regie
RUN_USER = ${UTILISATEUR_FORGEJO}
RUN_MODE = prod
WORK_PATH = /var/lib/forgejo

[server]
PROTOCOL = http
HTTP_ADDR = 0.0.0.0
HTTP_PORT = ${PORT_HTTP}
DOMAIN = ${ADRESSE}
ROOT_URL = http://${ADRESSE}:${PORT_HTTP}/
SSH_DOMAIN = ${ADRESSE}
SSH_PORT = 22
START_SSH_SERVER = false
OFFLINE_MODE = true

[database]
DB_TYPE = sqlite3
PATH = /var/lib/forgejo/data/forgejo.db

[service]
DISABLE_REGISTRATION = true
REQUIRE_SIGNIN_VIEW = true

[actions]
ENABLED = true

[mirror]
; Le dépôt est un miroir tiré de GitHub (histoire 0.4) : un commit arrive en moins de 10 minutes.
MIN_INTERVAL = 5m
DEFAULT_INTERVAL = 5m

[migrations]
; Seul GitHub peut servir de source de miroir ou de migration.
ALLOWED_DOMAINS = github.com

[security]
INSTALL_LOCK = true
SECRET_KEY = ${cle_secrete}
INTERNAL_TOKEN = ${jeton_interne}
EOF
    unset cle_secrete jeton_interne
  fi
  # Un app.ini antérieur non verrouillé rouvrirait la page d'installation au redémarrage : on s'arrête.
  if ! grep -qE '^[[:space:]]*INSTALL_LOCK[[:space:]]*=[[:space:]]*true[[:space:]]*$' /etc/forgejo/app.ini; then
    systemctl stop forgejo 2>/dev/null || true
    mourir "/etc/forgejo/app.ini n'a pas INSTALL_LOCK = true : Forgejo est arrêté. Si aucun compte n'existe encore, supprime app.ini et relance ; sinon passe INSTALL_LOCK à true (avec SECRET_KEY et INTERNAL_TOKEN renseignés) puis relance."
  fi
  # /etc est en lecture seule pour Forgejo (ProtectSystem=full) : le secret JWT qu'il voudrait
  # écrire lui-même au premier démarrage est généré ici, une seule fois.
  if ! grep -qE '^[[:space:]]*JWT_SECRET[[:space:]]*=' /etc/forgejo/app.ini; then
    local secret_jwt
    secret_jwt="$(/usr/local/bin/forgejo generate secret JWT_SECRET)"
    printf '\n[oauth2]\nJWT_SECRET = %s\n' "$secret_jwt" >>/etc/forgejo/app.ini
    unset secret_jwt
  fi
  chown root:"$UTILISATEUR_FORGEJO" /etc/forgejo/app.ini
  chmod 0660 /etc/forgejo/app.ini

  cat >/etc/systemd/system/forgejo.service <<EOF
[Unit]
Description=Forgejo
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=${UTILISATEUR_FORGEJO}
Group=${UTILISATEUR_FORGEJO}
WorkingDirectory=/var/lib/forgejo/
ExecStart=/usr/local/bin/forgejo web --config /etc/forgejo/app.ini
Restart=always
Environment=USER=${UTILISATEUR_FORGEJO} HOME=/home/git FORGEJO_WORK_DIR=/var/lib/forgejo
NoNewPrivileges=true
ProtectSystem=full
PrivateTmp=true

[Install]
WantedBy=multi-user.target
EOF

  # ── forgejo-runner (Podman rootless) ──
  local installe_runner=""
  [[ -x /usr/local/bin/forgejo-runner ]] && installe_runner="$(/usr/local/bin/forgejo-runner --version | awk '{print $3}' | sed 's/^v//')"
  if [[ "$installe_runner" != "$RUNNER_VERSION" ]]; then
    telecharger_verifie \
      "https://code.forgejo.org/forgejo/runner/releases/download/v${RUNNER_VERSION}/forgejo-runner-${RUNNER_VERSION}-linux-amd64" \
      /usr/local/bin/forgejo-runner
  fi
  local uid_runner
  uid_runner="$(id -u "$UTILISATEUR_RUNNER")"
  loginctl enable-linger "$UTILISATEUR_RUNNER"
  systemctl start "user@${uid_runner}.service"
  systemctl --user -M "${UTILISATEUR_RUNNER}@" enable --now podman.socket

  ecrire_si_absent /home/runner/config.yml <<EOF
# regie — configuration de forgejo-runner (Podman rootless, sans socket monté dans les jobs).
log:
  level: info
runner:
  file: .runner
  capacity: 1
  timeout: 1h
container:
  # Réseau de l'hôte : les jobs joignent Forgejo sur http://${ADRESSE}:${PORT_HTTP}/.
  network: host
  privileged: false
  docker_host: "-"
  valid_volumes: []
EOF
  chown "$UTILISATEUR_RUNNER:$UTILISATEUR_RUNNER" /home/runner/config.yml

  cat >/etc/systemd/system/forgejo-runner.service <<EOF
[Unit]
Description=forgejo-runner (Podman rootless)
After=network-online.target forgejo.service user@${uid_runner}.service
Wants=network-online.target
ConditionPathExists=/home/runner/.runner

[Service]
Type=simple
User=${UTILISATEUR_RUNNER}
Group=${UTILISATEUR_RUNNER}
WorkingDirectory=/home/runner
Environment=XDG_RUNTIME_DIR=/run/user/${uid_runner}
Environment=DOCKER_HOST=unix:///run/user/${uid_runner}/podman/podman.sock
ExecStart=/usr/local/bin/forgejo-runner daemon --config /home/runner/config.yml
Restart=on-failure
NoNewPrivileges=true

[Install]
WantedBy=multi-user.target
EOF

  systemctl daemon-reload
  systemctl enable --now ssh
  systemctl enable forgejo
  systemctl restart forgejo   # prend en compte un nouveau binaire ou une unité modifiée
  systemctl enable forgejo-runner
  [[ -f /home/runner/.runner ]] && systemctl restart forgejo-runner

  dire "Forgejo ${FORGEJO_VERSION} actif sur http://${ADRESSE}:${PORT_HTTP}/ ; runner ${RUNNER_VERSION} installé, en attente d'enregistrement."
}

creer_admin() {
  # Compte administrateur créé en ligne de commande : la page d'installation web n'est jamais ouverte.
  # Forgejo tire le mot de passe au hasard et l'affiche une fois ; il doit être changé à la première connexion.
  local nom courriel
  read -r -p "Identifiant du compte administrateur : " nom
  read -r -p "Adresse électronique du compte administrateur : " courriel
  [[ -n "$nom" && -n "$courriel" ]] || mourir "Identifiant ou adresse vide."
  runuser -u "$UTILISATEUR_FORGEJO" -- env HOME=/home/git FORGEJO_WORK_DIR=/var/lib/forgejo \
    /usr/local/bin/forgejo --config /etc/forgejo/app.ini admin user create \
    --admin --username "$nom" --email "$courriel" --random-password --must-change-password
  dire "Compte « $nom » créé : connecte-toi sur http://${ADRESSE}:${PORT_HTTP}/ avec le mot de passe affiché ci-dessus, puis change-le."
}

enregistrer_runner() {
  [[ -f /home/runner/.runner ]] && { dire "Runner déjà enregistré (/home/runner/.runner)."; exit 0; }
  local jeton
  read -r -s -p "Jeton d'enregistrement du runner (copié depuis Forgejo) : " jeton
  echo
  [[ -n "$jeton" ]] || mourir "Jeton vide."
  # Le jeton est saisi au clavier : il n'est écrit ni dans ce script, ni dans l'historique du shell.
  enregistrer_runner_depuis_stdin <<<"$jeton"
  unset jeton
}

enregistrer_runner_depuis_stdin() {
  # Le jeton arrive sur l'entrée standard : il n'apparaît dans aucune ligne de commande du CT.
  # shellcheck disable=SC2016  # $1…$3 et $jeton sont développés par le bash du runner, pas ici.
  runuser -u "$UTILISATEUR_RUNNER" -- bash -c 'cd /home/runner && read -r jeton && [[ -n "$jeton" ]] &&
    exec /usr/local/bin/forgejo-runner register --no-interactive --config config.yml \
      --instance "$1" --name "$2" --labels "$3" --token "$jeton"' _ \
    "http://${ADRESSE}:${PORT_HTTP}" "forgejo-ct${CTID}" "docker:docker://${IMAGE_RUNNER_PAR_DEFAUT}" \
    >/dev/null || mourir "Enregistrement du runner refusé."
  systemctl restart forgejo-runner
  dire "Runner enregistré et démarré (étiquette « docker »)."
}

forgejo_cli() {
  runuser -u "$UTILISATEUR_FORGEJO" -- env HOME=/home/git FORGEJO_WORK_DIR=/var/lib/forgejo \
    /usr/local/bin/forgejo --config /etc/forgejo/app.ini "$@"
}

amorcer() {
  # Sans aucune saisie, et sans qu'aucun secret ne s'affiche :
  #   1. compte administrateur, mot de passe tiré au hasard et jeté (à redéfinir avec
  #      « forgejo admin user change-password » avant la première connexion) ;
  #   2. runner enregistré avec un jeton tiré par la CLI et passé par un tube ;
  #   3. dépôt regie, miroir des branches et étiquettes de GitHub toutes les 5 minutes, Actions
  #      actives, créé par l'API avec des jetons à usage unique supprimés aussitôt.
  local admin="${ADMIN:-BenjaminDuthe}" courriel="${COURRIEL:?COURRIEL manquant}"
  local source_miroir="${SOURCE_MIROIR:-https://github.com/BenjaminDuthe/regie.git}"
  local base="http://${ADRESSE}:${PORT_HTTP}"

  if forgejo_cli admin user list --admin | awk 'NR>1 {print $2}' | grep -qx "$admin"; then
    dire "Compte administrateur « $admin » déjà présent."
  else
    forgejo_cli admin user create --admin --username "$admin" --email "$courriel" \
      --random-password --must-change-password >/dev/null
    dire "Compte « $admin » créé ; son mot de passe aléatoire n'a pas été affiché."
  fi

  if [[ -f /home/runner/.runner ]]; then
    dire "Runner déjà enregistré."
  else
    # Jeton d'enregistrement tiré par la CLI et passé par un tube, jamais affiché.
    forgejo_cli actions generate-runner-token | enregistrer_runner_depuis_stdin
  fi

  local depot="/var/lib/forgejo/data/forgejo-repositories/${admin,,}/regie.git"
  if requete_sql "select 1 from repository where lower_name='regie' and is_mirror=1 and status=0" | grep -q 1; then
    dire "Miroir regie déjà présent."
  else
    python3 -I - "$source_miroir" "$admin" >/root/migration.json <<'PY2'
import json, sys
print(json.dumps({"clone_addr": sys.argv[1], "repo_name": "regie", "repo_owner": sys.argv[2],
                  "service": "git", "mirror": True, "mirror_interval": "5m", "private": True,
                  "description": "Miroir de GitHub : CI de regie (histoire 0.4)"}))
PY2
    # Une migration interrompue laisse un dépôt bloqué (status ≠ 0) qui occupe le nom : on le retire.
    if requete_sql "select 1 from repository where lower_name='regie'" | grep -q 1; then
      appel_api "$admin" DELETE "/repos/${admin}/regie" >/dev/null
      dire "Dépôt regie d'une migration interrompue supprimé."
    fi
    local code
    code="$(appel_api "$admin" POST /repos/migrate /root/migration.json)"
    rm -f /root/migration.json
    [[ "$code" == 201 ]] || mourir "Création du miroir refusée (HTTP $code) : $(head -c 300 /root/reponse-api.json)"
    dire "Miroir ${admin}/regie créé depuis ${source_miroir} (toutes les 5 minutes)."
  fi

  # Code venu de forks : GitHub publie chaque PR sous refs/pull/*, et le miroir les tire par défaut
  # (+refs/*:refs/*). Seules les branches et les étiquettes sont gardées.
  runuser -u "$UTILISATEUR_FORGEJO" -- git -C "$depot" config --replace-all remote.origin.fetch '+refs/heads/*:refs/heads/*'
  runuser -u "$UTILISATEUR_FORGEJO" -- git -C "$depot" config --add remote.origin.fetch '+refs/tags/*:refs/tags/*'
  runuser -u "$UTILISATEUR_FORGEJO" -- git -C "$depot" for-each-ref --format='delete %(refname)' refs/pull/ |
    runuser -u "$UTILISATEUR_FORGEJO" -- git -C "$depot" update-ref --stdin
  dire "Miroir limité aux branches et aux étiquettes ; refs/pull/* retirées."

  # Unité Actions (type 10) : un dépôt migré ne l'a pas.
  if requete_sql "select 1 from repo_unit u join repository r on r.id=u.repo_id where r.lower_name='regie' and u.type=10" | grep -q 1; then
    dire "Actions déjà actives sur regie."
  else
    printf '{"has_actions": true}' >/root/actions.json
    local code
    code="$(appel_api "$admin" PATCH "/repos/${admin}/regie" /root/actions.json)"
    rm -f /root/actions.json
    [[ "$code" == 200 ]] || mourir "Activation des Actions refusée (HTTP $code) : $(head -c 300 /root/reponse-api.json)"
    dire "Actions activées sur regie."
  fi
  rm -f /root/reponse-api.json
}

requete_sql() {
  runuser -u "$UTILISATEUR_FORGEJO" -- sqlite3 /var/lib/forgejo/data/forgejo.db "$1"
}

appel_api() {
  # Appel d'API avec un jeton à usage unique, créé par la CLI et supprimé aussitôt. Le jeton passe
  # par l'entrée standard de curl, jamais par une ligne de commande. Affiche le code HTTP ; le
  # corps de la réponse est dans /root/reponse-api.json.
  local compte="$1" methode="$2" chemin="$3" corps="${4:-}" jeton nom code
  nom="amorce-$(date +%s%N)"
  jeton="$(forgejo_cli admin user generate-access-token --username "$compte" --token-name "$nom" \
    --scopes write:repository,write:user --raw)"
  # Un compte qui doit changer son mot de passe n'a droit à aucune action : l'obligation est
  # levée le temps de l'appel, puis remise.
  forgejo_cli admin user must-change-password --unset "$compte" >/dev/null
  code="$(printf 'Authorization: token %s\n' "$jeton" | curl -sS -o /root/reponse-api.json -w '%{http_code}' \
    -X "$methode" -H @- -H 'Content-Type: application/json' ${corps:+--data @"$corps"} \
    "http://${ADRESSE}:${PORT_HTTP}/api/v1${chemin}")" || code=000
  unset jeton
  forgejo_cli admin user must-change-password "$compte" >/dev/null
  requete_sql "delete from access_token where name='${nom}'"
  printf '%s' "$code"
}

case "${1:-hote}" in
  hote) hote ;;
  conteneur) conteneur ;;
  creer-admin) creer_admin ;;
  enregistrer-runner) enregistrer_runner ;;
  amorcer) amorcer ;;
  *) mourir "Sous-commande inconnue : $1 (hote | conteneur | creer-admin | enregistrer-runner | amorcer)" ;;
esac
