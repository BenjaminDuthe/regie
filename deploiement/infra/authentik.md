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

Les étapes 2 à 4 ont été faites par Claude dans Chrome, pendant que Benjamin était connecté. L'étape 5 manipule des secrets : elle reste à Benjamin.

1. ~~**Second facteur obligatoire.**~~ Fait le 2026-10-20 (voir « Ouverture au public »).
2. ~~**Fournisseur.**~~ Fait le 2026-10-22 par l'assistant d'application : `regie`, client **confidentiel**, retour `https://regie.etablia.fr/connexion/retour` en mode *strict*, portées `openid`, `profile` et `email`, flux `default-provider-authorization-explicit-consent`, clé `authentik Self-signed Certificate`. L'émetteur public répond (`.well-known/openid-configuration`, portées `email`, `openid`, `profile`).
3. ~~**Application.**~~ Faite le 2026-10-22 : nom `regie`, *slug* `regie`, fournisseur `regie`.
4. ~~**Accès.**~~ Fait le 2026-10-22. Aucun groupe n'est propre à Benjamin (seulement `authentik Admins`, `authentik Read-only` et les groupes `traiteur-*`) : l'application est donc liée au seul utilisateur `akadmin`, choisi par Benjamin.
5. **Secrets.** Copie le *Client ID* et le *Client Secret* dans Vaultwarden, dans une entrée `regie — OIDC Authentik`. Ne les colle ni dans le dépôt ni dans le chat.

**Qui est autorisé.** Règle `REGIE_ADMIN_SUB` (le `sub` Authentik de la personne) : c'est le réglage à préférer, et s'il est défini, seul le `sub` ouvre l'accès. `REGIE_ADMIN_EMAIL` n'est qu'un repli opt-in, utilisé seulement quand `REGIE_ADMIN_SUB` est absent : il n'est sûr que si Authentik garantit que `email_verified` est fiable (auto-inscription fermée, changement d'e-mail contrôlé par un administrateur). Sans cette garantie, ne l'utilise pas.

L'émetteur à donner au cœur sera `https://auth.sitecraft-it.com/application/o/regie/` (histoire 1.14).

## Ouverture au public (faite le 2026-10-19)

Benjamin a choisi d'ouvrir `auth.sitecraft-it.com` au public, derrière CrowdSec et le second facteur. Le trafic public arrive par le tunnel Cloudflare, sur le bloc HTTP du site dans le CT 101.

Ce qui a été fait dans le CT 101 :

1. **Bouncer nginx de CrowdSec réparé.** Son délai d'attente était trop court pour charger la liste des décisions : le cache restait vide et rien n'était bloqué. Le délai a été allongé.
2. **Bloc du tunnel.** nginx retrouve l'adresse réelle du visiteur, transmise par Cloudflare. Le bloc reprend les protections du bloc HTTPS : en-têtes de sécurité, limites de débit et de connexions, limite renforcée sur les flux d'authentification.
3. **Contrôle.** Une adresse bannie par une décision de test reçoit 403, les autres 200. Depuis Internet, le site répond 200 avec HSTS.

Les fichiers d'origine sont copiés dans le CT 101 (suffixe `.avant-regie-2026-10-19` ou `.avant-ouverture-2026-10-19`) pour revenir en arrière.

**Second facteur exigé (2026-10-20).** Benjamin a enrôlé son facteur. L'étape `default-authentication-mfa-validation` accepte TOTP, WebAuthn et les codes de secours. Un compte sans facteur est obligé d'en configurer un (TOTP ou WebAuthn) avant d'entrer. Le mot de passe d'`akadmin` a été changé et rangé dans Vaultwarden.

D'autres sites servis par le CT 101 sont touchés par le même problème d'adresse réelle. Leur cas est suivi hors de ce dépôt.
