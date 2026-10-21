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

## 2026-10-21 — histoire 4.5

- Ajout de `script.jouer` (écriture) : lance le jeu et le tournage vertical d'un script dans la capture isolée et rend `{tacheId, scriptId, version}` à suivre par `tache.lire`. Le jeu s'arrête à la première navigation hors de la liste d'hôtes de l'application ; le dernier jeu du script garde l'état, l'étape et la cause. `SCRIPT_SANS_ETAPE` (422), `SCRIPT_HOTE_REFUSE` (422), `COMPTE_ABSENT` (409) si le script se connecte sans compte déposé.
- Nouveau flux `GET /flux/jeu?tache=<id>` (session seulement, hors API publique) : rejoue puis diffuse le journal horodaté du jeu (événements `journal`, `etat`, `fin`). `fin` porte l'heure estimée du brouillon prêt.

## 2026-10-21 — histoire 4.8

- Ajout de `script.explorer` (écriture) : lance l'exploration d'une page de l'application (tâche `exploration`, sans compte de démonstration), dans les hôtes déclarés.
- Ajout de `script.exploration` (lecture) : lit la page vue (titre, éléments, capture) ; tout texte venant de la page est dans un champ `non_fiable`.
- Ajout de `script.proposer` (écriture) : crée un script à partir d'étapes écrites par Claude, vérifiées toutes ensemble (une erreur par étape fautive). **Outil MCP seulement** : ni API ni interface (raison dans `coeur/src/services/exceptions-parite.ts`, champ `seulement: 'mcp'`).

## 2026-10-21 — histoire 4.6

- Ajout de `montage.lister` (lecture) : tes vidéos, la dernière version de chaque montage (script d’origine, gabarit, durée), la plus récente d’abord.
- Ajout de `montage.lire` (lecture) : un montage avec sa timeline, le gabarit figé à sa création, ses rendus (état, violations des gardes avec mesure et seuil) et les autres versions de la série. `MONTAGE_INTROUVABLE` (404).
- Ajout de `montage.soustitres` (lecture) : les sous-titres d’un montage tirés du texte de voix (repères et fichier SRT). `MONTAGE_INTROUVABLE` (404).
- Ajout de `montage.definirvoix` (écriture) : change le texte de voix de scènes, crée une nouvelle version du montage et met en file la voix locale puis le rendu. `MONTAGE_VERSION_PERIMEE` (409), `SCENE_INTROUVABLE` (404).
- Ajout de `rendu.lire` (lecture) : un rendu, sa progression et, s’il est bloqué, ses violations. `RENDU_INTROUVABLE` (404).
- Ajout de `rendu.adresse` (lecture) : l’adresse signée (moins d’une heure) de la vidéo d’un rendu, servie sous `/v/session/…`. Un rendu bloqué reste lisible, marqué `bloque`. `RENDU_PAS_PRET` (409) pour un rendu en file, en cours ou en échec.

## 2026-10-21 — histoire 3.10

- Ajout de `montage.editer` (écriture) : applique à un montage une liste d’opérations (texte, durée, déplacer, dupliquer, retirer une scène, carte de fin) et crée une nouvelle version immuable ; rend aussi les violations des gardes, scène par scène. Ne lance pas de rendu. `MONTAGE_INTROUVABLE` (404), `MONTAGE_VERSION_PERIMEE` (409), `SCENE_INTROUVABLE` (404), `DERNIERE_SCENE` (409), `TROP_DE_SCENES` (422), `TIMELINE_INVALIDE` (422).

## 2026-10-21 — histoire 4.11

- Ajout de `script.rejouer` (écriture) : rejoue un script depuis la chaîne de déploiement ; même contrôle que `script.jouer`, la tâche est marquée « rejeu » : un rejeu réussi qui produit un montage prévient la personne (`montage_remplace`), un rejeu en échec la prévient par la notification d’étape échouée (numéro d’étape et capture sur la page du script).
- Ajout de `rejeu.etat` (lecture) : dit si le rejeu est actif pour un script et jusqu’à quand (jamais la valeur du jeton).
- Ajout de `rejeu.desactiver` (écriture) : révoque tout de suite le jeton de rejeu du script.
- `rejeu.activer` (création du jeton de rejeu, un an au plus, valeur rendue une seule fois) est réservé à l’interface, après une connexion récente, comme `jeton.creer`.
- Un jeton de rejeu n’est valable que pour `script.rejouer` sur son script : toute autre action, ou un autre script, donne 403 `JETON_REJEU_LIMITE`. `jeton.lister` rend `scriptId` pour ces jetons.

## 2026-10-21 — histoire 3.11

- `montage.editer` accepte quatre opérations de plus : `animation` (entrée, sortie, durée, délai des textes d’une scène ; catalogue fermé), `transition` (`coupe` ou `fondu`), `zoom` (actif, niveau de 1,1 à 3, décalage de ±2 s par rapport au clic) et `animation_carte` (animation du texte de la carte de fin). Une valeur hors catalogue ou hors bornes donne 400.
- Ajout de `montage.regenerer` (écriture) : met en file un nouveau rendu (précédé de la voix de synthèse si elle existe) du montage tel qu’il est ; suivre l’avancement avec `rendu.lire`. `MONTAGE_INTROUVABLE` (404), `SEANCE_PURGEE` (409, avec la date de purge).

## 2026-10-21 — histoire 2.13

- Ajout de `montage.regenerergabarit` (écriture) : crée une nouvelle version du montage avec le gabarit actuel (ou celui demandé), fige ce gabarit dans la version, puis met en file un rendu ; les versions antérieures gardent leur gabarit et leur film. Suivre l’avancement avec `rendu.lire`. `MONTAGE_INTROUVABLE` (404), `MONTAGE_VERSION_PERIMEE` (409), `SEANCE_PURGEE` (409, avec la date de purge).

