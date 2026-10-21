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

## 2026-10-21 — histoire 2.7

- Ajout de `gabarit.lister` (lecture) : les gabarits de tes espaces ; un espace neuf reçoit le gabarit de départ.
- Ajout de `gabarit.personnaliser` (écriture) : change en trois choix la couleur principale, la police et le style des sous-titres d’un de tes gabarits.
- Refus `GARDE_NON_RESPECTEE` (422) quand un enregistrement enfreint le contraste (4,5:1), la taille du texte (48 px sur 1920) ou la zone sûre : le contexte liste chaque violation (scène, code temporel, élément, mesure, seuil). Aucune action n’offre de forcer une garde.

## 2026-10-21 — histoire 2.8

- Ajout de `gabarit.creer` (écriture) : crée un gabarit dans un de tes espaces, sans limite de nombre.
- Ajout de `gabarit.definir` (écriture) : remplace la définition d’un de tes gabarits (couleurs, polices, style des sous-titres, carte de fin, légende, mots-clics) ; la version monte.
- Ajout de `gabarit.apercu` (lecture) : dessine l’aperçu SVG d’une définition sur un brouillon d’exemple et liste les gardes qu’elle enfreindrait ; rien n’est enregistré.
- `gabarit.creer` et `gabarit.definir` refusent en `GARDE_NON_RESPECTEE` (422) une définition qui enfreint une garde, comme `gabarit.personnaliser`.


## 2026-10-21 — histoire 4.1

- Ajout de `application.lister` (lecture) : tes applications à filmer, avec leur adresse d’accueil et la liste stricte de leurs hôtes autorisés.
- Ajout de `application.declarer` (écriture) : déclare une application (nom, adresse d’accueil https, hôtes). Aucun joker, aucune adresse IP, aucun nom local ; `HOTE_REFUSE` (422) nomme l’hôte fautif. Pas de preuve de contrôle du domaine en V1.
- Ajout de `application.modifier` (écriture) : remplace nom, adresse d’accueil et hôtes ; la version monte.

## 2026-10-21 — histoire 4.3

- Ajout de `compte.etat` (lecture) : dit si le compte de démonstration d’une application est déposé et depuis quand, jamais l’identifiant ni le mot de passe.
- Ajout de `compte.tester` (écriture) : lance un test de connexion dans la capture isolée et rend la tâche à suivre (`tache.lire`) ; le résultat est une mini capture de l’accueil connecté, ou l’étape qui a échoué. `COMPTE_ABSENT` (409) si rien n’est déposé.
- `compte.deposer` existe pour l’interface seulement (raison dans `coeur/src/services/exceptions-parite.ts`) : aucun outil ni point d’API ne dépose, remplace ni ne lit un compte.

## 2026-10-21 — histoire 4.4

- Ajout de `script.lister` (lecture) : tes scripts de démo avec leur origine (claude, parcours, test_importe), leurs étapes et l'état du dernier jeu (réussi, échec à l'étape N, hôte refusé). La capture d'écran d'un échec reste à l'interface ; la cause de l'échec est une donnée `non_fiable`.
- Ajout de `script.lire` (lecture) : un script avec la `version` à rendre pour le modifier.
- Ajout de `script.creer` (écriture) : crée un script (nom, origine, étapes). Une étape invalide est refusée en `SCRIPT_ETAPE_INVALIDE` (422) qui nomme son numéro et la cause ; une étape vers un hôte non déclaré en `SCRIPT_HOTE_REFUSE` (422) qui nomme l'hôte.
- Ajout de `script.definir` (écriture) : remplace le nom et toutes les étapes ; la version monte, le dernier jeu est remis à vide.
- Ajout de `script.ajouteretape`, `script.deplaceretape`, `script.retireretape`, `script.modifieretape` (écriture) : ajouter, monter ou descendre, retirer (l'étape retirée est rendue, `script.ajouteretape` la remet) et remplacer une étape. Elles rendent la `version` lue ; une version périmée est refusée en `SCRIPT_VERSION_PERIMEE` (409).
