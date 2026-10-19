# Authentik (CT 115 sur `pve-media`) — histoire 0.1

Authentik est le fournisseur d'identité OIDC de regie (FR-72, socle « Amendement du 2026-10-18 »). Il tourne dans le CT 115 `authentik` de `pve-media`, sous Docker : `authentik-server`, `authentik-worker` (image `ghcr.io/goauthentik/server:2025.10`), `authentik-postgres` et `authentik-redis`. Le même CT héberge aussi `authelia-media` (port 9091).

Aucun secret dans ce fichier : l'identifiant et le secret du client OIDC vont dans Vaultwarden (NFR-14).

## Passage sur le réseau actuel (fait le 2026-10-19)

| Réglage | Avant | Après |
|---------|-------|-------|
| `net0` | `ip=192.168.1.115/24,gw=192.168.1.200` | `ip=192.168.20.115/24,gw=192.168.20.1` (même `hwaddr=BC:24:11:FD:23:9B`, `vmbr0`) |
| `nameserver` | `192.168.1.120 1.1.1.1` (le premier ne répond plus) | `1.1.1.1` |
| `onboot` | `0` | `1` |
| État | arrêté | démarré, `/-/health/live/` répond 200 |

Côté nginx (CT 101), les relais vers Authentik et Authelia pointent maintenant sur `192.168.20.115` :

- `sites-available/auth.sitecraft-it.com` : `proxy_pass` vers `192.168.20.115:9000`, et `allow 192.168.20.0/24` ajouté à côté de `192.168.1.0/24` ;
- `sites-available/auth-media.sitecraft-it.com` et `snippets/authelia-media-location.conf` : `proxy_pass` vers `192.168.20.115:9091`.

### Revenir en arrière

Sur `pve-media` :

```sh
pct stop 115
pct rollback 115 avant-regie      # instantané pris juste avant le changement
# ou seulement le réseau : copie de la configuration dans /root/115.conf.avant-regie-2026-10-19
```

Dans le CT 101, les trois fichiers d'origine sont copiés dans `/root/nginx-avant-regie-2026-10-19/`. Pour revenir en arrière : les remettre en place, puis lancer `nginx -t && systemctl reload nginx`.

## À faire par Benjamin dans l'administration d'Authentik

Ces étapes passent par l'interface et manipulent des secrets. Claude ne les fait donc pas.

1. **Second facteur obligatoire.** *Flows & Stages → Stages*. Dans l'étape de validation de l'authentification (`default-authentication-mfa-validation`), choisis TOTP et WebAuthn, puis règle *Not configured action* sur **Force the user to configure an authenticator**. Enrôle ensuite ton propre facteur.
2. **Fournisseur.** *Applications → Providers → Create → OAuth2/OpenID Provider* :
   - nom `regie` ;
   - *Client type* : **Confidential** ;
   - *Redirect URIs* : `https://regie.etablia.fr/auth/retour` (en mode *strict*) ;
   - portées `openid`, `profile` et `email` ;
   - clé de signature : celle par défaut.
3. **Application.** *Applications → Create* : nom `regie`, *slug* `regie`, fournisseur `regie`.
4. **Accès.** Dans l'onglet *Policy / Group / User Bindings* de l'application, lie **seulement ton groupe**. Sans liaison, Authentik laisse entrer tous les utilisateurs.
5. **Secrets.** Copie le *Client ID* et le *Client Secret* dans Vaultwarden, dans une entrée `regie — OIDC Authentik`. Ne les colle ni dans le dépôt ni dans le chat.

L'émetteur à donner au cœur sera `https://auth.sitecraft-it.com/application/o/regie/` (histoire 1.14).

## Point ouvert : se connecter hors du réseau local

`auth.sitecraft-it.com` n'accepte que `127.0.0.1`, `192.168.1.0/24` et `192.168.20.0/24` (`deny all` pour le reste). La connexion OIDC passe par le navigateur. Depuis Internet, ou par WireGuard (`10.10.0.0/24`), la page de connexion répondra donc 403 et regie ne sera pas utilisable « de partout ». La décision est à prendre avant l'histoire 1.14 : ouvrir le site au public, derrière CrowdSec et le second facteur, ou n'ajouter que le réseau WireGuard.