## 2026-10-21 — histoire 3.5

- Ajout de `montage.couvertures` (lecture) : les trois couvertures (titre, texte à l’écran, bandeau) d’une version, dessinées en SVG au style du gabarit figé, avec la variante choisie.
- Ajout de `montage.couvrir` (écriture) : choisit une variante ; crée une nouvelle version immuable (origine « edition »), sans rendu. Refus `SEANCE_PURGEE` si les rushes sont purgés.
- `montage.editer` accepte l’opération `couverture` (`{ op, variante }`).

## 2026-10-21 — histoire 3.7

- Ajout de `montage.legende` (lecture) : la légende et les hashtags d’une vidéo pour un réseau (`instagram`, `facebook`, `tiktok`), avec les bornes du réseau ; une légende est proposée tant que rien n’est enregistré.
- Ajout de `montage.legender` (écriture) : enregistre la légende et les hashtags d’un réseau ; refus `LEGENDE_TROP_LONGUE`, `TROP_DE_HASHTAGS` ou `HASHTAG_INVALIDE` (422) qui nomme la borne dépassée.

## 2026-10-21 — histoire 3.8

- Ajout de `montage.telecharger` (écriture) : rend l’adresse signée (moins d’une heure) de la vidéo complète 1 080×1 920 sans filigrane, la couverture choisie (SVG) et la légende de chaque réseau ; sans rendu complet, le met en file (une seule fois) et rend `etat: en_preparation` avec l’heure de fin estimée. Refus `SEANCE_PURGEE` si rien n’est rendu et que les rushes sont purgés, `RENDU_PAS_PRET` si le rendu complet est bloqué par une garde.

## 2026-10-21 — histoire 3.9

- Ajout de `montage.bibliotheque` (lecture) : la dernière version de chaque vidéo avec son statut (`prete`, `en_cours`, `bloquee`, `en_echec`, `sans_rendu`) et sa date d’archivage ; filtres `statut`, `depuis` et `jusqua` (jours AAAA-MM-JJ en heure de Paris, bornes comprises), `archivees` (`exclure` par défaut, `inclure`, `seulement`) et `espaceId`. `PERIODE_INVALIDE` (422) si une date n’existe pas ou si le début suit la fin.
- Ajout de `montage.archiver` (écriture) : archive (ou sort des archives) toutes les versions d’une vidéo, sans rien effacer.
- Ajout de `montage.supprimer` (écriture) : supprime définitivement une vidéo (versions, rendus, voix, légende, fichiers et octets) ; `confirmer: true` est obligatoire. `VIDEO_PUBLIEE` (409) tant qu’une publication de la vidéo est publiée : archive-la plutôt.

## 2026-10-21 — histoire 7.1

- Ajout de `reseau.etat` (lecture) : pour chaque réseau ouvert, si la clé d’application est déposée et depuis quand ; jamais la clé.
- Ajout de `reseau.tester` (écriture) : teste auprès du réseau la clé déposée ; rend `valide` et, sinon, la cause (`RESEAU_CLE_REFUSEE`, `RESEAU_INJOIGNABLE`...). `RESEAU_CLE_ABSENTE` (409) sans clé déposée.
- `reseau.deposer` existe pour l’interface seulement (raison dans `coeur/src/services/exceptions-parite.ts`).

## 2026-10-21 — histoire 7.6

- Ajout de `reseau.comptes` (lecture) : les comptes de réseau reliés (nom, état, échéance de la connexion), éventuellement d’un seul espace ; jamais le jeton.
- Ajout de `reseau.deconnecter` (écriture) : déconnecte un compte et retire son jeton du coffre ; `COMPTE_RESEAU_INTROUVABLE` (404) si le compte n’existe pas ou n’est pas accessible.
- `reseau.connecter` existe pour l’interface seulement (raison dans `coeur/src/services/exceptions-parite.ts`) : un compte ne se relie que par le parcours OAuth du navigateur, aucun jeton de réseau ne passe par l’API.

## 2026-10-21 — histoire 7.3

- Ajout de `publication.publier` (écriture) : publie une vidéo maintenant sur un compte relié ; fige le montage, le rendu et la légende ; refuse avec la cause si une garde, une borne ou le quota l'interdit ; une seule publication par compte et par vidéo (`PUBLICATION_EXISTE`, 409).
- Ajout de `publication.lire` (lecture) : une publication avec son état, son identifiant et son lien chez le réseau, la cause et l'action en cas d'échec ou d'incertitude.
- Ajout de `publication.lister` (lecture) : les publications, filtrables par vidéo, espace, réseau et état.
- `montage.supprimer` refuse désormais une vidéo publiée (`VIDEO_PUBLIEE`, 409).

## 2026-10-21 — histoire 7.4

- Ajout de `publication.programmer` (écriture) : programme une publication à une heure de Paris (`AAAA-MM-JJTHH:MM`) ; fige montage, rendu et légende ; refus `PUBLICATION_ECHEANCE_INVALIDE` (422) si l'heure est passée, à plus d'un an, inexistante (changement d'heure) ou mal écrite.
- Ajout de `publication.deplacer` (écriture) : change l'heure d'une publication programmée ou en attente de confirmation.
- Ajout de `publication.annuler` (écriture) : annule une publication non encore partie et supprime son échéance.
- Ajout de `publication.confirmer` (écriture) : confirme la dernière version d'un montage modifié (`MONTAGE_MODIFIE`) ; la publication redevient programmée.
