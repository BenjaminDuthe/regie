---
validationTarget: 'docs/planning/prd.md'
validationDate: '2026-09-06'
inputDocuments:
  - ../../MANDAT.md
  - saas-souverain:marketing/video/README.md
  - saas-souverain:marketing/video/moteur/{format,scenes,montage,rendu,ffmpeg,images}.mjs
  - saas-souverain:marketing/video/generer.mjs
  - assets-video-2466-sauvegarde:PUBLICATION.md
validationStepsCompleted: [step-v-01-discovery, step-v-02-format-detection, step-v-03-density-validation, step-v-04-brief-coverage-validation, step-v-05-measurability-validation]
validationStatus: IN_PROGRESS
---

# Rapport de validation du PRD

**PRD validé :** `docs/planning/prd.md` (regie)
**Date de validation :** 2026-09-06
**Référentiel :** standard BMAD `bmad-validate-prd` (13 étapes, `steps-v/`)

## Documents d'entrée

Les cinq entrées déclarées dans le frontmatter du PRD ont toutes été chargées :

| Entrée | Emplacement résolu | Chargement |
|---|---|---|
| `../../MANDAT.md` | `MANDAT.md` à la racine de ce dépôt | chargé |
| `saas-souverain:marketing/video/README.md` | dépôt privé saas-souverain, worktree de la branche `feat/2599-generateur-video-verticale` | chargé |
| `saas-souverain:marketing/video/moteur/{format,scenes,montage,rendu,ffmpeg,images}.mjs` | idem, six modules (1 779 lignes) | chargé |
| `saas-souverain:marketing/video/generer.mjs` | idem, point d'entrée (173 lignes) | chargé |
| `assets-video-2466-sauvegarde:PUBLICATION.md` | dossier local `assets-video-2466-sauvegarde` (règles de publication : muet, accroche 3 s, hashtags FR) | chargé |

Aucun cahier produit (brief), aucune recherche, aucune séance de remue-méninges : `documentCounts` du PRD = briefs 0, research 0, brainstorming 0, projectDocs 9.

## Constats de validation

Chaque étape du référentiel ajoute sa section ci-dessous, dans l'ordre d'exécution.

## Détection du format

