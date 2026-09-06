---
stepsCompleted: [step-01-init, step-02-discovery, step-02b-vision, step-02c-executive-summary, step-03-success, step-04-journeys, step-05-domain, step-06-innovation, step-07-project-type, step-08-scoping, step-09-functional]
inputDocuments:
  - ../../MANDAT.md
  - saas-souverain:marketing/video/README.md
  - saas-souverain:marketing/video/moteur/{format,scenes,montage,rendu,ffmpeg,images}.mjs
  - saas-souverain:marketing/video/generer.mjs
  - assets-video-2466-sauvegarde:PUBLICATION.md
documentCounts:
  briefs: 0
  research: 0
  brainstorming: 0
  projectDocs: 9
classification:
  projectType: web_app + developer_tool (serveur MCP)
  domain: marketing réseaux sociaux (vidéos d'écrans d'Établia)
  complexity: haute (jetons chiffrés + journal d'audit en V1 ; RGPD audience → V1.1)
  projectContext: brownfield (moteur vidéo porté) / greenfield (régie, MCP, éditeur, librairie)
  distribution: dépôt public dès le départ, un seul jeu de comptes (Établia) en V1, installation tierce non supportée avant V1.1
vision:
  pilotage: Claude pilote tout par MCP, l'UI est un miroir pour relire et corriger
  parityException: saisie des clés API et connexion OAuth restent UI seulement (aucun secret ne transite par MCP) — fondateur, 2026-09-05
  etatFutur: 3 vidéos/semaine, programmées, sur les comptes Établia, sans y penser
releaseMode: phased
workflowType: 'prd'
---

# Product Requirements Document - regie

**Author:** Benjaminduthe
**Date:** 2026-09-05

## Résumé exécutif

**regie** est une régie de réseaux sociaux à usage interne d'Établia, pilotée par Claude au travers d'un serveur MCP. Elle réunit en un seul objet « publication » ce qui se fait aujourd'hui en trois outils et trois moments : fabriquer une vidéo verticale d'écrans de l'application (à partir d'une liste ordonnée d'URL et d'une connexion enregistrée au tenant de démo), la préparer (légende, cinq hashtags FR maximum, réseaux cibles, date), puis la publier ou la programmer sur Instagram, Facebook Page et TikTok.

**Utilisateur cible (V1)** : le fondateur d'Établia — un seul jeu de comptes, une seule marque. Le dépôt est public dès le départ, parce que les agréments Meta et TikTok exigent une application publiée avec CGU et politique de confidentialité ; l'installation par des tiers n'est pas supportée avant la V1.1.

**Problème** : les trois coûts — fabriquer, publier, tenir la cohérence entre vidéo, légende, hashtags et date — tombent sur la même personne, à la main, et la cadence ne tient pas. Le moteur vidéo existant (Chromium + ffmpeg, zone sûre 880×1220, garde de lisibilité bloquante) produit des fichiers corrects mais s'arrête à la sortie du `.mp4` : rien ne relie la vidéo à sa publication.

**État futur visé** : trois vidéos par semaine, programmées, sur les comptes Établia, sans y penser. Claude reçoit « fais-moi trois vidéos sur le plan de nettoyage et programme-les » ; la régie les fabrique, les dépose dans la librairie ; le fondateur relit et corrige dans l'éditeur ; la publication part à l'heure prévue.

### Ce qui rend ce produit singulier

- **Claude pilote, l'interface est un miroir.** Chaque action métier — générer, éditer les textes et les animations, ranger en librairie, programmer, publier — existe d'abord comme outil MCP ; l'interface web sert à relire et corriger. Exception délibérée : la saisie des clés API et la connexion OAuth restent des actions d'interface uniquement, aucun secret ne transite par MCP.
- **La vidéo naît de l'application elle-même.** Aucun planificateur du marché ne fabrique le contenu depuis les écrans de l'app ; ici, une liste ordonnée d'URL plus une connexion enregistrée donnent une capture, un montage et un fichier prêt, avec les règles de publication déjà appliquées (muet, accroche en 3 s, zone sûre).
- **Un seul objet « publication ».** Vidéo, légende, hashtags, réseaux et date vivent ensemble ; la librairie est le point de passage obligé entre fabrication et diffusion, en un clic ou programmée.
- **Aucune IA en V1 hors MCP.** Pas de génération de texte, pas de suggestion : la valeur vient de l'enchaînement, pas d'un modèle.

## Classification du projet

| Axe | Valeur |
|---|---|
| Type | Application web + outil développeur (serveur MCP) |
| Domaine | Marketing réseaux sociaux — vidéos d'écrans de l'application Établia |
| Complexité | Haute : jetons chiffrés au repos et journal d'audit des publications en V1 ; RGPD sur les statistiques d'audience reporté en V1.1 |
| Contexte | Brownfield sur le moteur vidéo (porté depuis `saas-souverain/marketing/video/`) ; greenfield sur la régie, le serveur MCP, l'éditeur, la librairie et la publication |
| Distribution | Open source, dépôt public dès le départ ; un seul jeu de comptes (Établia) en V1 ; installation tierce non supportée avant V1.1 |
| Réseaux V1 | Instagram + Facebook Page (Meta Graph API) et TikTok (Content Posting API) ; LinkedIn : connecteur et clé présents, publication après agrément partenaire ; X : V2 (API payante) |

## Critères de succès

### Succès utilisateur

- Une vidéo coûte **au plus 10 minutes du temps du fondateur**, de la phrase adressée à Claude jusqu'à la publication programmée. L'intervention humaine se limite à la relecture et à la correction dans l'éditeur ; Chromium, ffmpeg et les applications de chaque réseau ne sont jamais ouverts à la main.
- « Fini » pour l'utilisateur = la publication porte le statut **programmée** avec sa date, ou **publiée** avec l'identifiant renvoyé par le réseau.
- Le moment « ça valait le coup » : Claude annonce que trois vidéos attendent dans la librairie ; le fondateur relit, corrige si besoin, programme — et n'y pense plus.

### Succès business

- **Cadence tenue** : 3 vidéos par semaine publiées sur Instagram, Facebook Page et TikTok pendant **12 semaines consécutives**, sans semaine à zéro. Mesurée dans la régie elle-même (journal des publications), sans dépendre des statistiques d'audience.
- Les inscriptions attribuables à etablia.fr et l'audience (abonnés, vues) **ne sont pas des critères de la V1** : la régie n'a pas de compteur côté Établia, et les statistiques d'audience n'existent qu'en V1.1.

### Succès technique

- **Aucun échec silencieux** : toute publication ratée (API, jeton expiré, fichier refusé) apparaît dans la régie avec sa cause et se rejoue en un clic ; aucune publication ne disparaît.
- **Reproductibilité du rendu** : la même fiche regénère la même vidéo ; les gardes du moteur (zone sûre 880×1220, lisibilité bloquante) ne sont contournables ni depuis l'éditeur ni depuis le MCP.
- **Aucun secret hors du coffre** : jetons chiffrés au repos, jamais dans les journaux, jamais dans le dépôt public, jamais renvoyés par un outil MCP ; chaque publication laisse une ligne d'audit (quoi, quand, quel réseau, quel résultat, à l'initiative de qui — UI ou MCP).

### Résultats mesurables

| Indicateur | Cible | Mesure |
|---|---|---|
| Temps humain par vidéo | ≤ 10 min | Durée cumulée des sessions d'édition et de programmation, horodatées par publication |
| Cadence | 3 publications/semaine × 3 réseaux, 12 semaines sans trou | Journal des publications |
| Échecs visibles | 100 % des échecs API avec cause et action « rejouer » | Journal d'audit rapproché des réponses API |
| Reproductibilité | Deux rendus successifs de la même fiche → même durée, mêmes scènes, mêmes textes | Test automatisé du moteur |
| Secrets | 0 jeton en clair dans la base, les journaux, le dépôt, les réponses MCP | Test automatisé + scan de secrets sur le dépôt |

