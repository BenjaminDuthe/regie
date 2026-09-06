---
stepsCompleted: [step-01-init, step-02-discovery, step-02b-vision, step-02c-executive-summary, step-03-success, step-04-journeys, step-05-domain, step-06-innovation]
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
