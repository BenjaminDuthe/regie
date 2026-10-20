# `regie.etablia.fr` sur le nginx du CT 101 — histoire 0.3

Installé le 2026-10-20. Aucun secret.

| Fichier du dépôt | Emplacement dans le CT 101 |
|------------------|----------------------------|
| [`regie.conf`](regie.conf) | `/etc/nginx/sites-available/regie.etablia.fr.conf`, lien dans `sites-enabled` |
| [`regie-proxy.conf`](regie-proxy.conf) | `/etc/nginx/snippets/regie-proxy.conf` |
| [`attente.html`](attente.html) | `/var/www/regie/attente.html` |

## Chemin

Visiteur → Cloudflare → tunnel `cloudflared` du CT 101 → `https://localhost:443` → bloc `regie.etablia.fr` → cœur sur le CT 140, port 4321.

- **Nom exact.** `server_name regie.etablia.fr` passe avant le joker regex `*.etablia.fr` d'`etablia.conf`, qui n'est pas modifié.
- **Certificat.** Joker `etablia.fr` de Let's Encrypt, renouvelé par le timer certbot (défi DNS-01 chez Cloudflare). Il expire le 2027-01-15 et le timer le renouvelle avant.
- **Port 80.** Redirection 301 vers HTTPS.
- **Accès réservé à Cloudflare.** Le snippet `cloudflare-allow` refuse (403) tout ce qui n'arrive ni de Cloudflare ni du tunnel (localhost). L'adresse réelle du visiteur est reprise de `CF-Connecting-IP`, pour CrowdSec et les limites.
- **En-têtes.** HSTS, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, `Permissions-Policy` et une CSP stricte.
- **Limites.**
  - 50 requêtes par seconde et par adresse, rafale de 100 ;
  - 30 connexions simultanées ;
  - `/auth/` (retour OIDC) : 1 requête par seconde, rafale de 10 ;
  - au-delà : réponse 429.
- **Journaux.**
  - Le format `regie` n'écrit que le chemin, coupé avant `?` : un code OIDC ou un jeton passé en paramètre n'y apparaît jamais.
  - Le journal d'erreurs, qui recopie la requête complète, ne garde que le niveau `crit`.
- **Page d'attente.** Si le cœur ne répond pas (502, 503 ou 504), toute adresse, `/sante` comprise, renvoie `attente.html` avec le code 503. Cette page ne charge rien d'extérieur et ne nomme aucun autre service.

## Contrôles faits le 2026-10-20 (dans le CT 101, par le chemin du tunnel)

| Contrôle | Résultat |
|----------|----------|
| `nginx -t`, puis rechargement | réussis |
| `/sante` | 503, page d'attente, en 1 s |
| `CF-Connecting-IP: 203.0.113.9` par localhost | journalisé avec `203.0.113.9` |
| `/auth/retour?code=…&state=…` | journal : `/auth/retour`, le code n'apparaît dans aucun journal |
| Accès direct à `192.168.20.17:443` depuis le réseau local | 403 |
| Écouteur temporaire sur le port 4321 du CT 140 | 200 en moins d'une milliseconde : le pare-feu laisse passer nginx → cœur |

Un port fermé du CT 140 ne renvoie pas de RST visible : le pare-feu Proxmox le jette. Le délai de connexion est donc fixé à 1 s pour que la page d'attente arrive vite.

## Route du tunnel (ajoutée le 2026-10-20)

Dans le tunnel `cloudflared` du CT 101 (*Networking → Tunnels → Routes*), une application publiée :

- `regie.etablia.fr` → `https://localhost:443` ;
- *TLS* : **Origin Server Name** = `regie.etablia.fr`, vérification du certificat active.

Cloudflare a créé l'enregistrement `regie` vers le tunnel. Il passe avant le joker DNS `*.etablia.fr`, qui envoie toujours les autres sous-domaines vers l'origine d'etablia.

**Port 80.** Le tunnel envoie aussi les requêtes `http://` vers `https://localhost:443` : le bloc 80 n'est donc pas atteint depuis Internet. La redirection vers HTTPS relève de l'option *Always Use HTTPS* de la zone, qui n'est pas activée, car elle toucherait tous les sites d'etablia.fr. HSTS couvre les visites suivantes.

## Contrôles faits le 2026-10-20 depuis Internet

| Contrôle | Résultat |
|----------|----------|
| DNS `regie.etablia.fr` | adresses Cloudflare |
| `https://regie.etablia.fr/sante` | 503, page d'attente, en 1,2 s |
| En-têtes | HSTS, `nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`, CSP, `Cache-Control: no-store` |
| 250 requêtes sur `/auth/`, 50 en parallèle | 238 × 429, 12 × 503 |
| Journal | adresse réelle du visiteur (IPv6), chemin `/auth/essai` sans paramètres ; le code de test n'apparaît dans aucun journal de nginx |
| `http://regie.etablia.fr/` | 503 par le tunnel, sans redirection (voir *Port 80*) |

## Revenir en arrière

Dans le CT 101 :

```sh
rm /etc/nginx/sites-enabled/regie.etablia.fr.conf
nginx -t && systemctl reload nginx
```

Côté Cloudflare : supprime la route `regie.etablia.fr` du tunnel, puis l'enregistrement DNS `regie` s'il reste.