## Périmètre du produit

### MVP — première tranche

**Chaîne complète sur Instagram seul, pilotée par MCP** (mode développeur Meta : comptes propres, sans agrément) :

1. **Paramètres** — saisie des clés Meta (identifiant et secret d'application) et connexion OAuth du compte Instagram professionnel. Interface uniquement.
2. **Générateur** — liste ordonnée d'URL de l'application + connexion enregistrée au tenant de démo → capture → montage → vidéo 1080×1920 muette (moteur porté).
3. **Éditeur** — textes et animations de chaque scène modifiables, regénération.
4. **Librairie** — chaque vidéo avec sa légende, ses hashtags (5 maximum, FR) et sa date.
5. **Publication** — Instagram Reels en un clic ou programmée.
6. **MCP** — un outil par action des points 2 à 5 ; rien pour les clés ni l'OAuth.
7. **Socle** — jetons chiffrés, journal d'audit, échecs visibles et rejouables.

### Croissance (après le MVP)

- **Fin de V1** : Facebook Page (même application Meta), TikTok (Content Posting API, publication privée jusqu'à l'agrément), connecteur et clé LinkedIn, pages CGU et politique de confidentialité publiées, dossiers d'agrément Meta et TikTok déposés.
- **V1.1** : publication LinkedIn après agrément partenaire ; statistiques d'audience avec traitement RGPD ; installation par des tiers (documentation, configuration par instance, support).

### Vision (au-delà)

- **V2** : X (API payante) ; comptes d'une deuxième marque (Fanny, MGA) — le modèle prévoit la marque dès la V1 mais n'en gère qu'une.
- Toute IA au-delà du MCP reste hors feuille de route tant qu'elle n'a pas été décidée.

## Parcours utilisateur

Un seul humain, le fondateur, sous deux casquettes (créateur et administrateur des clés) ; un consommateur d'API, Claude par MCP ; et l'application Établia côté capture, à travers son tenant de démo. Décisions qui fondent ces parcours (fondateur, 2026-09-06) : les URL viennent de **scénarios enregistrés dans la régie** ; la connexion à l'application se fait avec **les identifiants du tenant de démo conservés dans le coffre** ; un échec de publication est **visible dans la régie seulement** (aucune notification externe, aucune reprise automatique) ; tout se fait **sur ordinateur** en V1.

### Parcours 1 — Benjamin, créateur : trois vidéos programmées depuis une phrase

Lundi matin, Benjamin a une heure avant un rendez-vous. Il n'ouvre ni Chromium, ni ffmpeg, ni Instagram. Il écrit à Claude : « fais-moi trois vidéos sur le plan de nettoyage et programme-les mercredi, jeudi, vendredi à 12 h ».

Claude interroge la régie par MCP : le scénario « Plan de nettoyage » existe (liste ordonnée de pages du tenant de démo, textes par défaut). Il lance trois générations avec des accroches différentes. La régie se connecte au tenant de démo avec les identifiants du coffre, capture chaque page, monte, rend, et dépose trois vidéos dans la librairie avec légende, hashtags (5, FR) et dates proposées. Claude répond : « trois vidéos attendent dans la librairie ».

Benjamin ouvre la régie sur son ordinateur. La librairie montre les trois vidéos en statut **prête**. Il en lit une : l'accroche de la deuxième scène est trop plate. Il ouvre l'éditeur, change le texte, raccourcit l'animation, regénère — la garde de lisibilité passe. Il revient à la librairie, vérifie les dates, clique « programmer » trois fois. Statut **programmée**. Huit minutes se sont écoulées. Mercredi à 12 h, la première part seule ; la ligne d'audit note l'identifiant renvoyé par Instagram.

**Ce parcours révèle** : scénarios réutilisables (créer, lister, choisir), génération asynchrone avec état visible, librairie avec statuts, éditeur de scènes (textes et animations) avec regénération, programmation à date, exécution différée, audit de publication.

### Parcours 2 — Benjamin, créateur : la publication de 7 h a échoué

Jeudi, Benjamin ouvre la régie à 9 h. Dans la librairie, la vidéo programmée à 7 h porte le statut **échec** avec sa cause en clair : « jeton Instagram expiré ». Aucune notification n'est partie — c'est le choix de la V1 : l'échec est visible dans la régie, pas ailleurs.

Le bandeau de Paramètres signale la reconnexion à faire. Benjamin clique « reconnecter Instagram », passe l'OAuth Meta dans son navigateur, revient. Sur la vidéo en échec, il clique « rejouer ». Publiée à 9 h 04 ; la ligne d'audit conserve l'échec de 7 h et la reprise de 9 h 04.

**Ce parcours révèle** : statut d'échec avec cause lisible, action « rejouer » qui conserve l'historique, signalement d'un jeton à renouveler dans Paramètres, reconnexion OAuth depuis l'interface uniquement, audit qui garde toutes les tentatives. Et un coût assumé : Benjamin ne découvre l'échec qu'en ouvrant la régie.

### Parcours 3 — Benjamin, administrateur : première mise en route

Le dépôt est cloné, la régie tourne en local. Benjamin ouvre Paramètres. Trois blocs, dans l'ordre : **Réseaux** (application Meta : identifiant et secret, puis bouton « connecter Instagram » → OAuth ; TikTok, Facebook, LinkedIn présents mais grisés tant que leurs clés manquent), **Application à capturer** (adresse du tenant de démo, adresse de connexion et mot de passe du compte de démo — chiffrés dès l'enregistrement, jamais réaffichés), **Clé MCP** (jeton que Claude présentera, révocable).

Il clique « tester la connexion » sur l'application : la régie se connecte au tenant de démo et affiche la page d'accueil capturée — preuve que la chaîne marche. Il crée un premier scénario en collant cinq URL et en les ordonnant. Il n'a saisi aucun secret dans une conversation avec Claude.

**Ce parcours révèle** : Paramètres structurés par réseau et par service dès le départ, chiffrement à la saisie, test de connexion, gestion d'un jeton MCP, création de scénario dans l'interface.

### Parcours 4 — Claude, consommateur MCP : tout piloter sans jamais voir un secret

