# Le CT 140 `regie` sur `pve-media` — histoire 0.2

Créé le 2026-10-20 par [`lxc-regie.sh`](lxc-regie.sh), rejouable. Aucun secret.

## Définition

| Réglage | Valeur |
|---------|--------|
| Identifiant, nom | `140`, `regie` |
| Système | Debian 13 (modèle officiel Proxmox), **non privilégié** |
| Options | `nesting=1,keyctl=1`, `onboot=1` |
| Ressources | 4 cœurs, 4 Go de mémoire (512 Mo de swap), 40 Go sur `local-nvme` |
| Réseau | `192.168.20.140/24`, passerelle `192.168.20.1`, DNS `1.1.1.1`, pont et VLAN repris du CT 101, `firewall=1` |
| idmap | `0 → 100000`, 231 072 identifiants (Podman rootless), comme le CT 130 |
| Périphériques | `/dev/net/tun` (réseau des conteneurs rootless) ; `/dev/dri/renderD128` de l'Arc B570, `gid=992` (`render` dans le CT), `mode=0660` |

**Pourquoi cette taille.** Le processeur de l'hôte est presque libre (16 fils, charge 0,4). La mémoire est juste : 15,4 Go en tout, les CT démarrés en réservent déjà 20 Go, et l'hôte utilise 4 Go de swap. Le disque `local-nvme` est surréservé : les disques de tous les CT promettent 761 Go, pour un pool de 355 Go dont 125 Go réellement libres. Si le pool se remplit, tous les CT se figent. Il faut donc le surveiller avant d'agrandir un disque.

## Dans le CT

- Podman 5.4.2 rootless, cgroups v2 (vérifié par le script).
- Utilisateur `regie`, membre de `render` et `video`, avec une plage `subuid`/`subgid` de 65 536 et le *linger* actif.
- `network-online.target` est ajouté à `multi-user.target`. Sans ça, Podman rootless attend ce réseau au démarrage, et dans le modèle Debian personne ne le demande : les conteneurs Quadlet restaient bloqués.
- Conteneur Quadlet de test `regie-test` (`~regie/.config/containers/systemd/regie-test.container`). Il sera retiré quand le cœur arrivera.

## Pare-feu (`/etc/pve/firewall/140.fw`)

Entrée et sortie refusées par défaut.

- **Entrée :** le port 4321 du cœur, depuis nginx (`192.168.20.17`) seulement.
- **Sortie :** Internet (IPv4 hors réseaux privés et réservés), nginx sur 80 et 443, Authentik sur 9000, `pve-nipogi` sur 8007 (Proxmox Backup Server). Le reste est refusé et journalisé.

## Contrôles faits le 2026-10-20

| Contrôle | Résultat |
|----------|----------|
| `tester-gpu` : ffmpeg dans un conteneur rootless, H.264 1080p par VAAPI | réussi, pilote iHD 25.2.3, l'Arc expose l'encodage H.264. Pas besoin du repli sur processeur. |
| `tester-boot` après `pct reboot 140` | `regie-test` actif sans aucune session utilisateur |
| Sorties autorisées | Internet, nginx 443 et Authentik 9000 : ouverts |
| Sorties interdites | interface Proxmox 8006, Forgejo 3000, Authelia 9091, `192.168.1.1` : fermés |
| Entrée | SSH 22 depuis le réseau local : fermé |

Deux limites :
- le CT n'a pas d'IPv6, donc tout passe en IPv4 ;
- aucun Proxmox Backup Server ne répond encore sur `pve-nipogi:8007`. La règle est prête pour le jour où il existera.

## Rejouer ou contrôler

```sh
scp deploiement/infra/lxc-regie.sh root@192.168.20.200:/root/
ssh root@192.168.20.200 /root/lxc-regie.sh
ssh root@192.168.20.200 pct exec 140 -- /root/lxc-regie.sh tester-gpu
ssh root@192.168.20.200 pct exec 140 -- /root/lxc-regie.sh tester-boot
```

Pour revenir en arrière : `pct stop 140 && pct destroy 140 --purge`, puis supprimer `/etc/pve/firewall/140.fw`. Aucun autre CT n'est touché.
