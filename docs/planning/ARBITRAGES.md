# Arbitrages en attente

Décisions que le codeur n'a pas à prendre seul (produit, accès, jeton tiers). Format : histoire, question, options, recommandation.

## 1.14 Se connecter par Authentik

1. **Application Authentik** — l'application OIDC « regie » n'existe pas encore. Benjamin la crée (redirection `<REGIE_URL_PUBLIQUE>/connexion/retour`, client confidentiel), dépose le secret dans `regie_oidc_client` et pose `REGIE_URL_PUBLIQUE`, `REGIE_OIDC_EMETTEUR`, `REGIE_OIDC_CLIENT_ID`, `REGIE_ADMIN_SUB`. Recommandation : désigner l'utilisateur par `REGIE_ADMIN_SUB` (stable) plutôt que par l'e-mail.
2. **Mentions légales** — `/confidentialite` et `/conditions` portent des repères `⟨À CONFIRMER⟩` : identité et adresse de l'éditeur, e-mail de contact, durées de conservation, lieu d'hébergement, avis de la CNIL, limites de responsabilité, tribunal compétent. Seul Benjamin les connaît.
3. **Durée de session** — 7 jours, révocable. Options : 24 h, 7 jours, 30 jours. Recommandation : 7 jours (outil personnel, actions sensibles protégées par la réauthentification de 10 minutes).
4. **Création de la marque** — la marque « Établia » est créée à la première connexion de l'utilisateur autorisé. Option : la créer à l'installation. Recommandation : garder la création à la première connexion (aucun geste de plus).
5. **E-mail comme identité** — accepté seulement si Authentik le déclare vérifié (`email_verified`). Recommandation : s'en tenir au `sub`.
6. **Échecs sans marque** — tant qu'aucune marque n'existe, un échec de connexion n'est pas écrit au journal (la table exige `marque_id`). Option : une marque « système ». Recommandation : attendre 1.13.
7. **Fin de session Authentik** — la déconnexion renvoie vers `end_session_endpoint` s'il est annoncé, sans `post_logout_redirect_uri` (à déclarer côté Authentik pour revenir sur regie). Recommandation : le déclarer quand l'application est créée.
8. **Réauthentification** — `max_age=600` seul peut être ignoré par un fournisseur ; regie contrôle donc `auth_time` au retour et refuse sinon. Aucune décision attendue, signalé pour mémoire.

## 1.12 Brancher son Claude sur regie

1. **CIMD (Client ID Metadata Documents)** — reporté : exige une requête sortante vers l'adresse fournie par le client, donc un nouveau domaine dans `sorties-autorisees.json` et une protection contre les requêtes serveur (SSRF). Seule l'inscription dynamique bornée (DCR) est livrée. Options : DCR seule, ajouter CIMD. Recommandation : DCR seule tant que Claude l'accepte.
2. **Redirections autorisées** — `https://claude.ai/…` et `https://claude.com/…`, plus les adresses locales (`localhost`, `127.0.0.1`) pour les clients de bureau. Option : liste réduite à Claude. Recommandation : garder cette liste.

## 1.13 Consulter le journal d'audit

1. **Périmètre « instance »** — en V1 il n'y a qu'une marque : l'administrateur (`REGIE_ADMIN_SUB`) voit tout son journal, avec le seul genre des objets des autres (jamais leur identifiant). Une vue inter-marques exige le rôle `regie_admin` et son SELECT interdit sur les contenus : reportée. Recommandation : la faire quand une deuxième marque existera.
2. **Rattachement à un espace** — le journal ne porte pas l'espace de chaque action : « mon espace » montre mes actions et les lignes dont l'objet est `espace:<mon espace>`. Option : ajouter une colonne `espace_id` au journal (migration, chaîne recalculée). Recommandation : l'ajouter avec la première action de contenu (V1 suivante).

## 2.1 Une file de traitement durable