Claude se connecte au serveur MCP de la régie avec le jeton fourni. Il liste les outils : scénarios (lister, créer, modifier), générations (lancer, suivre l'état), vidéos (lister, lire les scènes, modifier un texte ou une animation, regénérer), publications (créer, programmer, publier, rejouer, lister par statut), audit (lire). Il ne trouve aucun outil pour les clés API, l'OAuth ou les identifiants du tenant de démo — par conception.

Il lance une génération ; l'outil renvoie un identifiant et un état « en cours ». Il interroge l'état jusqu'à « prête », lit les scènes, modifie l'accroche de la scène 2, regénère. La garde de lisibilité refuse : le texte dépasse la largeur lisible. L'outil renvoie la scène fautive et la mesure ; Claude raccourcit, regénère, la garde passe. Il programme la publication. Chaque appel est journalisé avec l'origine « MCP ».

**Ce parcours révèle** : parité UI ⇔ MCP sur les actions métier, exception explicite sur les secrets, opérations asynchrones interrogeables, erreurs de garde renvoyées avec un diagnostic exploitable, origine de chaque action dans l'audit.

### Parcours 5 — Benjamin, dépannage : la vidéo refusée par la garde

Une génération s'arrête en statut **refusée**. La librairie montre la raison : « scène 3, texte illisible à 390 px ». Benjamin ouvre l'éditeur directement sur la scène 3 : le texte est surligné, la mesure affichée, le seuil rappelé. Il coupe une phrase, regénère, la vidéo passe en **prête**. Il ne relance jamais la génération à l'aveugle : la garde dit où et pourquoi.

**Ce parcours révèle** : statut « refusée » distinct de « échec », diagnostic de garde pointant la scène, ouverture de l'éditeur sur la scène en cause, gardes non contournables (aucun bouton « forcer »).

### Synthèse des exigences issues des parcours

| Capacité | Parcours |
|---|---|
| Scénarios : liste ordonnée d'URL + textes par défaut, créés dans l'UI ou par MCP | 1, 3, 4 |
| Connexion enregistrée : identifiants du tenant de démo chiffrés, connexion automatique, test de connexion | 1, 3 |
| Génération asynchrone avec état (en cours, prête, refusée) | 1, 4, 5 |
| Éditeur de scènes : textes, animations, regénération, ouverture sur une scène donnée | 1, 4, 5 |
| Garde de lisibilité et zone sûre : bloquantes, diagnostic scène + mesure, jamais forçables | 4, 5 |
| Librairie : statuts brouillon / prête / refusée / programmée / publiée / échec, légende, hashtags, date | 1, 2, 5 |
| Publication : un clic ou programmée, exécution différée, rejouer avec historique | 1, 2 |
| Paramètres : blocs Réseaux / Application à capturer / Clé MCP, chiffrement à la saisie, OAuth UI seulement, signalement de jeton expiré | 2, 3 |
| Serveur MCP : outils métier en parité, aucun outil sur les secrets, jeton révocable, origine tracée | 3, 4 |
| Journal d'audit : toute tentative, cause, origine UI ou MCP, identifiant renvoyé par le réseau | 1, 2, 4 |

## Exigences propres au domaine

Décisions du fondateur (2026-09-06) : clé du coffre en variable d'environnement ; captures limitées à des hôtes autorisés avec le seul compte de démo ; pages CGU et confidentialité **servies par regie elle-même** ; bornes de chaque réseau vérifiées à l'entrée en librairie.

### Conformité et agréments

- **Meta (Instagram + Facebook Page)** — une application Meta unique. Le MVP tourne en mode développeur : seuls les comptes rattachés à l'application (rôles de test) peuvent publier, ce qui suffit aux comptes Établia. Publier hors de ces comptes exige l'App Review des permissions de publication Instagram et Pages (noms exacts relevés dans la console Meta au moment de la demande), avec pages CGU et politique de confidentialité publiques et une démonstration du parcours.
- **TikTok (Content Posting API)** — application non auditée : publications en privé uniquement. L'audit exige l'application publiée avec ses pages CGU et confidentialité, et impose des règles d'interface pour la publication directe (niveau de confidentialité choisi par l'utilisateur, mentions de contenu commercial) que la librairie doit respecter avant l'envoi.
- **LinkedIn** — publication vidéo de page réservée au programme partenaire Community Management ; V1 = connecteur et emplacement de clé seulement, publication après agrément.
- **Pages d'agrément servies par regie** — `/cgu` et `/confidentialite`, contenu versionné dans le dépôt, exposées sur une adresse publique. Conséquence : les routes publiques de regie sont **énumérées et minimales** (ces deux pages, les retours OAuth, et l'éventuelle URL signée temporaire de récupération d'une vidéo par un réseau) ; tout le reste — interface, MCP, fichiers — reste derrière authentification, et le serveur MCP n'est jamais joignable sans son jeton.
- **RGPD** — données personnelles en V1 : les jetons du fondateur, les identifiants du compte de démo, le journal d'audit (initiateur UI ou MCP). Aucune donnée d'un tiers. Statistiques d'audience → V1.1 (déjà acté). Les captures ne montrent que le tenant de démo (garde ci-dessous).
- **Droits sur le contenu** — vidéos muettes par conception, le son est ajouté dans l'application du réseau (couvert par sa licence) ; écrans d'Établia = propriété du fondateur ; ≤ 5 hashtags, FR.

### Contraintes techniques

