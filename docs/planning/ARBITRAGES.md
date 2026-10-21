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
