# Forgejo et forgejo-runner — CT 130 « forgejo »

La CI de regie tourne sur un Forgejo auto-hébergé, joignable seulement depuis le réseau local et WireGuard. Le dépôt public GitHub reste la référence : Forgejo en tire un miroir toutes les 5 minutes, lance `.forgejo/workflows/ci.yaml` à chaque commit reçu, puis publie le résultat sur le commit GitHub (histoire 0.4).

## Ce que fait `installer.sh`

Sur l'hôte Proxmox `pve` (celui de l'Arc B570) :

- crée (ou remet à niveau) le CT 130 `forgejo` : non privilégié, Debian 13 (modèle officiel Proxmox), 2 cœurs, 3 Go de mémoire, 30 Go sur `local-nvme`, `nesting=1,keyctl=1`, 192.168.20.130/24 par 192.168.20.1, `firewall=1`, pont et VLAN repris du CT 101 `nginx` ;
- élargit l'idmap du CT (`/etc/subuid`, `/etc/subgid` et `lxc.idmap`, copie de sauvegarde des fichiers de l'hôte) pour que Podman rootless dispose de 65 536 identifiants ;
- écrit `/etc/pve/firewall/130.fw` : entrée refusée par défaut, 3000 (web) et 22 (git par SSH) acceptés depuis `192.168.1.0/24`, `192.168.20.0/24` et le réseau WireGuard seulement.

Dans le CT :

- utilisateurs dédiés `git` (Forgejo) et `runner` (forgejo-runner) ;
- binaires Forgejo et `forgejo-runner` téléchargés depuis les versions officielles (Codeberg et code.forgejo.org), installés seulement si la somme SHA-256 **et** la signature GPG (clé `EB114F5E6C0DC2BCDD183550A4B61A2DC5923710`) sont bonnes ;
- Forgejo en SQLite (`/var/lib/forgejo`), unité systemd `forgejo` ; inscriptions fermées, connexion exigée pour lire ; miroirs synchronisés toutes les 5 minutes, depuis `github.com` seulement ;
- secrets internes (`SECRET_KEY`, `INTERNAL_TOKEN`, `JWT_SECRET`) générés dans le CT : l'unité rend `/etc` en lecture seule, Forgejo ne peut pas les écrire lui-même ;
- forgejo-runner sur Podman rootless (socket utilisateur, `linger`), unité systemd `forgejo-runner`, aucun socket monté dans les jobs.

Le script est rejouable : il ne recrée pas un CT existant, n'écrase ni `app.ini` ni la configuration du runner, et ne retélécharge un binaire que si sa version change. Il ne contient aucun secret.

## Lancer l'installation

```sh
scp -J pve-nipogi deploiement/forgejo/installer.sh root@192.168.1.200:/root/
ssh -J pve-nipogi root@192.168.1.200
RESEAU_WIREGUARD=10.10.0.0/24 /root/installer.sh
```

Prérequis : le pare-feu du centre de données Proxmox doit être actif (sinon les règles du CT ne s'appliquent pas). Le script s'arrête en le disant plutôt que de l'activer à ta place.

Versions : épinglées dans le script et dans `deploiement/versions.json` (Forgejo 16.0.5, forgejo-runner 13.2.0). Pour préparer une montée de version, passe `FORGEJO_VERSION=` (vide : dernière version stable, affichée par le script) ou une version précise, puis reporte-la aux deux endroits.

Le CT reçoit `/dev/net/tun` (`dev0`) : Podman rootless en a besoin pour le réseau de ses conteneurs (pasta).

Installé le 2026-10-03 sur `pve` : CT 130, http://192.168.20.130:3000/.

## Verrouillage rattrapé le 2026-10-20

L'installation du 2026-10-03 avait été faite par une version antérieure du script : `INSTALL_LOCK = false`, page d'installation ouverte au réseau local et au WireGuard. Aucune base n'existait, donc aucun compte n'avait été créé. Forgejo a été arrêté, l'ancien `app.ini` mis de côté dans `/root/app.ini.non-verrouille-2026-10-20` (dans le CT), puis le script actuel rejoué : `/install` redirige et toute page exige une connexion.

## À faire par toi, Benjamin (jamais par Claude)

> La page d'installation web n'est jamais ouverte : `app.ini` est écrit avec `INSTALL_LOCK = true` et des clés internes générées dans le CT. Personne sur le réseau ne peut donc s'approprier le compte administrateur avant toi.

1. Crée le **compte administrateur** en ligne de commande. Forgejo tire un mot de passe au hasard et l'affiche une seule fois ; il est à changer à la première connexion sur `http://192.168.20.130:3000/` :
   ```sh
   ssh root@192.168.20.200 -t pct exec 130 -- /root/installer.sh creer-admin
   ```
2. *Administration du site → Actions → Runners → Créer un nouveau runner* : copie le **jeton d'enregistrement**.
3. Enregistre le runner (le jeton est saisi au clavier, masqué) :
   ```sh
   ssh root@192.168.20.200 -t pct exec 130 -- /root/installer.sh enregistrer-runner
   ```
4. **Miroir tiré de GitHub.** *+ → Nouvelle migration → GitHub* : URL `https://github.com/BenjaminDuthe/regie.git`, aucun jeton (le dépôt est public), case **Ce dépôt sera un miroir** cochée, intervalle `5m`. Vérifie ensuite que *Paramètres → Unités → Actions* est actif.
5. **Jeton de statut GitHub.** Sur GitHub, *Settings → Developer settings → Fine-grained tokens* : dépôt `BenjaminDuthe/regie` seulement, permission **Commit statuses: Read and write**, rien d'autre. Dans Forgejo, *dépôt regie → Paramètres → Actions → Secrets* : secret `GITHUB_STATUTS`. Range aussi le jeton dans Vaultwarden. Ne le colle ni dans le dépôt ni dans le chat.
6. **Protection de `main` sur GitHub.** *Settings → Branches → main* : exige le statut `forgejo/ci` avant la fusion.

Le job `statut-github` publie `success` seulement si `suites` et `python` passent ; sinon `failure`. Sans le secret, il échoue, et le commit GitHub reste sans statut : la protection de `main` bloque alors la fusion.

## Vérifier le pare-feu

- Depuis le réseau local ou WireGuard : `curl -sI http://192.168.20.130:3000/` répond.
- Depuis une autre source (autre VLAN, hors WireGuard) : la connexion au port 3000 doit échouer (paquet jeté).
- Règles en place : `pve-firewall status` et `iptables-save | grep -i veth130` sur l'hôte.