**Structure du PRD** (titres de niveau 2, dans l'ordre du document) :

1. Résumé exécutif (l. 33)
2. Classification du projet (l. 50)
3. Critères de succès (l. 61)
4. Périmètre du produit (l. 90)
5. Parcours utilisateur (l. 114)
6. Exigences propres au domaine (l. 173)
7. Innovation et motifs inédits (l. 220)
8. Exigences propres au type de projet (l. 264)
9. Cadrage du projet et développement par phases (l. 386)
10. Exigences fonctionnelles (l. 490)
11. Exigences non fonctionnelles (l. 566)

**Frontmatter** : `classification.projectType` = « web_app + developer_tool (serveur MCP) » ; `classification.domain` = « marketing réseaux sociaux (vidéos d'écrans d'Établia) » ; `classification.complexity` = « haute (jetons chiffrés + journal d'audit en V1 ; RGPD audience → V1.1) » ; `classification.projectContext` = « brownfield (moteur vidéo porté) / greenfield (régie, MCP, éditeur, librairie) » ; `releaseMode: phased` ; `workflowType: 'prd'` ; treize étapes de création consignées dans `stepsCompleted` (`step-01-init` à `step-11-polish`).

**Sections de base BMAD présentes** (le PRD est rédigé en français, la correspondance avec le libellé du standard est donnée entre parenthèses) :

- Résumé exécutif (Executive Summary) : présent
- Critères de succès (Success Criteria) : présent
- Périmètre du produit (Product Scope) : présent
- Parcours utilisateur (User Journeys) : présent
- Exigences fonctionnelles (Functional Requirements) : présent
- Exigences non fonctionnelles (Non-Functional Requirements) : présent

**Classification du format :** BMAD Standard
**Sections de base présentes :** 6/6

Les cinq autres titres (Classification du projet, Exigences propres au domaine, Innovation et motifs inédits, Exigences propres au type de projet, Cadrage du projet et développement par phases) sont les sections conditionnelles du gabarit de création BMAD ; leur contenu est examiné aux étapes suivantes, pas ici.

## Densité d'information

**Méthode.** Analyse directe, sans sous-processus (aucun sous-agent n'est ouvert dans cette session). Le PRD étant en français, chaque famille du standard a été balayée sur ses équivalents français, puis sur l'anglais littéral :

- remplissage conversationnel : « permettra aux utilisateurs de », « permet à l'utilisateur », « il est important de noter », « il convient de noter », « à noter que », « afin de », « dans le but de », « en ce qui concerne », « rappelons que », « précisons que » ;
- tournures verbeuses : « en raison du fait que », « du fait que », « dans l'éventualité où », « dans le cas où », « à ce stade », « à l'heure actuelle », « de manière à ce que », « de façon à ce que », « au niveau de », « dans le cadre de », « il y a lieu de », « il est nécessaire de », « il est possible de », « a la possibilité de », « est en mesure de » ;
- redondances : « plans futurs », « projets futurs », « absolument essentiel », « historique passé », « terminer complètement », « prévoir à l'avance », « ajouter en plus », « obligatoirement nécessaire », « collaborer ensemble », « actuellement en cours », « au final », « voire même ».

Témoin de bon fonctionnement du balayage : 56 lignes du PRD contiennent « regie ».

**Violations par famille :**

**Remplissage conversationnel :** 0 occurrence

**Tournures verbeuses :** 0 occurrence

**Redondances :** 0 occurrence

**Total des violations :** 0

**Sévérité :** Pass (seuil : Pass < 5, Warning 5 à 10, Critical > 10)

Un second balayage, plus large que le standard (« permet de », « on peut », « de manière », « de façon », « au sein de », « en termes de », « par le biais de », « à l'avance », « comme par exemple », « voire »…), ne rend qu'une ligne : la FR12 (l. 510), « aucun chemin, interface ou MCP, ne permet de forcer ». C'est l'énoncé d'une garde, pas un remplissage ; elle n'est pas comptée.

**Recommandation :** le PRD présente une bonne densité d'information, sans remplissage détecté.

## Couverture du cahier produit

**Statut :** sans objet — aucun cahier produit (Product Brief) n'a été fourni en entrée (`documentCounts.briefs: 0` dans le PRD ; inventaire de l'étape 1 confirmé). Le contrôle est passé sans analyse, conformément au référentiel.

## Validation de la mesurabilité

**Méthode.** Analyse directe, exigence par exigence, sans sous-processus (aucun sous-agent n'est ouvert dans cette session). Les 49 exigences fonctionnelles (l. 496 à 562) et les 37 exigences non fonctionnelles (l. 572 à 623) ont été lues avec leur numéro de ligne. Règles appliquées :

- forme d'une FR : l'acteur est nommé comme sujet (« le fondateur », « Claude », ou regie et ses composants pour un comportement du système) et la capacité est testable ; une exigence dont le sujet est un objet (une publication, une erreur, une vidéo) est comptée en écart de forme ; la lecture strictement lexicale (« [acteur] peut [capacité] » seulement) est donnée à part, pour information ;
- adjectifs subjectifs : balayage lexical des FR (facile, rapide, simple, intuitif, efficace, convivial, réactif, clair, explicite, et leurs équivalents anglais) ; un terme défini par une autre exigence n'est pas compté, il est signalé ;
- quantificateurs vagues : plusieurs, quelques, certains, de nombreux, divers, un certain nombre, et leurs équivalents anglais ;
- fuite d'implémentation dans les FR : nom de technologie, de bibliothèque ou d'infrastructure, sauf s'il porte la capacité elle-même (MCP, réseaux et objets des réseaux) ;
- NFR : critère, métrique, méthode de mesure, contexte ; une exigence est comptée une fois, sur son défaut principal ; une valeur explicitement renvoyée au chronométrage ou à l'architecture, avec une proposition ou une source, n'est pas comptée comme métrique manquante, elle est listée.

### Exigences fonctionnelles

**Total des FR analysées :** 49

**Écarts de forme :** 3

- FR25 (l. 529) : « Une publication réussie passe en publiée… » — le sujet est la publication, l'acteur (regie) est implicite.
- FR41 (l. 551) : « Toute erreur renvoyée par MCP est structurée… » — le sujet est l'erreur, l'acteur est implicite.
- FR48 (l. 561) : « Aucune vidéo ne reste accessible publiquement… » — le sujet est la vidéo, l'acteur est implicite ; la vérification vit dans la NFR19.

Lecture strictement lexicale, pour information : 19 exigences n'ont pas la forme « [acteur] peut [capacité] » — les 3 ci-dessus, 11 énoncés dont regie est le sujet (FR8 l. 506, FR12 l. 510, FR14 l. 512, FR17 l. 518, FR20 l. 524, FR22 l. 526, FR23 l. 527, FR24 l. 528, FR44 l. 557, FR45 l. 558, FR47 l. 560), 1 énoncé dont un composant de regie est le sujet (FR39 l. 549), 2 énoncés mixtes où une clause « peut » suit un comportement du système (FR13 l. 511, FR40 l. 550) et 2 énoncés à acteur nommé sans « peut » (FR42 l. 552 « dispose de », FR43 l. 556 « définit »). Pour chacun de ces 16, l'acteur est identifiable et la capacité testable ; ils ne sont pas comptés.

**Adjectifs subjectifs :** 1

- FR44 (l. 557) : « refuse de démarrer sans elle avec un message explicite » — « explicite » n'est ni défini ni mesuré. Le même qualificatif figure dans les NFR16 (l. 593), NFR34 (l. 620) et NFR35 (l. 621).

Termes examinés et non comptés : « aussitôt » (FR7 l. 505, FR40 l. 550), défini par la NFR1 (la réponse arrive avant la fin de la tâche, test automatisé) ; « lisibilité » (FR8 l. 506, FR12 l. 510), garde nommée dont la FR13 impose la mesure et le seuil — les seuils eux-mêmes ne figurent pas dans le PRD et relèvent de l'architecture ; « opération longue » (FR40 l. 550), énumérée par les NFR1 et NFR10 ; « contexte exploitable » (FR41 l. 551), défini par sa parenthèse ; « prévenu avant » (FR32 l. 539), délai renvoyé à l'architecture par la NFR31.

**Quantificateurs vagues :** 0

« plusieurs comptes par réseau » (l. 564) figure dans la phrase d'exclusion qui clôt la section, pas dans une exigence ; l'exclusion est précise (un seul compte par réseau, FR31).

**Fuites d'implémentation :** 0

Termes examinés et non comptés : « MCP » (l. 545 à 552 et ailleurs), qui est la capacité demandée par le mandat ; « Reels » (FR33 l. 540) et « application Meta » (FR34 l. 541), qui sont les objets des réseaux visés ; « clé maîtresse fournie par l'environnement » (FR44 l. 557), décision consignée aux exigences propres au domaine ; « routes » (FR47 l. 560), terme générique d'une application web.

**Total des écarts FR :** 4

### Exigences non fonctionnelles

**Total des NFR analysées :** 37

**Métriques manquantes :** 1

- NFR4 (l. 575) : la durée de génération est enregistrée et affichée, sans aucune cible — par décision du fondateur (l. 625 : « cible chiffrée de durée de rendu avant chronométrage » hors exigences) ; la valeur mesurée sur « traiteur 1 » doit devenir la référence. L'écart est délibéré et documenté ; il est compté parce que, telle qu'écrite, l'exigence n'a pas de seuil.

**Gabarit incomplet (méthode de mesure absente) :** 7

- NFR3 (l. 574) : rafraîchissement toutes les 5 secondes — aucune ligne « Vérification ».
- NFR27 (l. 607) : écran d'au moins 1 280 px et bandeau en dessous — aucune ligne « Vérification ».
- NFR30 (l. 613) : tout appel sortant passe par son connecteur, porte la clé d'idempotence, respecte le délai de garde et journalise requête et réponse — aucune ligne « Vérification » ; les tests des NFR9, NFR10 et NFR28 couvrent trois des quatre clauses, la journalisation sans secret n'a pas de test nommé.
- NFR31 (l. 614) : échéance des jetons affichée et fondateur prévenu avant — aucune ligne « Vérification » ; le délai de prévenance est renvoyé à l'architecture.
- NFR33 (l. 616) : transport MCP épinglé et retrait d'un outil annoncé une version avant — aucune ligne « Vérification ».
- NFR34 (l. 620) : installation en quatre étapes et contrôle des versions au démarrage — aucune ligne « Vérification » ; le contrôle au démarrage est le mécanisme, pas la preuve.
- NFR35 (l. 621) : mise à jour en deux commandes, migrations appliquées au démarrage, arrêt sur migration échouée — aucune ligne « Vérification ».

**Contexte manquant :** 0

Chaque NFR est placée sous sa catégorie (performance, fiabilité, sécurité, accessibilité, intégration, exploitation) et nomme son périmètre.

Valeurs renvoyées au chronométrage ou à l'architecture, listées et non comptées : NFR3 (5 s, « à confirmer »), NFR8 (fenêtre de 2 heures, « à confirmer »), NFR10 (délais de garde, proposition « trois fois la durée mesurée »), NFR19 (délai d'expiration de l'adresse temporaire), NFR31 (délai de prévenance par réseau, Meta environ 60 jours). Qualificatifs sans mesure, signalés et non comptés dans les catégories NFR : « message explicite » (NFR16 l. 593, NFR34 l. 620, NFR35 l. 621), « hachage lent » (NFR22 l. 599, sans paramètre de coût ni test de lenteur). Les noms de technologies présents dans les NFR (l. 593, 616, 620, 621, 622) relèvent du contrôle de fuite d'implémentation de l'étape 7.

**Total des écarts NFR :** 8

### Bilan

**Total des exigences :** 86 (49 FR + 37 NFR)

**Total des écarts :** 12

**Sévérité :** Critical (seuil du référentiel : Pass < 5, Warning 5 à 10, Critical > 10)

**Recommandation du référentiel :** de nombreuses exigences ne sont pas mesurables ou testables ; revoir les exigences en écart avec des critères précis.

**Lecture.** Le seuil du référentiel est un nombre absolu, pas un taux : 12 écarts sur 86 exigences, soit 14 %, et 74 exigences conformes aux quatre critères. Aucun écart ne porte sur une exigence non testable dans le fond : 7 tiennent à l'absence d'une ligne « Vérification » sur une NFR dont le critère est déjà précis, 3 à un acteur implicite sur une FR dont le comportement est vérifié ailleurs, 1 à un qualificatif (« explicite ») et 1 à une cible chiffrée écartée par décision. Corrections attendues si le fondateur ouvre `bmad-edit-prd` : ajouter une ligne « Vérification » aux NFR3, 27, 30, 31, 33, 34 et 35 ; donner regie pour sujet aux FR25, FR41 et FR48 ; remplacer « message explicite » par un contenu vérifiable (la cause nommée, par exemple « variable REGIE_MASTER_KEY absente ») dans la FR44 et les NFR16, 34 et 35 ; laisser la NFR4 en l'état et reporter son seuil dans le PRD dès le chronométrage de « traiteur 1 ».