- **Coffre** — clé maîtresse lue au démarrage dans l'environnement du service (`REGIE_MASTER_KEY` ou équivalent) ; jamais en base, jamais dans le dépôt, jamais journalisée. Absente → regie refuse de démarrer avec un message explicite. Chiffrement authentifié (AES-256-GCM ou équivalent) de chaque secret ; rotation par commande de rechiffrement ; un secret saisi n'est jamais réaffiché.
- **Garde des données de démo** — Paramètres déclare la liste des hôtes autorisés à la capture ; toute URL de scénario hors liste est refusée à la création, dans l'interface comme par MCP ; un seul jeu d'identifiants, celui du compte de démo ; l'hôte capturé est inscrit dans l'audit de chaque génération.
- **Bornes par réseau** — un fichier versionné par réseau (conteneur, codec, ratio, durée min/max, taille max, longueur de légende, nombre de hashtags) ; contrôle à l'entrée en librairie : hors bornes → « refusée » avec la cause, jamais « prête ». Le quota de publication Meta est **lu via l'API** avant programmation, pas codé en dur. Un test automatisé charge chaque fichier de bornes.
- **Cycle de vie des jetons** — les jetons Meta longue durée expirent (de l'ordre de 60 jours), TikTok renouvelle un jeton court par un jeton de rafraîchissement (valeurs à confirmer dans la documentation officielle à l'implémentation). regie vérifie l'expiration à venir et l'affiche dans Paramètres **avant** l'échec ; l'échec lui-même reste visible dans la régie seulement.
- **Programmation** — fuseau `Europe/Paris` ; les publications programmées survivent à un redémarrage ; une **clé d'idempotence par publication** interdit le double envoi (rejeu, redémarrage pendant l'envoi).
- **Récupération de la vidéo par le réseau** — Instagram récupère un Reel depuis une URL publique ou par téléversement reprenable ; TikTok accepte le téléversement direct ; Facebook Page le téléversement direct. Le choix (URL signée à courte durée sur l'hôte public, ou téléversement) se tranche à l'architecture ; le PRD exige seulement qu'aucune vidéo ne reste accessible publiquement après publication.

### Intégrations

| Système | Rôle | Sens | Contrainte |
|---|---|---|---|
| Meta Graph API | Instagram Reels + Facebook Page | regie → réseau | OAuth UI seulement, quota lu, bornes fichier |
| TikTok Content Posting API | TikTok | regie → réseau | privé tant que non audité, règles d'interface |
| LinkedIn API | connecteur seul en V1 | — | publication après agrément |
| Établia (tenant de démo) | source des captures | regie → app | hôtes autorisés, compte de démo, Playwright, session en cache |
| Moteur vidéo porté | rendu | interne | Chromium + ffmpeg épinglés, gardes bloquantes |
| Serveur MCP | pilotage par Claude | Claude → regie | jeton révocable, aucun outil sur les secrets |

### Risques et parades

| Risque | Parade |
|---|---|
| Double publication (rejeu, redémarrage) | clé d'idempotence + audit de chaque tentative |
| Jeton expiré la nuit | contrôle d'expiration proactif dans Paramètres ; échec rejouable |
| Donnée réelle filmée | hôtes autorisés + compte de démo + hôte dans l'audit |
| Secret dans un log, une réponse MCP, le dépôt public | coffre, masquage, scan de secrets bloquant en CI, `.env.exemple` sans valeur |
| Surface publique de regie (pages d'agrément) | routes publiques énumérées, tout le reste authentifié, MCP à jeton |
| Restriction ou bannissement par un réseau | quotas lus, aucun contournement, un seul jeu de comptes |
| Un réseau change ses bornes | fichier versionné + test qui le charge ; échec lisible « hors bornes » |
| Perte de la clé maîtresse | refus de démarrer explicite, procédure de rotation documentée, clé sauvegardée hors dépôt |
| Rendu non reproductible | versions épinglées, test de reproductibilité (critère de succès) |

## Innovation et motifs inédits

Décisions du fondateur (2026-09-06) : la combinaison est documentée comme innovation ; regie remet en cause deux hypothèses ; la validation est le parcours 1 joué par le MCP seul, chronométré ; le repli est « l'interface fait tout, le MCP devient complément ».

Signaux du type de projet (`project-types.csv`) : `web_app` → « nouvelle interaction » ; `developer_tool` → « nouveau paradigme ». Les deux sont présents. Ni création de DSL ni WebAssembly.

### Zones d'innovation détectées

1. **Le pilote est Claude, l'interface est un miroir.** Hypothèse remise en cause : « un outil de réseaux sociaux se pilote par son interface ». Dans regie, chaque capacité (scénarios, générations, éditeur, librairie, publication, audit) existe d'abord comme outil MCP ; l'interface sert à relire, corriger, et à ce que le MCP ne fait pas par conception (clés API, OAuth). Ce qui est neuf : un planificateur conçu comme un serveur d'outils, avec une interface par-dessus — pas une interface à laquelle on greffe une API.
2. **La vidéo naît de l'application vivante.** Hypothèse remise en cause : « une vidéo produit se tourne ». Dans regie, une vidéo est un scénario (URL ordonnées + connexion enregistrée) rejoué par Chromium contre le tenant de démo. Regénérer après une mise à jour de l'app coûte une commande, pas un tournage. Ce qui est neuf : la vidéo est une fonction de l'app à un instant donné, reproductible — pas un fichier figé.
3. **La combinaison.** Un seul objet « publication » traverse scénario → génération → librairie (garde bloquante) → programmation → audit, pilotable de bout en bout par un agent. C'est l'enchaînement qui est neuf, pas chaque brique.

### Contexte de marché et concurrence

Aucune recherche web n'a été menée pour cette section ; ce qui suit est l'état de connaissance à la rédaction, sans chiffre, à vérifier avant tout usage externe.

- **Planificateurs sociaux** (Buffer, Hootsuite, Later, Metricool, Publer…) : programmation multi-réseaux et statistiques, pilotés par leur interface, API propriétaire éventuelle. Aucun ne produit la vidéo depuis l'application du client. L'existence d'un serveur MCP officiel chez l'un d'eux n'est pas vérifiée.
- **Enregistreurs d'écran** (Loom, Screen Studio, OBS) : capture et montage manuels, pas de scénario rejouable, pas de publication.
- **Vidéo programmatique** (Remotion, Motion Canvas) : rendu par code, réutilisable ; le contenu vient du code, pas d'une application connectée ; pas de publication.
- **Automatisation de navigateur** (Playwright) : c'est la brique de regie, pas un concurrent.
- **Serveurs MCP communautaires** pour réseaux sociaux : probablement existants, non inventoriés.

Inconnu : si un acteur combine déjà les trois. Sans conséquence en V1 — regie sert Établia, pas un marché ; l'installation tierce est V1.1.

### Approche de validation

Un test unique, rejouable, à résultat binaire : **le parcours 1 exécuté par Claude via le MCP seul.**

- **Protocole** : depuis une session Claude reliée au MCP de regie, avec un scénario enregistré et Instagram connecté, demander « trois vidéos programmées cette semaine ». Benjamin ne touche l'interface que pour relire (librairie, éditeur si correction).
- **Réussite** : trois publications au statut « programmée », entrées d'audit d'origine « MCP », temps de Benjamin ≤ 10 min chronométrées (critère de succès utilisateur), aucun secret saisi via Claude.
- **Échec** : une étape qui exige l'interface pour autre chose que relire ; plus de 10 min ; une erreur de garde que Claude ne peut pas exploiter (sans scène ni mesure).
- **Quand** : à la fin du MVP (Instagram seul), avant d'ouvrir Facebook et TikTok ; rejoué à chaque version qui touche le MCP.
- **Second signal** : la cadence tenue 12 semaines (critère business) confirme, elle ne remplace pas le test.

### Parades aux risques

| Risque | Parade |
|---|---|
| Le pilotage MCP est fragile (outils trop fins, états asynchrones mal exposés) | Repli décidé : l'interface fait tout, le MCP devient complément. Contrainte de conception qui en découle : MCP et interface appellent **les mêmes services applicatifs** ; aucune logique métier n'existe que côté MCP, ni que côté interface hors clés/OAuth. Un test automatisé vérifie que chaque outil MCP correspond à un service que l'interface appelle aussi. |
| La capture rend une vidéo différente à chaque génération | Déjà exigé (critère technique « reproductibilité du rendu ») : versions épinglées, tenant de démo stable, hôtes autorisés. |
| L'app change et casse un scénario | L'échec de génération nomme l'URL fautive ; le scénario se corrige dans l'éditeur, sans tournage. |
| Un serveur MCP exposé est une surface d'attaque | Déjà couvert : jeton obligatoire, jamais de secret via MCP, origine « MCP » dans l'audit, MCP jamais joignable sans jeton. |
| Personne d'autre ne veut de cette combinaison | Sans effet en V1 ; à réévaluer avant V1.1 (installation tierce). |

## Exigences propres au type de projet

Deux types se combinent : **application web** (la régie, l'éditeur, la librairie, Paramètres) et **outil pour développeurs** (le serveur MCP que Claude consomme). Décisions du fondateur (2026-09-06) : rendu « pages serveur + îlots interactifs » ; navigateurs Chromium et Firefox récents, tests sur Chromium seul ; état rafraîchi par interrogation périodique, la même que celle du MCP ; accessibilité socle (clavier, contrastes, libellés) ; un seul runtime Node/TypeScript ; MCP en HTTP distant avec jeton ; installation V1 par `git clone` + `pnpm install` + `.env` ; documentation = README + référence MCP générée depuis le code + exemples de prompts.

### Vue d'ensemble du type de projet

- **Application web** : un seul utilisateur humain, sur ordinateur, derrière authentification ; routes publiques énumérées (`/cgu`, `/confidentialite`, retours OAuth). Pas de boutique d'applications, pas de fonction native, pas de mobile en V1.
- **Outil pour développeurs** : le « développeur » est Claude. Le produit livré est un serveur MCP joignable en HTTP, un jeton, une référence d'outils et des prompts d'exemple. Pas de ligne de commande à distribuer en V1 : tout ce qui n'est pas MCP passe par l'interface.
- **Ce que ces types écartent** : conception visuelle poussée (la maquette HTML validée après le grill tient lieu de référence), conformité de boutique, fonctions natives, commandes en ligne.

### Considérations d'architecture technique

- **Une seule base de code, un seul runtime** : Node LTS + TypeScript, gestion par pnpm. Le moteur vidéo existant (`.mjs`) est porté dans ce runtime, sans réécriture dans un autre langage.
- **Une couche de services partagée** : chaque capacité métier (scénarios, générations, vidéos, publications, audit) est un service applicatif appelé **à l'identique** par les pages de l'interface et par les outils MCP. Ni l'un ni l'autre ne porte de logique propre, hors saisie des clés et OAuth (interface seulement). Un test automatisé vérifie la correspondance outil MCP ⇔ service (déjà exigé au chapitre Innovation).
- **Pages serveur + îlots interactifs** : les pages (librairie, Paramètres, audit, liste des scénarios) sont rendues côté serveur ; deux îlots interactifs : l'éditeur de scènes (texte, animation, prévisualisation) et l'ordonnancement des URL d'un scénario. Framework tranché à l'architecture.
- **Rafraîchissement périodique, pas de flux temps réel** : une page qui affiche une génération ou une publication en cours réinterroge le même point de lecture que l'outil MCP « suivre l'état ». Aucun canal WebSocket ou SSE en V1.
- **Serveur MCP en HTTP distant** : point d'entrée HTTP de la régie (transport MCP « Streamable HTTP »), jeton porteur obligatoire sur chaque requête, révocable depuis Paramètres, jamais de session sans jeton. Serveur MCP et interface tournent dans le même processus ou dans deux processus du même dépôt (tranché à l'architecture) et partagent la base, le coffre et les services.
- **Tâches longues hors requête** : générations (Chromium + ffmpeg) et publications programmées s'exécutent hors du cycle requête/réponse, avec état persistant ; la programmation survit au redémarrage (déjà exigé au chapitre Domaine).
- **Stockage** : base de données et fichiers vidéo locaux au poste ou au serveur qui héberge regie ; chemin configuré ; aucun stockage externe en V1. Le choix de la base (fichier ou serveur) est tranché à l'architecture ; le PRD exige des migrations de schéma versionnées dès la V1.

### Navigateurs pris en charge

| Navigateur | Statut V1 |
|---|---|
| Chromium récents (Chrome, Edge, Brave, Arc) | pris en charge, **testé** en CI |
| Firefox récent | pris en charge, non testé automatiquement ; un défaut signalé se corrige |
| Safari | non ciblé ; peut fonctionner, aucun correctif garanti |
| Navigateurs mobiles | hors V1 (ordinateur seulement) |

« Récent » = les versions à jour au moment de la livraison ; aucune compatibilité avec des versions anciennes n'est promise. Chromium est aussi le moteur de capture (Playwright) : une seule version épinglée sert les deux usages.

### Mise en page

Ordinateur seulement (fondateur, 2026-09-06). Une largeur minimale est fixée à l'architecture (proposition : 1 280 px) ; en dessous, un bandeau explique que regie se relit sur ordinateur, sans casser la page. Pas de mise en page mobile, pas de gestes tactiles. Relecture mobile de la librairie → hors V1, à réévaluer en V1.1.

### Cibles de performance

Aucune mesure n'existe aujourd'hui : le moteur vidéo actuel n'a jamais été chronométré de bout en bout, et regie n'existe pas. Le PRD fixe donc des **principes**, et des cibles **proposées** à confirmer après une première mesure (première tâche du sprint d'architecture : chronométrer une génération du scénario « traiteur 1 » sur le poste du fondateur).

- **L'interface n'attend jamais un rendu** : lancer une génération ou une publication rend la main immédiatement ; l'état s'affiche au rafraîchissement suivant.
- **Durée de génération visible** : chaque génération enregistre sa durée ; la librairie l'affiche. Aucune cible chiffrée en V1 : la durée dépend du nombre de pages et du poste.
- **Pages** : une page de la régie s'affiche sans attendre un service externe (jamais d'appel réseau vers un réseau social pendant le rendu d'une page ; quotas et expirations sont lus en tâche de fond et stockés).
- **Interrogation périodique** : intervalle proposé de 5 s sur une page qui montre une tâche en cours, aucune interrogation ailleurs ; le même intervalle est recommandé dans la documentation MCP.
- **Publication programmée** : partie dans la minute qui suit l'heure prévue ; l'écart réel est enregistré dans l'audit.

### Référencement

Aucun. regie n'a pas de public. Les routes authentifiées portent `noindex` ; `/cgu` et `/confidentialite` sont accessibles aux examinateurs des plateformes (Meta, TikTok) sans être promues ; `robots.txt` interdit tout le reste.

### Niveau d'accessibilité

Socle (fondateur, 2026-09-06) : toute action se fait au clavier (ordre de tabulation, focus visible, raccourcis de l'éditeur documentés) ; contrastes conformes au seuil AA (4,5:1 pour le texte) ; chaque champ, bouton et statut porte un libellé texte (jamais une couleur seule pour « prête / refusée / échec »). Pas d'audit lecteur d'écran en V1. Un contrôle automatisé de contraste et de libellés tourne sur chaque page de la maquette, puis en CI.

### Langages et environnement

| Composant | Choix | Épinglage |
|---|---|---|
| Runtime | Node.js LTS | version dans `.nvmrc` et `engines` |
| Langage | TypeScript (moteur porté en `.mjs`, typé progressivement) | |
| Gestionnaire | pnpm | `packageManager` dans `package.json`, `pnpm-lock.yaml` versionné |
| Capture | Playwright + Chromium | version Playwright épinglée, navigateur installé par `pnpm exec playwright install chromium` |
| Rendu | ffmpeg (libx264) | version minimale documentée ; binaire système ou paquet embarqué tranché à l'architecture |
| SDK MCP | SDK TypeScript officiel du Model Context Protocol | version épinglée |

Python, Docker et tout second runtime sont écartés de la V1.

### Installation

V1 = un seul chemin, pour le fondateur :

1. `git clone https://github.com/BenjaminDuthe/regie` puis `pnpm install`.
2. `cp .env.exemple .env`, renseigner `REGIE_MASTER_KEY` (générée localement, jamais fournie par le dépôt) et l'adresse d'écoute.
3. `pnpm exec playwright install chromium` ; vérifier ffmpeg.
4. `pnpm dev` (ou `pnpm start` après `pnpm build`) ; ouvrir l'interface, suivre le parcours 3 (Paramètres → réseaux → application à capturer → clé MCP).

Le dépôt ne contient aucun secret ; `.env.exemple` liste chaque variable avec une valeur vide et un commentaire. Un scan de secrets bloque toute contribution (déjà exigé). Image Docker et paquet npm → V1.1, avec l'installation tierce.

### Surface d'API

La seule API publique de regie est le **serveur MCP**. Pas d'API REST documentée en V1 : l'interface consomme les services en interne.

Familles d'outils (issues du parcours 4) — noms exacts fixés à l'architecture, référence générée depuis le code :

| Famille | Outils | Contrat |
|---|---|---|
| Scénarios | lister, lire, créer, modifier | URL vérifiées contre les hôtes autorisés ; refus explicite hors liste |
| Générations | lancer, suivre l'état | renvoie un identifiant et un état (en cours / prête / refusée / échec) ; jamais bloquant |
| Vidéos | lister, lire les scènes, modifier un texte ou une animation, regénérer | erreur de garde = scène fautive + mesure + seuil |
| Publications | créer, programmer, publier maintenant, rejouer, lister par statut | clé d'idempotence ; bornes du réseau vérifiées ; quota Meta lu |
| Audit | lire, avec filtres (origine, statut, période) | lecture seule |

Ce qui n'existe **pas** par conception : outils sur les clés API, l'OAuth, les identifiants du tenant de démo, le jeton MCP lui-même. Aucune réponse d'outil ne contient un secret ; un test le vérifie sur chaque outil.

Contrat commun : identifiants stables, états énumérés, erreurs structurées (code, message en français, contexte exploitable), origine « MCP » et identifiant de jeton dans l'audit de chaque appel qui modifie l'état.

### Exemples

Les « exemples de code » de regie sont des **prompts**, puisque le consommateur est Claude. La documentation en livre au moins cinq, un par parcours, rejoués à chaque version :

1. « Fais-moi trois vidéos sur le plan de nettoyage et programme-les mercredi, jeudi, vendredi à 12 h » (parcours 1).
2. « La publication de 7 h a échoué, pourquoi ? Rejoue-la » (parcours 2, une fois Instagram reconnecté dans l'interface).
3. « Crée un scénario “Réception HACCP” avec ces cinq adresses dans cet ordre » (parcours 3, côté MCP).
4. « Raccourcis l'accroche de la scène 2 de la vidéo X et regénère » (parcours 4).
5. « Pourquoi la vidéo Y est refusée ? Corrige la scène en cause » (parcours 5).

S'y ajoutent : le bloc de configuration pour déclarer le serveur dans Claude Code et Claude Desktop (adresse + en-tête d'autorisation, jeton remplacé par `<JETON>`), et un exemple de réponse d'outil par famille.

### Portage et migrations

- **Portage du moteur vidéo** (brownfield) : `format`, `scenes`, `montage`, `rendu`, `ffmpeg`, `images` sont repris tels quels dans regie, gardes comprises (zone sûre 880×1220 à (0, 220), 1080×1920 à 25 i/s, lisibilité). Ce qui change : un scénario vit en base (plus un fichier `.mjs` par vidéo) ; la connexion à l'app vient du coffre (plus des variables d'environnement lues par une spec e2e) ; les médias de substitution restent possibles quand une page n'est pas capturable. Recette du portage : les six scénarios existants (trois traiteur, trois restaurateur) réécrits comme scénarios regie et rendus à l'identique.
- **Schéma de données** : migrations versionnées dès le premier commit ; aucune modification de schéma sans migration ; une V1.1 se met à jour par `git pull` + `pnpm install` + migrations au démarrage.
- **Coffre** : rotation de `REGIE_MASTER_KEY` par commande de rechiffrement (déjà exigé) ; le format chiffré porte un numéro de version pour permettre un changement d'algorithme.
- **MCP** : la référence générée est versionnée avec le code ; un outil retiré ou renommé est annoncé dans le journal des modifications avant la version qui le retire.

### Considérations de mise en œuvre

- **Ordre** : MVP = chaîne complète sur Instagram (scénario → génération → librairie → programmation → audit, MCP + interface), puis Facebook Page, puis TikTok, puis connecteur LinkedIn.
- **Tests exigés par ce type** : parité outil MCP ⇔ service ; aucun secret dans une réponse d'outil ; chargement de chaque fichier de bornes ; reproductibilité du rendu ; contraste et libellés ; référence MCP à jour (la CI échoue si la référence générée diffère du fichier versionné).
- **CI** : GitHub Actions sur le dépôt public (Chromium et ffmpeg installés dans le job), scan de secrets bloquant, tests ci-dessus. Aucun secret de plateforme dans la CI en V1 : les tests contre Meta ou TikTok sont manuels, sur les comptes Établia.
- **Maquette avant code** : la maquette HTML servie par le serveur de développement (lot 5 du mandat) fixe la structure des pages et des deux îlots avant toute implémentation.
- **Hors périmètre confirmé** : Docker, paquet npm, ligne de commande, API REST publique, mobile, temps réel, second runtime.

## Cadrage du projet et développement par phases

Le fondateur a fixé les phases dès le mandat : X en V2 (API payante), installation par des tiers en V1.1, LinkedIn en publication après agrément. Le cadrage ci-dessous ne crée donc pas de phases, il les remplit. Décisions prises à cette étape (fondateur, 2026-09-06) : après le MVP, l'ordre est **Facebook Page → TikTok → connecteur LinkedIn** ; l'hypothèse technique la plus risquée est **vérifiée par un script jetable avant toute ligne de régie** ; la recette du MVP se fait sur **un compte Instagram de test dédié**, le compte Établia ne recevant que la première vraie vidéo ; si le temps manque, **TikTok glisse en V1.1** en premier.

### Stratégie et philosophie du MVP

#### Approche MVP

Le MVP est **la chaîne complète sur Instagram seul, pilotée par MCP** (§ Périmètre du produit) : un scénario, une génération, une correction dans l'éditeur, une publication programmée qui part seule, une ligne d'audit. Il ne vise pas la couverture des réseaux mais la preuve de la chaîne : si le parcours 1 se joue par MCP seul, en moins de dix minutes de temps fondateur, le produit tient ; sinon le repli est déjà défini (§ Innovation : l'interface fait tout, le MCP devient complément).

Trois principes tiennent ce MVP :

1. **Le plus risqué d'abord.** Avant toute ligne de régie, un script jetable hors dépôt publie un Reel muet sur le compte de test via l'API Meta en mode développeur, sans agrément. Le résultat (réussite, ou blocage et sa cause) est consigné dans ce PRD. Si la publication ne passe pas sans agrément, la forme du MVP est revue avant qu'une ligne de régie n'existe.
2. **Rien de silencieux, rien d'inventé.** Chaque état est visible (§ Parcours utilisateur), chaque échec porte sa cause, chaque garde renvoie la scène et la mesure. Les cibles de performance restent des propositions tant qu'une génération du scénario « traiteur 1 » n'a pas été chronométrée (§ Exigences propres au type de projet).
3. **La recette ne touche pas la marque.** Un compte Instagram professionnel de test, rattaché à l'application Meta, reçoit toutes les publications de recette. Le compte Établia est ajouté dans Paramètres après la recette et ne reçoit que la première vraie vidéo, relue par le fondateur.

Ce que le MVP **ne contient pas**, par décision : Facebook Page, TikTok, LinkedIn, les pages `/cgu` et `/confidentialite` (nécessaires aux dossiers d'agrément, pas à la publication en mode développeur sur les comptes rattachés), les dossiers d'agrément, les statistiques d'audience, l'installation par des tiers, toute IA hors MCP.

#### Ressources nécessaires

- **Personnes** : le fondateur (produit, comptes et clés, OAuth, relecture, dossiers d'agrément, première publication) et Claude (code, tests, documentation, pilotage par MCP). Aucun tiers.
- **Compétences** : Node/TypeScript, Playwright, ffmpeg (déjà pratiqués sur le moteur existant) ; API Meta Graph (nouveau) ; SDK MCP TypeScript officiel (nouveau).
- **Comptes et accès** : une application Meta en mode développeur ; un compte Instagram professionnel de test rattaché à l'application ; le tenant de démo d'Établia avec ses identifiants dans le coffre ; le dépôt public `regie`.
- **Matériel** : le poste du fondateur (rendu Chromium + ffmpeg en local, ordinateur seulement en V1). Aucun serveur ni service payant pour le MVP ; l'adresse publique des pages d'agrément (fin de V1) se tranche à l'architecture.
- **Charge** : aucune estimation n'est posée ici ; elle relève de l'architecture, après le script jetable et le chronométrage de « traiteur 1 ». La seule échéance qui engage est le critère de succès : la cadence de trois vidéos par semaine se mesure sur douze semaines à partir de la livraison de la V1.

### Périmètre fonctionnel du MVP (phase 1)

#### Parcours utilisateur couverts

| Parcours | Couverture MVP |
|---|---|
| 1 — Trois vidéos programmées depuis une phrase | Entier, sur Instagram : c'est le parcours de validation, joué par MCP seul et chronométré |
| 2 — La publication de 7 h a échoué | Entier : échec visible avec cause, reconnexion OAuth dans Paramètres, « rejouer » avec historique |
| 3 — Première mise en route | Bloc Réseaux limité à Meta/Instagram ; blocs Application à capturer et Clé MCP entiers ; test de connexion ; premier scénario |
| 4 — Claude pilote tout par MCP | Entier : les cinq familles d'outils, aucun outil sur les secrets, origine « MCP » dans l'audit |
| 5 — La vidéo refusée par la garde | Entier : statut « refusée », diagnostic scène + mesure, éditeur ouvert sur la scène en cause |

#### Capacités indispensables

Les sept points du § Périmètre du produit, avec ce que « fini » veut dire pour chacun :

1. **Paramètres** — clés de l'application Meta, OAuth Instagram, hôtes autorisés, identifiants du tenant de démo chiffrés à la saisie, jeton MCP révocable, signalement d'un jeton à renouveler. Fini quand un secret saisi n'apparaît ni en base en clair, ni dans un log, ni dans une réponse MCP.
2. **Générateur** — scénario (URL ordonnées, textes par défaut), connexion enregistrée au tenant de démo, capture Playwright, montage et rendu par le moteur porté, vidéo 1080 × 1920 muette. Fini quand les six scénarios existants rendent à l'identique (recette du portage).
3. **Éditeur** — textes et animations de chaque scène modifiables, regénération, ouverture sur une scène donnée, gardes bloquantes avec diagnostic. Fini quand le parcours 5 se joue dans l'interface et par MCP.
4. **Librairie** — statuts brouillon / prête / refusée / programmée / publiée / échec, légende, cinq hashtags FR, date ; bornes Instagram vérifiées à l'entrée.
5. **Publication Instagram** — Reel en un clic ou programmé, exécution différée qui survit au redémarrage, clé d'idempotence, « rejouer » avec historique, quota lu via l'API.
6. **MCP** — un outil par action des points 2 à 5, aucun sur les clés, l'OAuth ou les identifiants ; test automatisé de correspondance outil ⇔ service.
7. **Socle** — coffre chiffré, journal d'audit (tentative, cause, origine, identifiant renvoyé), CI avec scan de secrets.

**Sortie du MVP** : parcours 1 joué par MCP seul, chronométré sous dix minutes de temps fondateur ; première publication réelle sur le compte Établia, relue par le fondateur ; résultat du script jetable et chronométrage de « traiteur 1 » consignés.

### Fonctionnalités après le MVP

#### Phase 2 — fin de V1

Dans l'ordre décidé, chaque réseau livré et recetté avant le suivant :

1. **Facebook Page** — même application Meta, même jeton ; connecteur, fichier de bornes propre au format Page, test de chargement. Réutilise tout du MVP.
2. **TikTok** — application TikTok séparée, connecteur Content Posting API, fichier de bornes, règles d'interface imposées à la publication directe (niveau de confidentialité, mention commerciale). Livré = connecteur qui publie **en privé** tant que l'audit n'est pas passé ; la demande d'audit est une tâche du fondateur, hors code, qui exige les pages d'agrément ci-dessous.
3. **Connecteur LinkedIn** — connecteur et emplacement de clé, sans publication (agrément partenaire requis).
4. **Pages `/cgu` et `/confidentialite`** servies par regie, contenu versionné, routes publiques énumérées ; **dossiers d'agrément Meta et TikTok** déposés par le fondateur.

Livrable de fin de V1 : la cadence de trois vidéos par semaine sur Instagram, Facebook Page et TikTok (privé ou public selon l'audit), mesurée douze semaines dans le journal de regie.

#### Phase 3 — V1.1

- **Publication LinkedIn** dès l'agrément partenaire obtenu.
- **Statistiques d'audience** avec le traitement RGPD associé (premières données de tiers).
- **Installation par des tiers** : documentation, configuration par instance, Docker ou paquet npm, support.
- **TikTok**, si le fondateur l'a fait glisser depuis la V1 faute de temps.

**Au-delà (V2, vision)** : X (API payante), deuxième marque (Fanny, MGA) ; toute IA au-delà du MCP reste hors feuille de route tant qu'elle n'est pas décidée.

### Stratégie de maîtrise des risques

#### Risques techniques

| Risque | Parade de cadrage |
|---|---|
| La publication d'un Reel sans agrément ne passe pas en mode développeur | Script jetable **avant toute ligne de régie** ; résultat consigné ; si blocage, forme du MVP revue |
| Le rejeu de la connexion enregistrée casse (session expirée, écran de connexion modifié, second facteur exigé) | Test de connexion dans Paramètres ; génération en « échec » avec l'étape fautive ; à vérifier sur le tenant de démo : le compte de capture ne doit pas exiger de second facteur, sinon le rejeu automatique est impossible |
| Le moteur porté ne rend plus comme l'original | Recette du portage = six scénarios existants rendus à l'identique ; versions Chromium et ffmpeg épinglées |
| Les cibles de performance proposées sont fausses | Chronométrage de « traiteur 1 » en première tâche d'architecture ; les valeurs proposées sont remplacées, pas complétées |
| Jeton Meta expiré, jeton TikTok non rafraîchi | Contrôle d'expiration proactif dans Paramètres ; échec rejouable ; jamais de reprise automatique |

#### Risques de marché

| Risque | Parade de cadrage |
|---|---|
| Le pilotage par MCP n'est pas plus rapide que la main | Validation = parcours 1 par MCP seul, chronométré ; repli décidé : l'interface fait tout, le MCP devient complément (mêmes services) |
| Agrément Meta ou TikTok tardif ou refusé | Le MVP ne dépend d'aucun agrément (mode développeur sur ses propres comptes) ; TikTok publie en privé ; la cadence tient sur Meta seul |
| Un réseau change ses bornes, ses permissions ou son API | Fichier de bornes versionné avec test ; connecteur isolé derrière la couche de services commune, un changement ne touche qu'un connecteur ; versions d'API relevées à l'implémentation |
| Le contenu ne trouve pas d'audience | Hors critères V1 par décision (§ Critères de succès) ; les statistiques arrivent en V1.1 |

#### Risques de ressources

| Risque | Parade de cadrage |
|---|---|
| Une seule personne, un temps borné | Ordre de livraison fixé (Instagram → Facebook Page → TikTok → LinkedIn) ; chaque réseau recetté avant le suivant, donc à tout moment un produit utilisable |
| Le temps manque avant la fin de V1 | **TikTok glisse en V1.1** en premier (décidé) ; la V1 reste Meta seule, Instagram + Facebook Page ; la programmation et l'éditeur ne glissent pas |
| La recette abîme le compte de la marque | Compte de test dédié pour toute la recette ; Établia ne reçoit que la première vraie vidéo, relue |
| Le fondateur est le goulot (clés, OAuth, dossiers) | Tâches fondateur hors code, listées et planifiées avant chaque connecteur |

## Exigences fonctionnelles

Cette liste est le **contrat de capacités** de la V1 : la conception d'interface, l'architecture et les epics ne construisent que ce qui figure ici ; une capacité absente n'existera pas dans le produit tant qu'elle n'y est pas ajoutée explicitement. Une exigence sans mention de phase appartient au MVP (Instagram seul) ; « fin de V1 » renvoie à la phase 2 du cadrage. Décisions du fondateur prises à cette étape (2026-09-06) : un seul compte connecté par réseau, remplaçable dans Paramètres ; légende et hashtags portés par chaque publication, pré-remplis depuis la vidéo ; une vidéo jamais publiée se supprime, toute autre s'archive ; une publication programmée s'annule ou se déplace tant qu'elle n'est pas partie ; l'interface s'ouvre avec un mot de passe défini à la première mise en route, sans second facteur en V1.

### Scénarios et capture

- FR1 : Le fondateur ou Claude peut créer un scénario à partir d'une liste ordonnée d'adresses de pages de l'application, chaque page recevant un texte par défaut.
- FR2 : Le fondateur ou Claude peut lister, lire et modifier un scénario existant : ajouter, retirer ou réordonner des pages, changer les textes par défaut.
- FR3 : Le fondateur peut déclarer la liste des hôtes autorisés à la capture ; regie refuse, avec la raison, toute adresse de scénario hors de cette liste, à la création comme à la modification, par l'interface comme par MCP.
- FR4 : Le fondateur peut enregistrer les identifiants du seul compte de démo de l'application à capturer ; regie s'en sert pour ouvrir automatiquement une session à chaque capture.
- FR5 : Le fondateur peut tester la connexion enregistrée et obtenir soit la page d'accueil capturée, soit l'étape fautive.
- FR6 : Le fondateur peut fournir un média de substitution pour une page qu'il est impossible de capturer.

### Génération et éditeur

- FR7 : Le fondateur ou Claude peut lancer une génération depuis un scénario ; regie rend aussitôt un identifiant et un état (en cours, prête, refusée, échec) que l'un ou l'autre peut suivre ; un échec nomme l'étape ou l'adresse fautive.
- FR8 : regie produit, pour chaque génération, une vidéo verticale muette qui applique les règles de publication d'Établia : accroche en ouverture, zone sûre, lisibilité.
- FR9 : Le fondateur ou Claude peut lire les scènes d'une vidéo : page d'origine, texte, animation.
- FR10 : Le fondateur ou Claude peut modifier le texte et l'animation de chaque scène ; le fondateur peut prévisualiser la scène modifiée avant de regénérer.
- FR11 : Le fondateur ou Claude peut regénérer une vidéo après modification de ses scènes.
- FR12 : regie applique à chaque génération et regénération des gardes bloquantes de lisibilité et de zone sûre ; une vidéo hors garde passe en refusée, et aucun chemin, interface ou MCP, ne permet de forcer.
- FR13 : Tout refus de garde désigne la scène fautive, la mesure constatée et le seuil ; le fondateur peut ouvrir l'éditeur directement sur cette scène.
- FR14 : regie enregistre la durée de chaque génération et la rend visible avec la vidéo.

### Librairie

- FR15 : Le fondateur ou Claude peut consulter la librairie : chaque vidéo avec son statut (brouillon, prête, refusée, programmée, publiée, échec), sa date et la raison de son statut, filtrable par statut.
- FR16 : Le fondateur ou Claude peut renseigner sur une vidéo une légende et au plus cinq hashtags en français, qui servent de valeurs par défaut à ses publications.
- FR17 : regie vérifie chaque vidéo à l'entrée en librairie contre les bornes de chaque réseau pris en charge (conteneur, ratio, durée, taille) ; hors bornes, la vidéo passe en refusée avec la cause, jamais en prête.
- FR18 : Le fondateur ou Claude peut supprimer, fichier compris, une vidéo qui n'a jamais eu de publication ; une vidéo qui a ou a eu une publication ne peut qu'être archivée : elle sort de la librairie courante, reste consultable, et ses publications, son audit et ses fichiers restent intacts. Toute suppression et tout archivage sont tracés dans l'audit.

### Publication et programmation

- FR19 : Le fondateur ou Claude peut créer une publication depuis une vidéo prête vers un réseau connecté ; la légende et les hashtags sont pré-remplis depuis la vidéo et ajustables sur la publication.
- FR20 : regie vérifie chaque publication contre les bornes du réseau visé (longueur de légende, nombre de hashtags, règles propres au réseau) avant de l'accepter.
- FR21 : Le fondateur ou Claude peut publier une publication maintenant, ou la programmer à une date et une heure exprimées en heure de Paris.
- FR22 : regie exécute seule chaque publication programmée à l'heure prévue, y compris si elle a redémarré entre-temps.
- FR23 : regie n'envoie jamais deux fois la même publication à un réseau, quels que soient les rejeux, redémarrages ou reprises.
- FR24 : regie lit le quota de publication du réseau, quand celui-ci l'expose, avant de programmer ou de publier, et refuse avec la cause si le quota est atteint.
- FR25 : Une publication réussie passe en publiée avec l'identifiant renvoyé par le réseau ; une publication ratée passe en échec avec sa cause, visible dans regie seulement, sans nouvelle tentative automatique.
- FR26 : Le fondateur ou Claude peut rejouer une publication en échec ; l'historique de toutes les tentatives est conservé.
- FR27 : Le fondateur ou Claude peut lister les publications par statut, par réseau et par période.
- FR28 : Le fondateur ou Claude peut annuler une publication programmée qui n'est pas encore partie, ou la déplacer à une autre date et heure ; une vidéo dont la dernière publication programmée est annulée revient à l'état prête ; une publication dont l'envoi a commencé ne se modifie plus ; chaque annulation et chaque déplacement sont tracés dans l'audit.
- FR29 (fin de V1) : Le fondateur peut, pour une publication TikTok, choisir le niveau de confidentialité et déclarer un contenu commercial avant l'envoi.

### Réseaux et comptes

- FR30 : Le fondateur peut saisir dans Paramètres les clés d'application de chaque réseau pris en charge ; un secret saisi n'est jamais réaffiché.
- FR31 : Le fondateur peut connecter un compte par réseau par le parcours d'autorisation du réseau, depuis l'interface uniquement ; connecter un autre compte remplace le précédent.
- FR32 : Le fondateur peut voir, pour chaque réseau, le compte connecté et l'échéance du jeton, est prévenu avant qu'une publication n'échoue pour jeton expiré, et peut reconnecter le compte ; les publications en échec pour cette cause redeviennent rejouables.
- FR33 : Le fondateur ou Claude peut publier des Reels sur le compte Instagram connecté.
- FR34 (fin de V1) : Le fondateur ou Claude peut publier sur la Page Facebook connectée, avec la même application Meta.
- FR35 (fin de V1) : Le fondateur ou Claude peut publier sur le compte TikTok connecté, en privé tant que l'application n'est pas auditée.
- FR36 (fin de V1) : Le fondateur peut saisir la clé LinkedIn et connecter le compte ; aucune publication LinkedIn avant l'agrément partenaire.

### Pilotage par MCP

- FR37 : Le fondateur peut générer un jeton MCP, affiché une seule fois, et le révoquer ; regie n'accepte aucune requête MCP sans jeton valide.
- FR38 : Claude peut exécuter par MCP toute action des domaines scénarios, générations, vidéos, publications et audit, avec le même résultat que par l'interface.
- FR39 : Aucun outil MCP ne lit ni n'écrit un secret (clés, jetons, identifiants de démo, jeton MCP, mot de passe) ; aucune réponse d'outil n'en contient.
- FR40 : Toute opération longue lancée par MCP renvoie aussitôt un identifiant et un état que Claude peut interroger.
- FR41 : Toute erreur renvoyée par MCP est structurée : code, message en français, contexte exploitable (scène, mesure et seuil pour une garde ; hôte refusé ; borne dépassée ; quota atteint).
- FR42 : Le fondateur dispose d'une référence des outils MCP générée depuis le code et d'un exemple de prompt par parcours, à jour à chaque version.

### Administration, sécurité et audit

- FR43 : Le fondateur définit un mot de passe à la première mise en route de regie ; ensuite, toute page hors routes publiques exige une session ouverte avec ce mot de passe, et le fondateur peut le changer dans Paramètres. Le second facteur est hors V1.
- FR44 : regie chiffre chaque secret au repos avec une clé maîtresse fournie par l'environnement, refuse de démarrer sans elle avec un message explicite, et le fondateur peut la faire tourner en rechiffrant tous les secrets.
- FR45 : regie journalise chaque action qui modifie l'état et chaque tentative de publication : quoi, quand, réseau, résultat ou cause, origine (interface ou MCP avec l'identifiant du jeton), identifiant renvoyé par le réseau, hôte capturé pour une génération.
- FR46 : Le fondateur ou Claude peut consulter le journal d'audit avec filtres (origine, statut, période, réseau) ; le journal ne se modifie ni ne s'efface.
- FR47 (fin de V1) : regie sert publiquement les pages CGU et politique de confidentialité, au contenu versionné ; les seules routes accessibles sans session sont ces pages, les retours d'autorisation des réseaux et, si l'architecture le retient, une adresse temporaire de récupération d'une vidéo par un réseau.
- FR48 : Aucune vidéo ne reste accessible publiquement après sa publication.
- FR49 : Le fondateur peut installer regie sur son poste depuis le dépôt public et un fichier de configuration local ; le dépôt ne contient aucun secret.

Hors de cette liste, par décision : publication LinkedIn, statistiques d'audience et installation par des tiers (V1.1) ; X et deuxième marque (V2) ; toute IA hors MCP ; second facteur d'authentification ; plusieurs comptes par réseau ; notification externe d'un échec ; nouvelle tentative automatique.