1. **Exécutants réels** — aucune étape réelle n'existe encore : le registre des types (`@regie/contrats`) porte les délais de garde du NFR-11, et seule la tâche d'essai a un exécutant. Chaque histoire d'étape branchera le sien dans `EXECUTANTS`. Aucune décision attendue.
2. **Suite de tests commune TypeScript/Python et passerelle de résultats** — reportées avec le côté Python (aucun processus Python n'existe encore) ; l'application des résultats est déjà isolée derrière `Applicateur`. Recommandation : la reprendre avec l'histoire 4.2.
3. **Reprise d'une tâche perdue** — une seule reprise automatique, puis `RESULTAT_INCONNU` (action « vérifier ») ; jamais de reprise après le point de non-retour ni pour un type à reprise interdite (`reseau`). Options : deux reprises. Recommandation : garder une seule, la personne relance à la main.
4. **Un seul GPU global** — le sémaphore est partagé par toutes les marques (une machine, un GPU). Aucune équité entre comptes, conformément au recentrage du 2026-10-18.

## 2.2 Des échéances qui ne se perdent pas

1. **Export externe de la chaîne d'audit** — reporté (arbitrage du 2026-10-18). La vérification nocturne garde la tête de chaîne dans le journal ; l'ancrer hors de la base (autre machine, horodatage tiers) reste à décider. Options : copie de la tête sur le NAS, ancrage tiers. Recommandation : copie de la tête sur le NAS, sans service tiers.
2. **Alerte de rupture** — la rupture échoue le travail (`CHAINE_ROMPUE`) et écrit une erreur dans les logs ; l'avertissement à l'administrateur dans l'interface arrive avec les notifications (2.6). Aucune décision attendue.
3. **Types sans gestionnaire** — `publication`, `rappel`, `expiration`, `rendu_differe`, `rappel_connexion`, `suppression_annoncee` sont déclarés mais attendent leur histoire : leurs travaux restent `pret`. Un type connu dont le gestionnaire manque pour son `objet` échoue en `SANS_GESTIONNAIRE`. Aucune décision attendue.
4. **Rattrapage** — seuil de 2 h pour tous les types ; au-delà, les types « publication » et « rappel » échouent plutôt que d'agir en retard. Options : seuil par type. Recommandation : garder un seuil unique.

## 2.5 Suivre ma séance dans la file

1. **Ce que l'on suit** — la séance de rushes n'existe pas encore (recentrage du 2026-10-18) : le suivi porte sur les tâches de la file (capture, rendu…). Options : attendre la séance. Recommandation : brancher la séance sur le même flux quand elle existera.
2. **Mécanisme de direct** — SSE sur la même origine (compatible `connect-src 'self'`), sondage serveur toutes les 3 s, émission seulement si la vue change, repli par rechargement (`<noscript>`). Options : WebSocket, sondage client. Recommandation : garder le SSE. `taches.astro` est ajouté à `fichiersReseau` de `sorties-autorisees.json` (appel `EventSource` vers la même origine uniquement).
3. **Audit du flux** — la lecture du flux n'est pas écrite au journal (répétée toutes les quelques secondes) ; `tache.lister` et `tache.lire` le sont. Le flux n'est pas une action : l'équivalent API/MCP est `tache.lister`.
4. **Estimation** — médiane des 50 dernières durées réussies du type, sinon durée typique fixée dans le registre des types. Toujours présentée comme une estimation (« vers 18 h 40 »), jamais une promesse. Aucune décision attendue.
5. **Relance** — reportée à 2.6.

## 2.6 Être prévenue et relancer une étape en échec

1. **Courriel** — reporté en V1.1 (ajustement du tableau) : pas de table `courriels_sortants`, la notification est dans l'interface seulement. Options : courriel dès la V1. Recommandation : V1.1.
2. **Où naît la notification** — un déclencheur SQL (migration 0008) dans la transaction du passage à `echouee`, clé `echec:<tâche>:<tentatives>` : jamais perdue, jamais en double, même si le processus s'arrête. Options : code applicatif après coup. Recommandation : garder le déclencheur.
3. **Relance** — regie ne relance jamais seul une étape en échec définitif ; la personne décide. `tache.relancer` (API, MCP, interface) remet la tâche en file sans renvoyer les rushes et garde l'historique. Relancer un `RESULTAT_INCONNU` reste son choix : l'interface lui dit de vérifier d'abord.
4. **Rupture du journal** — l'administrateur est prévenu dans l'interface, une notification par jour (clé par date) ; sans administrateur déclaré, seul le log d'erreur subsiste.
5. **Reportés** — condition « rushes non purgés » et « la vidéo retrouve son statut » (ni rushes ni vidéo n'existent encore) ; « série prête » attend 2.12.

## 2.7 Un gabarit de départ, des gardes et une mise en page communes

1. **Marque Établia** — ses couleurs, ses polices et son logo ne sont pas dans le dépôt : le gabarit de départ est neutre (vert profond, texte blanc, fond sombre, accent doré ; Inter, sous-titres « classique »). Options : Benjamin fournit la charte. Recommandation : la fournir, elle remplace `GABARIT_DE_DEPART` (une ligne) sans migration, car chaque espace garde son gabarit modifiable.
2. **Polices** — quatre polices libres (Inter, Montserrat, Playfair Display, Bebas Neue, toutes SIL OFL-1.1) déclarées dans `deploiement/licences-tiers.json` avec leur source ; les fichiers eux-mêmes ne sont pas embarqués, les histoires de rendu les installeront avec leur déclaration `fichier`. Un test échoue si une police proposée n'est pas déclarée avec une licence libre.
3. **Zone sûre** — 880×1220 en (0, 220) sur 1080×1920 telle que donnée (le bord gauche à x = 0 est pris tel quel). Options : zone centrée. Recommandation : confirmer la zone avec le gabarit d'Établia ; elle vit dans `bornes.json`.
4. **Seuil « majuscules < 48 px »** — appliqué à la taille de tout texte du gabarit (titres, sous-titres, carte de fin), ramenée à 1920 px de haut : plus strict que la lettre, et simple à expliquer. Options : seulement les capitales. Recommandation : garder.
5. **Largeurs de texte** — la mise en page estime la largeur par police (largeur moyenne d'un caractère × taille), sans navigateur : assez juste pour garder, pas pour composer à l'image près ; le test image rendu ⇔ lecteur arrive avec 3.1.
6. **Gabarit de départ des espaces** — créé au premier accès aux gabarits de l'espace (jamais en double, même en simultané) et non dans la création de l'espace : couvre aussi les espaces existants sans migration de données. Aucune décision attendue.
7. **Pas de forçage** — aucune action n'accepte de champ pour contourner une garde (un test le vérifie sur tout le registre) ; changer un seuil, c'est changer `bornes.json` en revue.
8. **Reportés** — import et rastérisation du logo SVG (AR-12 : zone de données et conteneur d'analyse) ; choix du gabarit à l'envoi d'une séance ; suppression d'un gabarit.

## 2.8 Définir mon gabarit complet et le prévisualiser

1. **Aperçu** — image SVG dessinée sur le serveur (aucune dépendance, aucun navigateur) : trois scènes d'un brouillon d'exemple (titre et logo, sous-titre, carte de fin), zone sûre en pointillés. Servie par `/gabarit/apercu.svg` (session exigée, `default-src 'none'`), mise à jour en direct par un petit script, ou par « Actualiser l'aperçu » sans script. L'équivalent pour l'API et le MCP est `gabarit.apercu`. Le rendu final passe par le lecteur (3.1) : l'aperçu est une estimation fidèle des positions et des couleurs, pas des chasses exactes des polices.
2. **Logo** — l'import et la rastérisation d'un logo SVG exigent la zone de données et le conteneur d'analyse (AR-12) : reportés. L'aperçu montre un monogramme provisoire. Recommandation : les reprendre avec la zone de données.
3. **Pas de limite de gabarits** — suivant l'ajustement du tableau, aucun plafond de trois ; aucune suppression non plus (ni DELETE accordé à la base), à décider si la liste devient longue.
4. **Gabarit choisi à l'envoi d'une séance** — reporté : la séance n'existe pas encore (recentrage du 2026-10-18).
5. **Journal** — `gabarit.creer` et `gabarit.definir` sont au journal ; l'aperçu (image dessinée à chaque réglage) ne l'est pas, rien n'étant écrit ni exposé. `gabarit.apercu` par l'API ou le MCP l'est, comme toute action.
6. **Marque Établia** — voir l'arbitrage 2.7 : gabarit neutre tant que la charte n'est pas fournie.


## 4.2 Capturer une application dans un conteneur séparé

1. **Bac à sable de Chromium sous Podman rootless** — le bac à sable reste actif (jamais `--no-sandbox`), mais le profil seccomp par défaut de Podman peut l'empêcher de créer ses espaces de noms. Options : profil seccomp dédié (recommandé, à valider sur le LXC), `--security-opt seccomp=unconfined` (à refuser). Recommandation : tester à l'installation (`deploiement/infra/capture.md`, étape 6) et fournir un profil minimal si Chromium échoue ; l'installation n'a pas pu être essayée (pas d'accès à l'infra).
2. **Capture et proxy dans le LXC `regie`** — conformément à l'adaptation V1 : pas de LXC ni de VLAN séparés. L'isolation repose sur l'utilisateur Unix dédié, son socket Podman, le réseau `capture-interne` (`Internal=true`, sans DNS) et la liste blanche du proxy. Recommandation : séparer en LXC quand une deuxième personne utilisera regie.
3. **Miniature dans le résultat de tâche** — la mini capture (PNG plafonné à environ 200 ko) est stockée en base64 dans le résultat de la tâche, sans zone de fichiers. Recommandation : la déplacer vers la zone de données quand elle existera.
4. **Reportés** — preuve de contrôle du domaine, et liste « hôte + IP privée » à autoriser par l'administrateur (par exemple pour filmer une application sur le LAN) : refus pur des plages privées et de l'IP du foyer en V1. Le jeu de scripts complet (Playwright) arrive en 4.5 ; ici seule la mini capture d'accueil.
5. **Installation** — unités Quadlet et Containerfiles écrits mais non installés ni construits (pas d'accès infra) ; clé `regie_capture_cle` à créer par l'administrateur ; test d'intégration `capture.integration.test.ts` à lancer avec `REGIE_TEST_PODMAN` (socket) et `REGIE_TEST_PODMAN_IMAGE`.

## 4.3 Un compte de démo qui ne se lit jamais, et le test de connexion

1. **Stockage sans nouvelle table** — le compte (identifiant et mot de passe, en un seul secret JSON) vit dans la table `secrets` du coffre (type `compte_demo`, nom `application:<id>`), chiffré avec l'id du secret dans les données authentifiées ; le remplacer garde l'id. Pas de migration. Aucun gabarit d'affichage : l'interface ne montre que « déposé le … ».
2. **Parité : le dépôt est une exception déclarée** — `compte.deposer` est réservé à l'interface (réauthentification récente exigée par la page, patron des jetons). `compte.etat` et `compte.tester` sont offerts à l'API et au MCP ; aucune action ne lit le compte. Le formulaire est perdu si la réauthentification est demandée : la personne ressaisit (rien du mot de passe n'est conservé hors du coffre).
3. **Passerelle de secrets dans le cœur** — la matrice (type de tâche, type de secret) et la vérification du bail (tâche en cours, prise par ce service, bail valide) sont en place, mais la route HTTP `POST /interne/secrets/lire` / `/deposer` d'AR-11 est reportée : tant que l'exécutant tourne dans le processus du cœur, elle n'ajouterait qu'un détour. Elle reprendra la même classe quand des services séparés auront besoin du coffre. Recommandation : l'ajouter avec le premier service hors cœur (histoire 5.x).
4. **Une seule tentative** — `test_connexion` a `tentativesMax = 1` et aucune relance automatique : un mauvais mot de passe répété verrouillerait le compte de démo. La relance est un geste volontaire.
5. **Pas de capture en cas d'échec** — après une saisie, la page contient le mot de passe : sur échec, le conteneur ne rend que l'étape fautive (ouvrir, trouver, saisir, valider). Le mot de passe est refusé s'il apparaît dans la sortie du conteneur.
6. **Sélecteurs de connexion génériques** — champ mot de passe `input[type=password]`, identifiant `input[type=email]` ou texte : suffit pour la démo d'Établia ; un formulaire plus exotique se pilotera avec les scripts (4.4/4.5, étape « connexion »).
7. **Essai réel non fait** — ni Chromium ni Podman accessibles ici : testé avec faux navigateur et faux lanceur seulement (voir 4.2, point 5).

## 4.4 Liste des scripts et éditeur d'étapes

1. **Éditeur sur `/scripts?id=`** — le projet n'a aucune route dynamique Astro ; la liste et l'éditeur partagent la page `scripts.astro`. Recommandation : garder tant qu'il n'y a pas besoin de liens courts.
2. **Étapes en JSON dans la table `scripts`** — une colonne `etapes jsonb` (au plus 100 étapes) plutôt qu'une table d'étapes : un geste remplace la liste entière sous contrôle de version. La migration 0011 crée la table, RLS forcée par marque et espace visible, sans DELETE.
3. **Version vérifiée à chaque geste** — monter, descendre, retirer, ajouter et remplacer rendent `SCRIPT_VERSION_PERIMEE` (409) si la version lue n'est plus la bonne : deux fenêtres ou Claude et la personne ne s'écrasent pas.
4. **Modifier un script remet à vide son dernier jeu** — l'état « échec à l'étape 3 » parlerait d'un autre script. Le dernier jeu (4.5) le réécrit au jeu suivant.
5. **Cohérence du tournage partout** — « filmer arrêter » sans « filmer démarrer » et deux « démarrer » de suite sont refusés ; un « démarrer » sans « arrêter » reste permis (la fin du jeu arrête). Pour retirer la paire, on retire d'abord « arrêter ».
6. **La capture d'un échec ne sort pas par l'API ni le MCP** — elle pèse des centaines de ko et montre la page filmée ; seule l'interface l'affiche, l'API rend `captureDisponible`. La cause d'échec, qui peut citer la page, est marquée `non_fiable`.
7. **« Annuler » sans JavaScript** — le retrait pose un cookie de 60 s (l'étape retirée, jamais dans l'adresse) ; la page affiche un formulaire « Annuler » que la CSS masque après 4 s. Au-delà de 3,5 ko de cookie (longue narration), le retrait reste valable sans « Annuler ». Recommandation : un vrai toast en JavaScript avec le minuteur quand l'interface en aura un.
8. **« Viser le … »** — un petit formulaire qui donne la nouvelle cible (ou la nouvelle adresse pour « aller ») et passe par `script.modifieretape` : l'hôte est revérifié. La sélection à la souris dans la capture est reportée.
9. **Création à partir d'une phrase** — pas en 4.4 : c'est l'objet de 4.8 (MCP). L'interface crée un script vide.
10. **`contrats` dépend de zod** — le schéma des étapes vit dans `@regie/contrats`, partagé par le cœur et l'exécutant de capture (4.5).

## 4.5 Jouer et filmer mon script

1. **Moteur sans Playwright** — `services/capture/src/jeu.ts` rejoue les étapes contre une interface `PiloteNavigateur` ; `pilote-playwright.ts` la branche sur Playwright 1.63.0 (chargé dynamiquement, dans l'image de capture seulement). Tests avec un faux pilote ; l'essai réel est ignoré sans `REGIE_TEST_NAVIGATEUR` et l'image n'a pas été construite ici.
2. **Deux gardes sur les hôtes** — le proxy de sortie (4.2), puis le navigateur lui-même coupe toute requête hors liste ; chaque étape revérifie la page ouverte. Un hôte refusé prime sur toute autre cause et se trace (`refus`).
3. **Journal sans valeur sensible** — verbe, cible visée, hôte, position du pointeur ; jamais une valeur saisie ni le compte. Il vit en mémoire du cœur (300 entrées, 50 jeux, 1 h) : un seul processus en V1.
4. **Aperçu schématique** — le panneau dessine curseur, ondulation de clic et zoom d'après les coordonnées du journal, pas des images réelles. Le film n'est pas livré (seule sa taille est rendue) ; le recadrage 1080×1920 et le zoom du film sont reportés à 4.6.
5. **« Session qui suit la file »** — approchée par la tâche `jeu_script` plus l'heure « prêt vers » = maintenant + durées typiques du montage et du rendu. La vraie session de montage naît avec 4.6.
6. **Flux borné** — 2 flux par personne, 15 min au plus, cloisonné par marque et par personne (404 sinon).
7. **Une tentative, pas de garde de doublon** — `jeu_script` ne se rejoue pas seul ; deux jeux simultanés d'un même script restent possibles. Le jeu d'une version périmée n'écrase pas le dernier jeu.
8. **Licences** — nouvelle liste « images » dans `licences-tiers.json` (Playwright Apache-2.0, Chromium BSD-3-Clause) ; `scripts.astro` rejoint les fichiers réseau déclarés (EventSource vers l'origine seule).

## 4.8 Demander un script à Claude

1. **Aucun appel à Anthropic** — la « phrase » n'est jamais envoyée par regie : c'est Claude, connecté en MCP, qui écrit les étapes ; `script.proposer` ne reçoit que `applicationId`, `nom` et `etapes`. Le modèle de demande de l'interface est un texte à copier.
2. **Exploration = tâche de capture sans compte** — nouvelle tâche `exploration` (interactive, 2 tentatives) : mode `exploration` du conteneur, mêmes proxy et deuxième garde que 4.2 ; elle rend titre, vignette et au plus 40 éléments (lien, bouton, champ) au texte coupé à 80 caractères. On explore ce qu'un visiteur voit : le compte de démo n'y entre jamais, et le contenu des champs n'est jamais lu.
3. **Tout texte de page est `non_fiable`** — titre, textes d'éléments et capture sortent de `script.exploration` dans des champs `non_fiable` ; chaque lien porte `autorise` (son hôte est-il déclaré ?). La capture n'est rendue que sur `avecCapture`.
4. **Vérification à l'écriture** — `script.proposer` valide toutes les étapes d'un coup (forme, cohérence, hôtes) et rend `{creee:false, erreurs:[{etape, verbe, champ, cause, detail, hote?}]}` en donnée (20 au plus) ; rien n'est créé tant qu'une étape est refusée. Un nom pris reste une erreur 409.
5. **Parité (FR-47)** — `ExceptionParite.seulement: 'mcp'` : l'action est offerte au MCP et à lui seul (`actionsExposees(..., porte)`) ; en plus, l'action refuse `MCP_SEULEMENT` hors origine `mcp`. La référence de l'API la signale.
6. **Reporté** — rendu des captures d'exploration dans l'interface ; exploration derrière une connexion (compte de démo) ; fusion avec les résultats de 4.6.

## 4.6 Une démo recadrée et zoomée sur chaque clic

1. **Film par la sortie standard, sans volume** — le conteneur de capture rend le film en lignes `{"film":...}` (morceaux base64, taille et SHA-256 contrôlés, octets magiques WebM vérifiés) ; le conteneur de rendu reçoit ses fichiers par l'entrée standard et rend le MP4 de même. Aucun volume partagé, `--network none` pour le rendu.
2. **ffmpeg (GPL) en processus séparé** — compatibilité AGPL : ffmpeg tourne seul dans une image à part (`deploiement/images/rendu.Containerfile`, ffmpeg de Debian trixie), sans être lié au code de regie ; déclaré dans `licences-tiers.json`. Le code source de Debian est cité.
3. **`-/filter_complex`** — le graphe de filtres est lu dans un fichier par `-/filter_complex` (ffmpeg 7.0 et plus, y compris 9) : `-filter_complex_script` n'existe plus en ffmpeg 9.
4. **Rendu bloqué visible** — une violation de garde donne un rendu `bloque` dont la vidéo reste lisible (avec violations : scène, élément, mesure, seuil) ; sinon `pret`. Jamais de gabarit inventé : sans gabarit pour l'espace, `MONTAGE_ECHEC`.
5. **Montages immuables** — chaque modification est une nouvelle ligne (série + numéro + parent) ; la publication déjà partie reste liée à l'ancienne version de fait. Le gabarit est figé dans le montage (2.13).
6. **Voix et sous-titres** — la timeline porte déjà le texte de voix et la prise en charge des fichiers de voix par scène ; le moteur de voix (Piper, voix gilles CC0 par défaut) arrive avec 4.7.
7. **Non vérifié ici** — GPU/VAAPI et image de rendu réelle : le ffmpeg de la machine n'a pas le filtre `ass`, l'essai réel (`REGIE_TEST_FFMPEG`) rend donc sans texte. Reproductibilité à 40 ms et chronométrage de recette : à faire sur la machine cible. `glisse` n'est pas rendu par ffmpeg (traité comme fondu).
8. **Pas de masquage de mot de passe dans le film** — la saisie du compte de démo apparaît telle quelle dans le rush ; le compte est dédié à la démo (4.3).
9. **`fichiers.<domaine>`** — relève de l'infrastructure (nginx) : non touché ; l'adresse signée est relative à l'origine du cœur (`/v/session/…`), compatible `media-src 'self'`.

## 4.7 Une voix de synthèse locale

1. **Gilles (CC0) par défaut** — aucun choix humain n'ayant été donné, la voix `fr_FR-gilles-low` est retenue ; rapport de comparaison dans `deploiement/voix-rapport.md`. Tom (AGPL) et upmc (CC-BY-SA) sont exclues.
2. **Modèle sur le volume `/modeles`, binaire dans l'image** — AD-11 l'emporte sur « dans l'image » : le dossier des modèles est monté en lecture seule (seul volume d'un conteneur), le binaire Piper est dans l'image `rendu`.
3. **Empreinte du modèle à renseigner** — `modeles.lock` porte `sha256: null` faute de téléchargement autorisé ici ; le cœur refuse de démarrer avec `REGIE_MODELES` tant qu'elle manque (échec fermé, NFR-30). À mesurer au déploiement. L'archive Piper se construit avec `PIPER_SHA256` (vide par défaut, donc build en échec tant qu'il n'est pas donné).
4. **Un conteneur par scène** — isolation maximale, `--network none` ; Piper (MIT) et espeak-ng (GPL) restent en processus séparé, déclarés dans `licences-tiers.json`.
5. **Activation** — la voix n'est active que si `REGIE_MODELES` et `REGIE_CAPTURE_SOCKET` sont posés ; sinon le rendu part directement, sans voix. Aucun appel sortant à l'exécution.
6. **Sous-titres** — le sous-titrage ASS incrusté existe déjà dans le plan de rendu (4.6) ; l'action `montage.soustitres` ne sert que le SRT.
7. **Pas de réutilisation entre versions** — une nouvelle version de timeline refait toutes les voix (simple et sûr) ; à l'intérieur d'une même version, une tâche rejouée ne redit pas les scènes déjà dites.

## 2.12 Page d'aperçu d'une démo

1. **Aucune écriture, aucune nouvelle action** — la page lit par `montage.lister`, `montage.lire` et `rendu.adresse` (déjà en parité API/MCP) ; l'adresse est signée à chaque affichage, valable 30 minutes, relative à l'origine du cœur.
2. **Rafraîchissement sans script** — pendant un rendu en file ou en cours, une balise `<meta http-equiv="refresh">` recharge la page toutes les 5 s ; le suivi SSE (2.5) reste sur `/taches`.
3. **Montage hors de portée = introuvable** — un identifiant mal formé, inconnu ou d'un autre lecteur donne la même réponse (aucune fuite d'existence).
4. **Reportés** — reproductibilité à 40 ms et chronométrage de recette (exigent GPU et rushes réels) ; notification « série prête ».

## 3.10 et 3.11 Éditer, animer et regénérer une vidéo

Question : que montre l'aperçu d'une scène, et à quoi tient « deux rendus identiques » ?

1. **Aperçu sans l'image du film** — option A : extraire une image du film avec ffmpeg à chaque modification (fidèle, mais un conteneur par frappe) ; option B : fond uni du gabarit, textes, zone sûre, cadre et clics du zoom, animations jouées en SVG (instantané). Retenu : B. **Recommandation** : B pour l'édition, le vrai film reste la référence via « Regénérer ». Une vignette tirée du film peut s'ajouter plus tard sans changer l'interface.
2. **Animations de l'aperçu = animations du rendu** — l'aperçu (SMIL dans une `<img>`, sans script) utilise les mêmes paramètres que le rendu ASS : fondu, glissement de 90 px, zoom de 40 à 100 % à l'entrée et de 100 à 60 % à la sortie. Un écart de rendu image par image est possible : le film rendu fait foi.
3. **Rendus identiques (FR-30)** — le plan de rendu (graphe, sous-titres, arguments) est pur et déterministe, testé : même montage et même gabarit figé donnent le même plan. L'identité octet pour octet de la vidéo dépend de ffmpeg (version fixée par l'image) et du GPU. Option : forcer l'encodage logiciel pour la recette. **Recommandation** : mesurer sur la machine cible avant de promettre l'identité binaire.
4. **« Regénérer » ne crée pas de version** — il relance un rendu du montage tel quel ; seule une modification (3.10) ou un changement de gabarit (2.13) crée une version.
5. **Publications déjà parties** — restent liées à l'ancienne version de fait ; l'affichage du lien arrive avec l'épopée 7 (pas encore codée).

## 2.13 Changer de gabarit sans toucher au passé

Question : que devient une vidéo déjà produite quand le gabarit de la marque change ?

1. **Version nouvelle, jamais de modification** — option A : réécrire le montage en place ; option B : créer une version (origine « gabarit ») qui fige le gabarit actuel, l'ancienne version et son film restent intacts. Retenu : B. **Recommandation** : B, c'est la seule qui respecte « sans toucher au passé ».
2. **Publications déjà parties** — restent liées à l'ancienne version ; le lien visible arrive avec l'épopée 7 (non codée).
3. **Séance purgée** — la régénération est refusée (409) avec la date de purge, comme pour 3.11 : sans film source, rien à rendre.

## 3.5 Choisir ma couverture

Question : sous quelle forme livrer la couverture, et que couvre l'histoire ?

1. **SVG, pas PNG ni JPEG** — option A : rastériser (bibliothèque tierce ou ffmpeg dans un conteneur) ; option B : image SVG dessinée sur le serveur, échappée, servie en `<img>` sous CSP restrictive. Retenu : B (aucune dépendance nouvelle). **Recommandation** : B pour le choix ; la rastérisation PNG/JPEG se fera avec le rendu complet (3.8, téléchargement).
2. **La couverture est dans la timeline** — le champ `couverture.variante` fait que choisir crée une version immuable (FR-37), sans rendu : la couverture est une image, pas un plan de la vidéo.
3. **Réduit à la couverture** (ajustement du 2026-10-18) — l'accroche se règle dans l'éditeur (3.10) ; musique et prise sont reportées.

## 3.7 Ma légende et mes hashtags

Question : quelles bornes par réseau, et où vit la légende ?

1. **Bornes à confirmer** — `deploiement/bornes.json` porte désormais les bornes réseau par réseau (Instagram, Facebook, TikTok : 2 200 caractères et 5 hashtags, valeurs de départ qui reprennent les défauts). **Recommandation** : confirmer chaque valeur contre les règles en vigueur du réseau avant la publication (épopée 7) ; changer un seuil, c'est changer ce fichier en revue de code.
2. **La légende suit la vidéo, pas la version** — une ligne par vidéo (série) et par réseau (migration 0013, table `legendes`) : éditer ou changer de gabarit ne la perd pas, et enregistrer ne crée pas de version.
3. **Refus, jamais de troncature** — un dépassement est refusé en nommant la borne ; les hashtags sont mis en minuscules et dédoublonnés. Le compteur est calculé par le serveur (la feuille fonctionne sans script) ; un compteur en direct pourra s'ajouter avec le script de la page.

## 3.8 Télécharger ma vidéo prête

Question : que livre le téléchargement, et comment sans rendu complet ?

1. **Couverture en SVG** — option A : rastériser en PNG/JPEG au téléchargement (dépendance ou ffmpeg) ; option B : livrer l'image SVG de 3.5 en pièce jointe. Retenu : B, sans dépendance. **Recommandation** : B tant qu'aucun réseau ne refuse le SVG de couverture ; sinon rastériser avec le rendu complet (conteneur ffmpeg).
2. **Un seul rendu complet à la fois** — `montage.telecharger` ne relance pas un rendu complet déjà en file ou en cours ; un rendu complet bloqué par une garde est refusé (`RENDU_PAS_PRET`) plutôt que relancé à l'identique.
3. **Rushes purgés** — un rendu complet déjà fait reste téléchargeable (FR-52) ; sans rendu à faire, la demande est refusée (`SEANCE_PURGEE`).

## 3.9 Ma bibliothèque de vidéos

Question : comment filtrer, archiver et supprimer sans publications ni suivi de la période ?

1. **Publications absentes** — la table `publications` n'existe pas avant l'épopée 7. `Montages.aPublicationPubliee` répond toujours faux en PostgreSQL ; la règle (refus `VIDEO_PUBLIEE`, archivage proposé) est en place et testée avec un faux. **Recommandation** : brancher la vraie requête dans 7.x et interdire alors toute suppression d'une vidéo publiée au niveau de la base aussi.
2. **Période** — le filtre `depuis`/`jusqua` porte sur la date de la dernière version de la vidéo (jours de Paris, bornes comprises), pas sur celle du premier film. Option : date de la première version. Recommandation : garder la dernière, c'est ce que la personne voit.
3. **Statut** — lu sur le rendu allégé le plus récent de la dernière version (à défaut, sur le rendu le plus récent) ; `sans_rendu` s'il n'y en a pas. Le filtre par réseau attend 7.5.
4. **Droit DELETE** — la migration 0014 accorde `DELETE` sur `montages`, `rendus`, `fichiers` et `legendes`, jusque-là refusé : la suppression d'une vidéo est la seule voie, en une transaction, sous RLS forcée, et chaque suppression est inscrite dans `suppressions` (insertion seule). Option : une fonction SQL `SECURITY DEFINER`. Recommandation : garder les droits actuels, la RLS suffit.
5. **Octets** — effacés du disque après la transaction ; un fichier qui résiste est compté dans `fichiersNonSupprimes` sans annuler la suppression (la base est déjà à jour). Un nettoyage des orphelins reste à écrire avec la purge (5.x).

## Histoire 4.11 — Rejouer ma démo à chaque mise en production

1. **Que veut dire « met à jour les brouillons concernés » ?** — Un montage est immuable et un jeu crée une nouvelle vidéo (série). Options : (a) notifier `montage_remplace` et laisser les anciens brouillons en bibliothèque ; (b) archiver automatiquement les anciens brouillons du script ; (c) créer une version de la série existante. Recommandation : (a) retenu, rien n'est archivé ni effacé sans geste ; (b) ou (c) à décider avec Benjamin (le film d'une version est celui de son parent, (c) impose un nouveau film).
2. **Échec au rejeu** — la notification d'étape échouée existe déjà (déclencheur SQL) ; le numéro d'étape et la capture sont sur la page du script (dernier jeu). Options : porter l'étape dans la notification (migration de `notifications`) ou garder ainsi. Recommandation : garder ainsi, reprendre avec 5.x si les notifications changent.
3. **Séance liée** — le jeu de rejeu ne crée pas d'autre objet qu'une tâche `jeu_script` et le montage de sa série : la « séance » est la tâche (entrée `rejeu: true`) ; pas de table de séances en V1.
4. **Un jeton par script** — activer un nouveau jeton révoque l'ancien (migration 0015 : `jetons_api.script_id`, durée ≤ 366 jours, portée `ecriture`, un seul espace). Alternative : plusieurs jetons (un par chaîne). Recommandation : un seul tant qu'aucune demande contraire.
5. **Limite de débit** — aucune limite de débit n'existe encore sur l'API ; un jeton de rejeu fuité peut enfiler des jeux (non cumulés par la file). Options : limite par jeton (fenêtre glissante) en 7.x ou au proxy. Recommandation : au proxy (Traefik) dès la mise en production.

## 7.1 L'administrateur ouvre la publication

Question : quelles décisions et quelles preuves manquent avant de publier réellement sur Instagram ?

1. **Inscription de l'application Meta** — aucune application n'est inscrite et aucun jeton n'existe : le connecteur Instagram (`publication/connecteur-instagram.ts`, « Instagram API with Instagram Login », hôtes `instagram.com`, `api.instagram.com`, `graph.instagram.com`, `graph.facebook.com`) n'a été testé que contre un faux serveur local. Options : Instagram Login (retenu, sans Page Facebook) ou Facebook Login avec Page. **Recommandation** : inscrire l'application, la passer en revue chez Meta avec les portées de `deploiement/reseaux.json` (`instagram_business_basic`, `instagram_business_content_publish`), puis rejouer le parcours avec un compte professionnel de test et corriger les écarts (versions d'API, champs).
2. **Test de la clé** — il appelle `client_credentials` sur `graph.facebook.com` avec l'identifiant et le secret : à confirmer qu'Instagram Login l'accepte avec la clé d'application Instagram (sinon, le test devra se limiter à la vérification de forme).
3. **Portées** — liste de départ, à confirmer à la revue d'application de Meta.
4. **Droit de publication par espace** — écarté en V1 (ajustement du 2026-10-18) : toute personne de la marque peut publier. Recommandation : le rouvrir si deux équipes partagent une marque.
5. **Limite de débit** — la limite par IP de l'inscription OAuth est factorisée (`auth/limite-debit.ts`), en mémoire et par processus. Recommandation : au proxy pour une limite globale.

## 7.6 Se connecter à Instagram

Question : quelles décisions et quelles preuves manquent pour relier un vrai compte Instagram ?

1. **Parcours OAuth non éprouvé** — l'échange du code, du jeton court puis du jeton long n'a été joué que contre le faux Meta local : aucun jeton réel n'existe. **Recommandation** : après l'inscription de l'application (voir 7.1), rejouer le parcours avec un compte professionnel de test, corriger les écarts (adresse de retour déclarée chez Meta = `<url publique>/reseaux/instagram/retour`, champs, versions).
2. **Durée et renouvellement du jeton long** — Meta donne environ 60 jours et permet de le rafraîchir ; regie n'automatise pas ce renouvellement (la personne reconnecte, ce qui remet les rappels J-7 et la veille). Options : rafraîchir automatiquement chaque mois, ou garder la reconnexion manuelle. **Recommandation** : reconnexion manuelle en V1, rafraîchissement automatique en V1.1 une fois le comportement réel connu.
3. **Rappels dans l'interface seule** — le courriel est repoussé en V1.1 (ajustement du 2026-10-18). Les rappels sont des notifications d'interface avec un bouton « Reconnecter » ; une personne qui ne se connecte pas ne les voit pas.
4. **Bornes de la vidéo publiée** (`publication.instagram` dans `deploiement/bornes.json` : 3 s à 15 min, 1 Gio) — valeurs de départ à confirmer contre la documentation de Meta en vigueur à l'inscription. **Recommandation** : les confirmer à la revue d'application, puis les durcir si besoin (le test de bornes nomme la borne dépassée).
5. **PKCE** — non utilisé : Instagram Login n'expose pas PKCE pour les applications serveur confidentielles ; la protection repose sur le `state` lié à la session et le secret d'application. À revoir si Meta l'ajoute.
6. **Un compte par espace** — un compte est relié à l'espace actif de la session et la personne qui le relie reçoit les rappels. Recommandation : rouvrir si deux personnes d'un même espace doivent être prévenues.

## 7.3 Publier maintenant, jamais deux fois

Question : quelles décisions et quelles preuves manquent pour publier réellement sur Instagram ?

1. **Pas de clé d'idempotence côté Meta** — l'API Graph n'en offre pas pour `media_publish` : la garantie « jamais deux fois » repose sur regie (tâche sans reprise, passage `en_file` → `envoi_en_cours` en compare-and-set, point de non-retour). La clé d'idempotence est conservée en base mais n'est pas transmise. **Recommandation** : vérifier à l'inscription si Meta en accepte une et la transmettre alors.
2. **État `incertaine`** — après une coupure ou un redémarrage une fois la publication partie, regie ne renvoie jamais : la publication est `incertaine`, cause et action « vérifier sur Instagram », non rejouable, vidéo non supprimable. Options : laisser la personne trancher (retenu) ou interroger Instagram pour retrouver le média (réconciliation par lecture). **Recommandation** : garder ainsi en V1, ajouter la lecture du dernier média du compte une fois l'API éprouvée.
3. **Quota réel** — le connecteur lit le quota de publication du compte ; le calcul n'a été éprouvé que contre le faux Meta. À confirmer avec un compte réel.
4. **Réconciliateur périodique** — un balayage déclare incertaines les publications dont la tâche a disparu ; la période est une valeur de départ.
5. **Adresse publique requise** — Meta lit la vidéo à une adresse signée `/v/publication/…` (moins d'une heure, valable seulement pendant l'envoi) : sans `urlPublique` joignable depuis Internet, rien ne peut être publié.
6. **Légende et hashtags** — leur somme peut dépasser 2 200 caractères : le refus nomme la borne ; à confirmer contre la règle en vigueur.
7. **Inscription de l'application Meta et jeton réel** — requis pour tout essai réel (voir 7.1 et 7.6).
8. **Cas limite** — si le lien de la tâche à la publication échoue après la mise en file, la publication reste `en_file` sans tâche ; le réconciliateur la signale. Recommandation : la déclarer en échec sûr au prochain balayage.

## 7.4 Programmer, déplacer ou annuler une publication

Question : quelles décisions et quelles preuves manquent pour publier à l'heure dite ?

1. **Heures de Paris ambiguës ou inexistantes** — au changement d'heure d'automne, une heure se répète : la première occurrence est retenue. Au printemps, une heure n'existe pas : elle est refusée (`PUBLICATION_ECHEANCE_INVALIDE`). Option : demander laquelle des deux. **Recommandation** : garder ainsi.
2. **Précision** — le départ se fait dans la minute (période du planificateur), pas à la seconde. **Recommandation** : suffisant pour des publications ; revoir si Meta l'exige.
3. **Acteur d'audit** — une tentative lancée par l'échéance est inscrite avec l'acteur `echeance:<utilisateurId>` et l'origine `echeance`, sans jeton d'API.
4. **Montage modifié** — la publication passe en `en_attente_confirmation` (cause `MONTAGE_MODIFIE`) et une notification est créée ; `publication.confirmer` fige la dernière version et reprogramme à la même heure. Sans accord à l'heure dite : échec `MONTAGE_MODIFIE`, action « rejouer ». Un retard de plus de 2 h donne `ECHEANCE_PERIMEE`, avec la même action.
5. **Quota** — non contrôlé à la programmation mais à l'envoi : une programmation peut donc échouer à l'heure dite si le quota du compte est atteint.
6. **Horizon d'un an** — borne de départ. Recommandation : la confirmer.
7. **Validation de bout en bout** — exige l'inscription de l'application Meta et un jeton réel (voir 7.1 et 7.6).

## 7.5 Résultat, rejeu et historique

Question : quelles décisions et quelles preuves manquent pour suivre et rejouer les publications ?

1. **Rejouer une publication incertaine** — refusé : elle est peut-être en ligne et regie n'a aucune clé d'idempotence côté Meta (voir 7.3). Option : permettre un « rejouer quand même » après confirmation explicite de la personne. **Recommandation** : l'ajouter seulement avec la lecture du dernier média du compte.
2. **Rejouer après `MONTAGE_MODIFIE`** — la dernière version est figée avant la nouvelle tentative (rendu complet prêt et légende enregistrée requis, quota contrôlé) ; après `ECHEANCE_PERIMEE`, la publication part maintenant. Les tentatives passées restent à l'historique.
3. **Pas de bouton dans l'interface** — le rejeu se fait par l'API et le MCP (`publication.rejouer`) ; la notification d'échec dit comment. Option : un bouton dans la bibliothèque, qui demande un lien entre notification et publication. **Recommandation** : le prévoir en V1.1.
4. **Filtre par réseau** — une vidéo apparaît pour un réseau dès qu'une publication non annulée y existe (programmée, en file, publiée, en échec, incertaine). Option : ne compter que les publiées. **Recommandation** : garder ainsi.
5. **Audit** — chaque tentative inscrit l'utilisateur, l'origine (`api`, `mcp`, `interface`, `echeance`) et l'identifiant du jeton d'API, jamais sa valeur ; le rejeu inscrit en plus l'action `publication.rejouer`.
6. **Validation de bout en bout** — exige l'inscription de l'application Meta et un jeton réel (voir 7.1 et 7.6).


## 9.2 Sauvegardes et restauration

Question : quelles décisions et quels accès réels manquent pour que les sauvegardes existent vraiment ?

1. **Installation réelle** — les scripts et unités systemd sont écrits et testés en local, jamais installés ni lancés. Benjamin les pose dans le CT et sur l'hôte Proxmox (voir `deploiement/restauration.md`). Recommandation : le faire avant la première vidéo réelle.
2. **Paire de clés age** — à générer par Benjamin hors du CT ; seule la clé publique entre dans la configuration, la privée va dans Vaultwarden. Recommandation : deux destinataires (Benjamin et un secours).
3. **Clé maîtresse du coffre** — conservée dans Vaultwarden et exclue des sauvegardes : sa perte rend les jetons illisibles (reconnexion des comptes). Option : la sceller aussi dans une enveloppe papier. Recommandation : Vaultwarden plus une copie papier.
4. **Seuils de fraîcheur** — 26 h pour la base, 8 jours pour le conteneur : valeurs de départ, à confirmer.
5. **Répétition de restauration** — jamais jouée sur une vraie machine ; le tableau de `deploiement/restauration.md` attend la date et la signature de Benjamin. Recommandation : la jouer une fois avant la mise en service, puis chaque trimestre.
6. **Alerte** — `/sante` expose l'âge des sauvegardes, mais rien ne surveille `/sante` de l'extérieur. Option : sonde externe ou notification. Recommandation : brancher la sonde existante de Benjamin.

## 9.3 Recette sur le compte Instagram de test

Question : quels accès réels manquent pour jouer la recette ?

1. **Compte Instagram de test et application Meta** — à créer par Benjamin (compte professionnel, application en mode développement, testeur ajouté). Sans eux, la recette de `docs/planning/recette-instagram.md` ne peut pas être jouée ; la même logique est prouvée contre le faux Meta (`coeur/test/recette-instagram.test.ts`). Recommandation : créer l'application avant de lancer l'épopée de mise en production (voir 7.1 et 7.6).
2. **Adresse publique joignable** — Meta doit pouvoir lire la vidéo à l'adresse signée ; à fournir lors de la recette (voir 7.3, point 5).
3. **Revue d'application Meta** — hors mode développement, Meta exige une revue de l'application. Option : rester en mode développement pour le seul compte Établia. Recommandation : rester en mode développement en V1.
4. **Vraie coupure d'un jeton** — le « jeton révoqué » est simulé par un refus du faux Meta ; la forme exacte de la réponse réelle est à confirmer pendant la recette (cas 2).

## 9.4 La première vraie vidéo Établia

Question : quelles décisions et quels accès réels restent pour clore la V1 ?

1. **Accord de publication** — la vidéo, sa légende et l'heure sont validées par Benjamin lui-même, jamais par un script. Option : publier tout de suite ou programmer. Recommandation : programmer à une heure choisie, pour garder le temps de vérifier l'adresse publique avant le départ.
2. **Note du MANDAT** — le lot 17 ne peut être noté « fait » qu'après la publication réelle ; non modifié ici. Recommandation : Benjamin l'ajoute après avoir signé le compte rendu de `docs/planning/premiere-video-etablia.md`.
3. **Compte Établia et application Meta** — accès réels que seul Benjamin possède (voir 7.1, 7.6 et 9.3). Recommandation : rester en mode développement de l'application, le compte Établia étant testeur.
4. **Ordre des garde-fous** — la publication réelle ne doit avoir lieu qu'après la recette 9.3 et la répétition de restauration 9.2 (cases à cocher du document). Recommandation : ne pas assouplir cet ordre.
