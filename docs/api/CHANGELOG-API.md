# Journal des changements de l’API et du MCP

Chaque ajout, changement ou retrait d’une action y est noté, avec la date. Un test vérifie que chaque action du
registre y figure (`coeur/test/api.test.ts`).

## 2026-10-21 — histoire 1.11

- Ajout de `espace.lister` (lecture) : tes espaces.
- Ajout de `jeton.lister` (lecture) : tes jetons d’API, jamais leur valeur.
- Ajout de `jeton.revoquer` (écriture) : révoque un de tes jetons.
- `jeton.creer` existe pour l’interface seulement (raison dans `coeur/src/services/exceptions-parite.ts`).

## 2026-10-21 — histoire 1.12

- Ajout de `connexion.lister` (lecture) : tes connexions de Claude, jamais un jeton.
- Ajout de `connexion.revoquer` (écriture) : révoque une connexion, son prochain appel est refusé.
- Le serveur MCP répond sur `/mcp` (HTTP streamable, JSON-RPC 2.0, sans état). Jeton Bearer : jeton d’API (1.11) ou jeton OAuth.
- Métadonnées OAuth sur `/.well-known/oauth-protected-resource`, `/.well-known/oauth-authorization-server` ; `POST /oauth/register` et `POST /oauth/token`.

## 2026-10-21 — histoire 2.5

- Ajout de `tache.lister` (lecture) : tes dernières tâches avec état, étape, position dans la file, heure de fin estimée (une estimation, pas une promesse), cause et action en cas d’échec.
- Ajout de `tache.lire` (lecture) : une de tes tâches avec l’historique de ses tentatives.
- Le suivi en direct de l’interface passe par `GET /flux/taches` (session seulement, flux d’événements) : il n’est pas offert à l’API, qui lit `tache.lister`.
## 2026-10-21 — histoire 2.6

- Ajout de `tache.relancer` (écriture) : relance une de tes étapes en échec. Elle repart sans renvoyer tes rushes et garde l’historique de ses tentatives ; regie ne relance jamais seul.
- Ajout de `notification.lister` (lecture) : tes notifications (étape en échec avec sa cause et l’action conseillée), les plus récentes d’abord.
- Ajout de `notification.acquitter` (écriture) : marque une de tes notifications comme vue.

