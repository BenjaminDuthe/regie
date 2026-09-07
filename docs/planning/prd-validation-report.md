---
validationTarget: 'docs/planning/prd.md'
validationDate: '2026-09-06'
inputDocuments:
  - ../../MANDAT.md
  - saas-souverain:marketing/video/README.md
  - saas-souverain:marketing/video/moteur/{format,scenes,montage,rendu,ffmpeg,images}.mjs
  - saas-souverain:marketing/video/generer.mjs
  - assets-video-2466-sauvegarde:PUBLICATION.md
validationStepsCompleted: [step-v-01-discovery, step-v-02-format-detection, step-v-03-density-validation, step-v-04-brief-coverage-validation, step-v-05-measurability-validation, step-v-06-traceability-validation, step-v-07-implementation-leakage-validation, step-v-08-domain-compliance-validation, step-v-09-project-type-validation, step-v-10-smart-validation, step-v-11-holistic-quality-validation, step-v-12-completeness-validation, step-v-13-report-complete]
validationStatus: COMPLETE
holisticQualityRating: '4/5 — Bon'
overallStatus: Critical
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

## Validation de la traçabilité

**Méthode.** Analyse directe, sans sous-processus (voie de dégradation prévue par l'étape). Les cinq éléments comparés sont le Résumé exécutif (l. 33-48), les Critères de succès (l. 61-88), le Périmètre du produit (l. 90-112), les Parcours utilisateur (l. 114-171) et les 49 exigences fonctionnelles (l. 490-562) du PRD (commit 3cbeab3). Règle de lecture : le référentiel BMAD accepte qu'une exigence remonte « à un besoin utilisateur ou à un objectif métier » ; une exigence sans parcours mais ancrée dans une décision du fondateur consignée dans le PRD, une exigence du domaine ou un objectif écrit n'est donc pas orpheline, elle est notée « objectif » dans la matrice. Une exigence n'est orpheline que si aucune ligne du PRD hors de sa propre section ne la justifie.

### Validation des chaînes

**Résumé exécutif → Critères de succès :** lacune identifiée (1). Le résumé porte trois des quatre dimensions de succès : temps fondateur et cadence (l. 41 : « trois vidéos par semaine, programmées, sans y penser »), reproductibilité et gardes (l. 46), secrets hors de portée du MCP (l. 45). La dimension « aucun échec silencieux » (critère l. 76 : cause visible, rejeu en un clic, aucune publication ne disparaît) n'est annoncée nulle part dans le résumé ; la l. 39 (« rien ne relie la vidéo à sa publication ») décrit le problème, pas la promesse.

**Critères de succès → Parcours utilisateur :** lacune identifiée (1). Temps fondateur ≤ 10 min (l. 65) → parcours 1 (l. 124, « huit minutes ») ; « fini » = programmée ou publiée (l. 66) → parcours 1 (l. 124-126) ; moment « ça valait le coup » (l. 67) → parcours 1 (l. 126) ; cadence sur douze semaines (l. 71) → parcours 1 comme semaine type, mesure dans l'audit (parcours 1 et 2) ; aucun échec silencieux (l. 76) → parcours 2 et 5 ; aucun secret hors du coffre (l. 78) → parcours 3 et 4. Reproductibilité (l. 77) : la moitié « gardes non contournables » est jouée par le parcours 5 (l. 156) ; la moitié « même fiche → même vidéo » n'est montrée par aucun parcours (les parcours 4 et 5 regénèrent mais ne comparent pas deux rendus) et ne repose que sur le test automatisé annoncé l. 87.

**Parcours utilisateur → Exigences fonctionnelles :** intacte. Parcours 1 → FR1, 2, 4, 7, 8, 10, 11, 15, 16, 19, 21, 22, 25, 33, 45 ; parcours 2 → FR25, 26, 31, 32, 45 ; parcours 3 → FR1, 4, 5, 30, 31, 36, 37, 49 ; parcours 4 → FR2, 7, 9, 10, 11, 13, 27, 37, 38, 39, 40, 41, 45, 46 ; parcours 5 → FR12, 13, 15. Le tableau de synthèse des parcours (l. 160-171) est cohérent avec cette couverture.

**Périmètre → Exigences fonctionnelles :** alignée. Les sept points du MVP (l. 96-102) sont chacun portés : Paramètres → FR3, 4, 30, 31, 37 ; Générateur → FR1, 4, 7, 8 ; Éditeur → FR9-11, 13 ; Librairie → FR15-17 ; Publication → FR19, 21, 22, 25, 33 ; MCP → FR38-41 ; Socle → FR25, 26, 44, 45. La fin de V1 (l. 106) → FR29, 34, 35, 36, 47. Aucune exigence ne porte sur un élément déclaré hors périmètre (l. 107-112 et l. 564).

### Éléments orphelins

**Exigences fonctionnelles orphelines :** 0. Point d'attention sans être un écart : FR6 (média de substitution, l. 501) n'apparaît dans aucun parcours ni dans le périmètre ; sa seule source est une phrase du portage du moteur (l. 373 : « les médias de substitution restent possibles quand une page n'est pas capturable »), reprise de l'existant. FR14 (l. 304) et FR48 (l. 193) sont dans le même cas, chacune tenue par une seule ligne hors parcours.

**Critères de succès non soutenus :** 1. Reproductibilité (l. 77), moitié « même fiche → même vidéo » : soutenue par un test automatisé (l. 87), par aucun parcours. C'est le même constat que la lacune de la chaîne Critères → Parcours ; il est compté une seule fois dans le total.

**Parcours sans exigence fonctionnelle :** 0.

### Matrice de traçabilité

| Chaîne | État | Écarts |
|---|---|---|
| Résumé exécutif → Critères de succès | Lacune | 1 (échec visible absent du résumé) |
| Critères de succès → Parcours | Lacune | 1 (reproductibilité « même fiche → même vidéo ») |
| Parcours → Exigences fonctionnelles | Intacte | 0 |
| Périmètre → Exigences fonctionnelles | Alignée | 0 |

Couverture des 49 exigences fonctionnelles : 32 tracées à au moins un parcours, 17 tracées à un objectif ou à une décision consignée sans parcours, 0 orpheline. « P » = parcours ; « objectif » = source hors parcours, avec ses lignes.

| FR | Source | Lignes du PRD |
|---|---|---|
| FR1 | P1, P3, P4 | 122, 140, 146, 162 |
| FR2 | P4 | 146 |
| FR3 | objectif : garde données de démo, hôtes autorisés | 175, 189, 212, 349 |
| FR4 | P1, P3 | 122, 138 |
| FR5 | P3 | 140 |
| FR6 | objectif : portage du moteur, médias de substitution | 373 |
| FR7 | P1, P4 ; un échec nomme l'adresse fautive | 122, 148, 260 |
| FR8 | Résumé, P1, critère reproductibilité | 46, 122, 77 |
| FR9 | P4 | 146 |
| FR10 | P1, P4 ; îlot éditeur | 124, 148, 278 |
| FR11 | P1, P4, P5 | 124, 148, 154 |
| FR12 | critère gardes, P4, P5 | 77, 148, 156 |
| FR13 | P4, P5 | 148, 154 |
| FR14 | objectif : durée de génération visible | 304 |
| FR15 | P1, P2, P5 | 124, 130, 154 |
| FR16 | Résumé, P1, périmètre librairie | 35, 122, 99 |
| FR17 | objectif : bornes par réseau à l'entrée en librairie | 175, 190 |
| FR18 | décision du fondateur (suppression, archivage) | 492 |
| FR19 | P1, périmètre publication | 124, 100 |
| FR20 | objectif : bornes par réseau, surface MCP | 190, 352 |
| FR21 | P1, critère « fini », programmation en heure de Paris | 124, 66, 192 |
| FR22 | P1, programmation qui survit au redémarrage | 124, 192 |
| FR23 | objectif : clé d'idempotence, risque de double envoi | 192, 210 |
| FR24 | objectif : quota lu via l'API | 190, 215, 352 |
| FR25 | critères « fini » et échec visible, P1, P2, préambule des parcours | 66, 76, 124, 130, 116 |
| FR26 | critère échec visible, P2 | 76, 132 |
| FR27 | P4, surface MCP | 146, 352 |
| FR28 | décision du fondateur (annuler, déplacer) | 492 |
| FR29 | objectif : règles d'interface TikTok, fin de V1 | 180, 106 |
| FR30 | P3 | 138 |
| FR31 | P2, P3 | 132, 138 |
| FR32 | P2, cycle des jetons | 132, 191 |
| FR33 | périmètre publication, P1 | 100, 124 |
| FR34 | objectif : fin de V1, Meta, cadence sur trois réseaux | 106, 179, 71 |
| FR35 | objectif : fin de V1, TikTok, cadence sur trois réseaux | 106, 180, 71 |
| FR36 | P3 (« grisés »), fin de V1, LinkedIn | 138, 106, 181 |
| FR37 | P3, P4, MCP à jeton révocable | 138, 146, 280 |
| FR38 | Résumé, P4 | 45, 146, 150 |
| FR39 | Résumé, critère secrets, P4, surface MCP | 45, 78, 146, 355 |
| FR40 | P4, surface MCP | 148, 350 |
| FR41 | P4, erreurs structurées | 148, 357 |
| FR42 | objectif : référence MCP et prompts d'exemple | 271, 345, 361-369, 376, 381 |
| FR43 | décision du fondateur (mot de passe), routes publiques | 492, 270, 182 |
| FR44 | critère secrets, coffre | 78, 188 |
| FR45 | critère secrets, P1, P2, P4, garde données de démo | 78, 124, 132, 148, 189 |
| FR46 | P4, surface MCP | 146, 353 |
| FR47 | objectif : pages CGU et confidentialité, routes publiques | 175, 182, 106, 270, 311 |
| FR48 | objectif : aucune vidéo publique après publication | 193 |
| FR49 | installation depuis le dépôt public, Résumé, critère, P3 | 334-339, 37, 88, 138 |

**Total des écarts de traçabilité :** 2 (lacune Résumé → Critères ; critère de reproductibilité non joué par un parcours).

**Sévérité :** Warning (lacunes sans exigence orpheline).

**Recommandation du référentiel :** des lacunes de traçabilité ont été identifiées ; renforcer les chaînes pour que chaque exigence soit justifiée.

**Lecture.** Les deux écarts sont des écarts d'amont, pas d'aval : aucune exigence n'est injustifiée, ce sont deux promesses du haut du document qui ne redescendent pas jusqu'en bas. Corrections proposées, à porter par `bmad-edit-prd` si le fondateur les retient : (1) une phrase dans le Résumé exécutif, au paragraphe de l'état futur (l. 41), annonçant qu'un échec de publication est visible avec sa cause et rejouable ; (2) pour la reproductibilité, soit accepter le test automatisé comme seule preuve (le critère l. 87 le dit déjà, coût nul), soit ajouter au parcours 4 un temps où Claude regénère une vidéo sans changement et constate un rendu identique. Point d'attention hors décompte : FR6 tient à une seule phrase du portage (l. 373) ; si l'exigence doit survivre à l'architecture, l'ancrer aussi dans le parcours 5 ou dans la table des risques du cadrage (rejeu de la connexion, page non capturable) la rendrait plus solide.

## Validation des fuites d'implémentation

**Méthode.** Analyse directe, sans sous-processus : balayage intégral des exigences fonctionnelles (l. 496-562) et non fonctionnelles (l. 572-623) du PRD au commit `3cbeab3`, à la recherche des sept familles du référentiel — cadres d'interface, cadres serveur, bases de données, plateformes d'hébergement, infrastructure, bibliothèques, autres détails d'implémentation — augmentées des protocoles et des formats. Un terme compte comme fuite quand il dit **comment construire** ; il est admis quand il nomme une **capacité** que le produit doit rendre ou une **contrainte du domaine** imposée de l'extérieur. Une occurrence par terme et par ligne vaut un écart.

### Fuites par catégorie

**Cadres d'interface :** 0 écart. Aucune exigence ne nomme de bibliothèque d'interface ; les exigences d'interface (NFR24 à NFR27) parlent de clavier, de contraste, de libellés et de largeur d'écran, jamais d'un cadre.

**Cadres serveur :** 0 écart. Aucun serveur applicatif n'est nommé.

**Bases de données :** 0 écart. NFR6 et NFR23 disent « la base » et « le schéma de base » sans jamais désigner de moteur.

**Plateformes d'hébergement :** 1 écart. NFR36 (l. 622) nomme « GitHub Actions » comme lieu d'exécution de la CI ; l'exigence réelle est qu'un ensemble de contrôles s'exécute à chaque commit, non la plateforme qui les héberge.

**Infrastructure :** 2 écarts. NFR34 (l. 620) exige « Chromium via Playwright » sur le poste ; NFR36 (l. 622) exige « Chromium et ffmpeg dans le job ». Le besoin est qu'un moteur de rendu et un moteur d'encodage soient disponibles, non que ce soient ceux-là.

**Bibliothèques :** 4 écarts. NFR33 (l. 616) impose « le transport Streamable HTTP du SDK TypeScript officiel, épinglé » ; NFR34 (l. 620) nomme « Playwright » puis « ffmpeg avec libx264 » ; NFR36 (l. 622) nomme « ffmpeg » une seconde fois. Le choix d'une bibliothèque et l'épinglage de sa version relèvent de l'architecture.

**Autres détails d'implémentation :** 5 écarts. NFR16 (l. 593) nomme la variable d'environnement `REGIE_MASTER_KEY`, alors que FR44 exprime déjà la même exigence sans la nommer (« une clé maîtresse fournie par l'environnement ») ; NFR34 (l. 620) impose « Node LTS », puis « pnpm » avec la commande `pnpm install`, puis le fichier `.env` ; NFR35 (l. 621) impose la mise à jour « par `git pull` puis `pnpm install` ».

**Termes examinés et admis.** MCP (23 occurrences) : le produit *est* un serveur MCP par mandat du fondateur, c'est la capacité elle-même. Jeton (20) : objet du domaine, manipulé par le fondateur dans Paramètres. « API de réseau » (NFR11, NFR28, NFR29) : le système consommé est une API tierce, c'est un fait du domaine. « Streamable HTTP » (NFR33) : forme du contrat avec le client MCP, imposée de l'extérieur — seule la mention du SDK est comptée en fuite. « AES-256-GCM ou équivalent » (NFR16) : plancher de sécurité assorti d'une équivalence, donc un niveau exigé, pas un choix d'implémentation ; même lecture pour « hachage lent et salé » (NFR22). « Clé d'idempotence » (NFR9, NFR30, FR23) : propriété observable, non une technique. CI et commit (NFR15, NFR36) : le contrôle à chaque commit *est* l'exigence. Heure de Paris (NFR37), 1 280 px (NFR27), Meta, Instagram, Reels, Facebook, TikTok, LinkedIn : contraintes du domaine, toutes décidées par le fondateur.

### Synthèse

**Total des fuites d'implémentation :** 12

**Sévérité :** Critical (plus de 5 écarts)

**Recommandation du référentiel :** fuites d'implémentation étendues. Des exigences disent *comment* au lieu de *quoi*. Retirer les détails d'implémentation, qui relèvent de l'architecture, pas du PRD.

**Note.** Les consommateurs d'API, le protocole MCP et les autres termes qui décrivent ce que le système doit faire restent admis quand ils énoncent le *quoi* et non le *comment*.

**Lecture.** Les douze écarts sont concentrés dans cinq exigences (NFR16, NFR33, NFR34, NFR35, NFR36) et ont trois origines, toutes traçables : le portage brownfield du moteur vidéo existant, qui repose déjà sur Chromium et ffmpeg (l. 373, « repris tels quels ») ; les décisions techniques prises par le fondateur à l'étape « type de projet » et **déjà consignées** aux lignes 276, 280, 321-326, 334-337, 374 et 382 — un seul runtime, installation par clonage puis installation des dépendances, MCP en HTTP distant, CI à chaque commit ; le nom d'une variable d'environnement, déjà porté par les lignes 335 et 375. Aucune de ces mentions n'est fausse ni contestée : elles sont **redondantes**, répétées dans les exigences alors que la section « type de projet » les porte déjà et fait foi. La correction est donc à faible coût et sans perte d'information, si le fondateur la retient via `bmad-edit-prd` : NFR33 → « transport MCP distant avec jeton, conforme à la spécification MCP courante, version de la bibliothèque épinglée à l'architecture » ; NFR34 → « installation en quatre étapes sur un poste disposant du runtime unique et du moteur de rendu existant, prérequis documentés et contrôlés au démarrage » ; NFR35 → « mise à jour par récupération du dépôt puis installation des dépendances, migrations appliquées au démarrage » ; NFR36 → « CI exécutée à chaque commit, moteur de rendu disponible dans le job » ; NFR16 → « clé maîtresse lue dans l'environnement au démarrage », le nom de la variable étant renvoyé à l'architecture et au fichier d'exemple.

## Validation de conformité au domaine

**Domaine :** marketing réseaux sociaux (vidéos d'écrans d'Établia)

**Complexité réglementaire du domaine :** basse (domaine général)

**Évaluation :** sans objet — aucune section de conformité sectorielle n'est exigée.

**Méthode.** Le domaine déclaré au frontmatter du PRD a été confronté au référentiel des domaines réglementés (santé, finance, secteur public, éducation, aéronautique, automobile, recherche, droit, assurance, énergie, contrôle de procédés industriels, automatisation du bâtiment). Aucun signal de ces domaines n'apparaît dans le PRD : ni donnée de santé, ni transaction financière, ni marché public, ni dossier scolaire, ni système critique pour la sécurité des personnes. Le produit publie des vidéos de démonstration d'une application, sur les comptes de sa propre marque. Le référentiel classe ce cas en « général », complexité basse : les contrôles détaillés de conformité sectorielle sont donc écartés, conformément à la règle de l'étape.

**Lecture.** La mention « complexité haute » portée au frontmatter du PRD ne contredit pas ce classement : elle qualifie la **complexité technique** du produit (chiffrement des secrets au repos, journal d'audit inaltérable, protocole MCP, portage d'un moteur de rendu), pas une exposition réglementaire sectorielle. Les deux exigences à caractère normatif présentes dans le PRD sont traitées à leur place et n'appellent aucune section spéciale ici : le RGPD, qui n'entre qu'avec les statistiques d'audience, explicitement renvoyées en V1.1 avec « le traitement RGPD associé » ; et les conditions d'utilisation des plateformes (agrément Meta et TikTok, agrément partenaire LinkedIn), qui sont des obligations contractuelles de tiers, déjà portées par le cadrage des phases et par les pages CGU et confidentialité servies en fin de V1. Un point reste à vérifier hors PRD, au moment de la mise en œuvre : la capture s'exécute sur un tenant de démonstration, et le PRD exige déjà qu'aucune donnée réelle de client d'Établia n'y figure — c'est une contrainte d'exploitation, pas une lacune du document.

## Validation de conformité au type de projet

**Type de projet :** `web_app + developer_tool (serveur MCP)`

**Méthode.** Le référentiel des types de projet a été chargé en entier, puis les deux types déclarés au frontmatter du PRD y ont été confrontés. Les deux se cumulent : les sections requises de l'un s'ajoutent à celles de l'autre, et une section exclue par un type mais requise par l'autre reste due — la règle d'exclusion cède devant l'exigence. Le contrôle a été mené par lecture directe du PRD au commit `3cbeab3`, sans sous-processus, chaque section étant cherchée par son titre puis vérifiée sur son contenu, jamais sur son seul intitulé.

### Sections requises

Type `web_app` :

- **Matrice des navigateurs** (`browser_matrix`) : Présente — « Navigateurs pris en charge » (l. 284-293) ; tableau Chromium récents testé en CI, Firefox récent pris en charge non testé, navigateurs mobiles hors V1, définition de « récent », version de capture unique partagée avec Playwright.
- **Mise en page réactive** (`responsive_design`) : Présente — « Mise en page » (l. 295-297) et NFR27 (l. 607) ; ordinateur seulement, largeur minimale proposée de 1 280 px, bandeau en dessous sans rien masquer, décision du fondateur datée.
- **Cibles de performance** (`performance_targets`) : Présente — « Cibles de performance » (l. 299-307) et NFR1 à NFR12 (l. 572-586) ; l'absence de cible chiffrée sur la durée de rendu est déclarée, motivée (aucune mesure n'existe) et rattachée à une tâche nommée, le chronométrage de « traiteur 1 ».
- **Stratégie de référencement** (`seo_strategy`) : Présente — « Référencement » (l. 309-311) ; stratégie assumée du non-référencement : `noindex` sur les routes authentifiées, `/cgu` et `/confidentialite` accessibles sans être promues, `robots.txt` fermé sur le reste.
- **Niveau d'accessibilité** (`accessibility_level`) : Présente — « Niveau d'accessibilité » (l. 313-315) et NFR24 à NFR27 (l. 604-607) ; niveau nommé (socle), seuil chiffré (contraste AA 4,5:1), moyen de vérification par exigence, et exclusions déclarées (lecteur d'écran, mobile).

Type `developer_tool` :

- **Matrice des langages** (`language_matrix`) : Présente — « Langages et environnement » (l. 317-328) ; tableau runtime, langage, gestionnaire, capture, rendu, SDK MCP, chacun avec son mode d'épinglage ; Python, conteneurisation et tout second runtime écartés de la V1.
- **Méthodes d'installation** (`installation_methods`) : Présente — « Installation » (l. 330-339), FR49 (l. 562) et NFR34 (l. 620) ; quatre étapes énumérées, prérequis système documentés et vérifiés au démarrage, `.env.exemple` sans valeur, image de conteneur et paquet renvoyés en V1.1 avec l'installation tierce.
- **Surface d'API** (`api_surface`) : Présente — « Surface d'API » (l. 341-357), FR37 à FR42 (l. 547-552) et NFR33 (l. 616) ; cinq familles d'outils MCP, jeton obligatoire, aucun outil sur les secrets, erreurs structurées, opérations longues rendant un identifiant, transport et règle de retrait d'un outil.
- **Exemples d'usage** (`code_examples`) : Présente — « Exemples » (l. 359-369) et FR42 ; le PRD justifie que les exemples soient des prompts, le consommateur étant Claude, et en exige au moins cinq, un par parcours, rejoués à chaque version.
- **Guide de migration** (`migration_guide`) : Présente — « Portage et migrations » (l. 371-376) et NFR35 (l. 621) ; migrations de schéma versionnées dès le premier commit et appliquées au démarrage, procédure de mise à jour d'une version à l'autre, rotation de la clé maîtresse par rechiffrement avec version de format, retrait d'un outil MCP annoncé une version à l'avance.

### Sections exclues (ne doivent pas figurer)

- **Conception visuelle** (`visual_design`, exclue par `developer_tool`) : Absente ✓ — aucune palette, typographie ni charte ; le PRD renvoie explicitement la référence visuelle à la maquette HTML du lot 5 (l. 272 et l. 383). Cette exclusion ne prive pas le PRD des exigences d'interface dues au type `web_app` : accessibilité et mise en page sont traitées à leur place, comme exigences de comportement, pas de style.
- **Conformité de boutique** (`store_compliance`, exclue par `developer_tool`) : Absente ✓ — aucune boutique d'applications n'est visée. À ne pas confondre avec les agréments Meta, TikTok et LinkedIn, qui sont des conditions d'accès à des API de publication et sont traités au cadrage.
- **Fonctions natives** (`native_features`, exclue par `web_app`) : Absente ✓ — aucune fonction de système d'exploitation, aucun accès matériel, aucune notification poussée ; le mobile est hors V1.
- **Commandes en ligne** (`cli_commands`, exclue par `web_app`) : Absente ✓ — la ligne de commande figure au hors-périmètre confirmé (l. 384). Seule subsiste, en l. 375, une commande d'administration de rotation de la clé maîtresse : c'est une opération d'exploitation isolée, pas une interface en ligne de commande, et elle ne constitue pas une violation.

### Synthèse de conformité

**Sections requises :** 10 sur 10 présentes
**Sections exclues présentes :** 0 (attendu : 0)
**Score de conformité :** 100 %
**Sévérité :** Pass — toutes les sections requises sont présentes et complètes, aucune section exclue n'a été trouvée.

**Recommandation.** Aucune correction n'est requise à ce titre. Le PRD porte, en l. 272, la déclaration explicite de ce que le cumul des deux types écarte — conception visuelle poussée, conformité de boutique, fonctions natives, commandes en ligne — ce qui rend la conformité vérifiable sans reconstruction. Le seul point à surveiller à l'architecture n'est pas une lacune de section mais une valeur en attente : les cibles de performance restent des propositions jusqu'au chronométrage de « traiteur 1 », et le PRD exige que les valeurs mesurées **remplacent** les valeurs proposées plutôt que de s'y ajouter.

## Validation SMART des exigences

**Total des exigences fonctionnelles :** 49 (FR1 à FR49, l. 496 à 562 du PRD)

**Méthode.** Notation directe, exigence par exigence, sans sous-processus (voie de dégradation prévue par l'étape ; aucun sous-agent n'est ouvert dans cette session). Chaque FR est notée de 1 à 5 sur les cinq critères SMART, avec ces règles de lecture, appliquées uniformément :

- **Spécifique** — 5 : acteur nommé, capacité sans ambiguïté ; 4 : capacité claire mais acteur implicite ou terme défini ailleurs ; 3 : un qualificatif non défini subsiste.
- **Mesurable** — 5 : critère de réussite lisible dans l'exigence même ; 4 : critère lisible avec une autre exigence nommée (seuil, borne, délai) ; 3 : le seuil ou le délai est renvoyé à l'architecture.
- **Atteignable** — 5 : ne dépend que de regie ; 4 : dépend d'un tiers dont le repli est écrit ; 3 : repose sur une hypothèse externe encore non vérifiée.
- **Pertinent** — 5 : sert un critère de succès ou un parcours ; 4 : sert une décision consignée du fondateur.
- **Traçable** — reprend la table de la validation de traçabilité : 5 = tracée à un parcours utilisateur, 4 = tracée à un objectif ou à une décision consignée, 3 = source unique et hors parcours.

### Bilan des notes

**Toutes notes ≥ 3 :** 100 % (49/49)
**Toutes notes ≥ 4 :** 85,7 % (42/49)
**Moyenne générale :** 4,67 / 5,0 (1 145 points sur 245 notes)
**Exigences signalées (une note < 3) :** 0

### Table de notation

| FR | Spécifique | Mesurable | Atteignable | Pertinent | Traçable | Moyenne | Signal |
|---|---|---|---|---|---|---|---|
| FR1 | 5 | 5 | 5 | 5 | 5 | 5,0 | |
| FR2 | 5 | 5 | 5 | 5 | 5 | 5,0 | |
| FR3 | 5 | 5 | 5 | 5 | 4 | 4,8 | |
| FR4 | 5 | 5 | 3 | 5 | 5 | 4,6 | |
| FR5 | 5 | 4 | 4 | 5 | 5 | 4,6 | |
| FR6 | 4 | 4 | 4 | 4 | 3 | 3,8 | |
| FR7 | 5 | 4 | 5 | 5 | 5 | 4,8 | |
| FR8 | 4 | 3 | 4 | 5 | 5 | 4,2 | |
| FR9 | 5 | 5 | 5 | 5 | 5 | 5,0 | |
| FR10 | 5 | 5 | 5 | 5 | 5 | 5,0 | |
| FR11 | 5 | 5 | 5 | 5 | 5 | 5,0 | |
| FR12 | 4 | 3 | 4 | 5 | 5 | 4,2 | |
| FR13 | 5 | 5 | 5 | 5 | 5 | 5,0 | |
| FR14 | 5 | 5 | 5 | 4 | 4 | 4,6 | |
| FR15 | 5 | 5 | 5 | 5 | 5 | 5,0 | |
| FR16 | 5 | 4 | 5 | 5 | 5 | 4,8 | |
| FR17 | 5 | 5 | 4 | 5 | 4 | 4,6 | |
| FR18 | 5 | 5 | 5 | 5 | 4 | 4,8 | |
| FR19 | 5 | 5 | 5 | 5 | 5 | 5,0 | |
| FR20 | 5 | 5 | 4 | 5 | 4 | 4,6 | |
| FR21 | 5 | 5 | 5 | 5 | 5 | 5,0 | |
| FR22 | 5 | 5 | 4 | 5 | 5 | 4,8 | |
| FR23 | 5 | 4 | 4 | 5 | 4 | 4,4 | |
| FR24 | 4 | 4 | 4 | 5 | 4 | 4,2 | |
| FR25 | 4 | 5 | 5 | 5 | 5 | 4,8 | |
| FR26 | 5 | 5 | 5 | 5 | 5 | 5,0 | |
| FR27 | 5 | 5 | 5 | 5 | 5 | 5,0 | |
| FR28 | 5 | 5 | 5 | 5 | 4 | 4,8 | |
| FR29 | 4 | 4 | 4 | 4 | 4 | 4,0 | |
| FR30 | 5 | 5 | 5 | 5 | 5 | 5,0 | |
| FR31 | 5 | 5 | 4 | 5 | 5 | 4,8 | |
| FR32 | 4 | 3 | 4 | 5 | 5 | 4,2 | |
| FR33 | 5 | 5 | 3 | 5 | 5 | 4,6 | |
| FR34 | 5 | 5 | 4 | 5 | 4 | 4,6 | |
| FR35 | 4 | 4 | 4 | 5 | 4 | 4,2 | |
| FR36 | 5 | 4 | 4 | 4 | 5 | 4,4 | |
| FR37 | 5 | 5 | 5 | 5 | 5 | 5,0 | |
| FR38 | 4 | 4 | 4 | 5 | 5 | 4,4 | |
| FR39 | 5 | 5 | 5 | 5 | 5 | 5,0 | |
| FR40 | 5 | 4 | 5 | 5 | 5 | 4,8 | |
| FR41 | 4 | 4 | 5 | 5 | 5 | 4,6 | |
| FR42 | 5 | 5 | 4 | 5 | 4 | 4,6 | |
| FR43 | 5 | 5 | 5 | 5 | 5 | 5,0 | |
| FR44 | 3 | 4 | 4 | 5 | 4 | 4,0 | |
| FR45 | 5 | 5 | 5 | 5 | 5 | 5,0 | |
| FR46 | 5 | 5 | 5 | 5 | 5 | 5,0 | |
| FR47 | 5 | 5 | 4 | 4 | 4 | 4,4 | |
| FR48 | 4 | 4 | 5 | 5 | 4 | 4,4 | |
| FR49 | 5 | 4 | 4 | 5 | 5 | 4,6 | |

**Légende :** 1 = insuffisant, 3 = acceptable, 5 = excellent. **Signal** : une note inférieure à 3 dans au moins un critère — aucune exigence n'en porte.

### Suggestions d'amélioration

Aucune exigence n'atteint le seuil de signalement (note < 3), donc aucune correction n'est due à ce titre. Les sept exigences qui portent un 3 sont listées ici comme points d'attention, avec ce qui les relèverait — à porter par `bmad-edit-prd` seulement si le fondateur retient l'un d'eux :

- **FR4** (Atteignable 3) — le rejeu de la connexion enregistrée suppose que le compte de démo n'exige pas de second facteur et que son écran de connexion ne change pas. Le cadrage nomme déjà ce risque ; l'exigence gagnerait à porter la condition qu'elle suppose (« sur un compte sans second facteur »).
- **FR6** (Traçable 3) — le média de substitution n'est appelé par aucun parcours ni par le périmètre du MVP ; sa seule source est le paragraphe de portage du moteur. Le rattacher au parcours de génération, ou le déclarer explicitement comme capacité de secours.
- **FR8** et **FR12** (Mesurable 3) — les gardes de lisibilité et de zone sûre sont nommées, mais leurs seuils chiffrés vivent hors du PRD. FR13 impose déjà que le refus affiche la mesure et le seuil ; nommer où ces seuils sont définis (fichier de règles versionné) rendrait la mesure vérifiable sans lire le code.
- **FR32** (Mesurable 3) — « prévenu avant qu'une publication n'échoue pour jeton expiré » n'a pas de délai ; NFR31 renvoie ce délai à l'architecture. Une valeur proposée, même à confirmer, suffirait à rendre l'exigence testable.
- **FR33** (Atteignable 3) — la publication d'un Reel sans agrément est l'hypothèse la plus risquée du projet ; le cadrage la fait vérifier par un script jetable avant toute ligne de code. La note remontera d'elle-même quand ce résultat sera consigné.
- **FR44** (Spécifique 3) — « un message explicite » est le seul adjectif non défini des 49 exigences (déjà relevé à la validation de la mesurabilité). Nommer ce que le message doit contenir : la variable attendue et l'action à faire.

### Appréciation d'ensemble

**Sévérité :** Pass (0 % d'exigences signalées ; seuil du référentiel : Pass < 10 %, Warning 10-30 %, Critical > 30 %)

**Recommandation :** les exigences fonctionnelles présentent une bonne qualité SMART d'ensemble. Aucune révision n'est requise à ce titre.

**Lecture.** Les deux critères les plus fermes sont **Pertinent** (aucune exigence sans usage) et **Traçable** (aucune orpheline, conformément à la table de traçabilité). Les notes basses se concentrent sur **Atteignable** et **Mesurable**, et toujours pour la même raison : une valeur ou une hypothèse volontairement renvoyée à une mesure future — le chronométrage, le script jetable, les seuils de garde. Ce n'est pas un défaut de rédaction, c'est une dette de vérification que le PRD assume et nomme ; elle s'éteindra aux premières mesures, sans réécrire une seule exigence.

## Appréciation holistique de la qualité

**Méthode.** Évaluation directe du document entier dans le contexte courant (voie de dégradation gracieuse : aucun sous-agent n'est ouvert dans cette session, l'élicitation avancée n'est pas disponible). Le PRD a été relu pour sa forme d'ensemble — les 50 titres de ses 625 lignes, son ouverture, sa charnière de traçabilité et sa clôture — et non composant par composant : ce contrôle juge la lecture, pas les exigences prises une à une, déjà notées aux étapes v-03 à v-10.

### Déroulé et cohérence du document

**Appréciation.** L'ordonnancement va du général au vérifiable sans revenir en arrière : Résumé exécutif → Classification → Critères de succès → Périmètre → Parcours utilisateur → Exigences propres au domaine → Innovation → Exigences propres au type de projet → Cadrage et phases → Exigences fonctionnelles → Exigences non fonctionnelles. Chaque section suppose la précédente et aucune n'exige la suivante pour se comprendre. Un lecteur qui s'arrête après le Périmètre sait déjà ce qu'est le produit et ce qu'il ne sera pas ; un lecteur qui va jusqu'aux FR sait pourquoi chacune existe.

**Forces.**

- La **charnière de traçabilité est explicite** : la table « Synthèse des exigences issues des parcours » nomme dix capacités et le parcours qui les impose, avant que la première FR ne soit écrite. Elle transforme le passage narratif → contractuel en un objet vérifiable, ce qu'a confirmé v-06 (32 FR sur 49 remontent à un parcours nommé).
- Le **périmètre se répète sans se contredire** : ce qui est hors V1 est dit au Périmètre, redit au Cadrage avec sa phase de retour, et reformulé en une phrase d'exclusion à la fin des FR puis des NFR. Les trois formulations disent la même chose ; c'est de la redondance utile, pas de la dérive.
- La **voix est constante** : présent de l'indicatif, sujet nommé (le fondateur, Claude, regie), pas de conditionnel. Le document ne négocie pas avec lui-même.
- Les **décisions du fondateur sont datées et attribuées** au fil des sections, jamais fondues dans une justification anonyme. Un lecteur peut rouvrir un arbitrage sans deviner qui l'a tranché.

**Axes d'amélioration.**

- Le document **n'a ni sommaire ni index des exigences**. À 625 lignes et 50 titres, une table des matières en tête et un renvoi FR → section d'origine feraient gagner un temps réel à la relecture, surtout pour l'architecture qui reviendra chercher une exigence isolée.
- La **section Innovation et motifs inédits est la plus faible en information dure** : elle argumente une position (le pilotage par MCP comme motif rare) sans chiffre ni source, là où le reste du document s'appuie sur des décisions datées ou des mesures à venir. Elle ne ment pas — elle assume une conviction — mais elle détonne dans un document par ailleurs très factuel.
- Les **valeurs de performance restent des propositions**, marquées comme telles et renvoyées au chronométrage de « traiteur 1 ». C'est honnête et c'est la bonne décision, mais cela laisse un lecteur pressé sans cible chiffrée sur toute la section Performance.

### Efficacité pour le double public

**Pour les humains.**

- *Dirigeant* : le Résumé exécutif tient en quatre paragraphes et la table Résultats mesurables donne cinq indicateurs chiffrés. Une décision d'engagement se prend sur ces deux blocs.
- *Développeur* : les 49 FR sont numérotées, thématisées en sept familles et énoncent un acteur et un effet, sans dire comment le faire — v-07 a relevé douze fuites d'implémentation, toutes concentrées dans les NFR (NFR16, NFR33 à NFR36), aucune dans les FR.
- *Concepteur d'interface* : les cinq parcours décrivent un enchaînement d'écrans et d'états sans imposer de maquette ; les états de la librairie (brouillon, prête, refusée, programmée, publiée, échec) et les diagnostics de garde donnent la matière d'un écran sans la dessiner.
- *Décideur de périmètre* : le Cadrage nomme l'ordre de livraison, ce qui glisse en premier si le temps manque, et ce qui ne glisse jamais. Un arbitrage de fin de V1 se tranche sans rouvrir le débat.

**Pour les modèles de langage.**

- *Structure lisible par machine* : titres à trois niveaux cohérents, exigences préfixées `FR`/`NFR` numérotées sans trou, tables Markdown régulières, frontmatter YAML renseigné (classification, vision, phases, documents d'entrée). Un traitement automatique peut extraire les exigences sans analyse de prose.
- *Prêt pour la conception d'interface* : les parcours fournissent acteurs, états et transitions ; les libellés d'états sont fixés dans le document et repris à l'identique dans les FR.
- *Prêt pour l'architecture* : les contraintes techniques, les intégrations, les bornes par réseau, la clé maîtresse et le runtime unique sont posés ; ce qui manque est explicitement renvoyé à l'architecture, jamais laissé vide en silence.
- *Prêt pour les epics et stories* : les sept familles de FR se découpent presque directement en epics, et le Cadrage donne l'ordre. Réserve : les douze écarts de mesurabilité relevés en v-05 devront recevoir leur valeur avant qu'une story ne soit dite « finie ».

**Note du double public : 4/5.** Le document sert les deux publics sans compromis visible ; ce qui coûte le cinquième point est l'absence de sommaire et de renvoi FR → parcours dans le corps même du document — utiles à l'humain, et évidents à produire pour la machine.

### Conformité aux principes du PRD BMAD

| Principe | Statut | Notes |
|---|---|---|
| Densité d'information | Atteint | v-03 : 0 remplissage, 0 tournure verbeuse, 0 redondance sur les trois familles du standard (sévérité Pass) |
| Mesurabilité | Partiel | v-05 : 12 écarts Critical, tous des gabarits de NFR laissés sans valeur, renvoyés au chronométrage à venir |
| Traçabilité | Partiel | v-06 : 2 Warning ; 32 FR sur 49 remontent à un parcours nommé, 16 à un objectif ou une décision datée, 1 (FR6) à une source unique hors parcours |
| Conscience du domaine | Atteint | v-08 : sans objet au sens du référentiel (aucun domaine réglementé), mais conformité RGPD, CGU et règles de plateforme traitées explicitement |
| Absence d'anti-motifs | Partiel | v-07 : 12 fuites d'implémentation, toutes dans les NFR (NFR16, NFR33 à NFR36) ; aucune dans les 49 FR |
| Double public | Atteint | Ouverture exécutive, exigences numérotées, tables régulières, frontmatter structuré ; note 4/5 ci-dessus |
| Format Markdown | Atteint | v-02 : format détecté et conforme ; titres hiérarchisés, tables valides, frontmatter YAML complet |

**Principes atteints : 4/7** (3 partiels, 0 non atteint).

### Note globale de qualité

**Note : 4/5 — Bon.**

Échelle : 5 Excellent (prêt sans réserve) · 4 Bon (solide, corrections mineures) · 3 Adéquat (utilisable, lacunes notables) · 2 À retravailler (écarts importants) · 1 Problématique (refonte nécessaire).

Le document est complet, cohérent, dense et traçable ; les trois principes partiels tiennent à deux causes précises et bornées — des valeurs volontairement renvoyées à une mesure future, et des NFR rédigées en solution plutôt qu'en exigence. Aucune des deux ne remet en cause la structure ni le périmètre. Le cinquième point s'obtiendra par correction, pas par réécriture.

### Trois améliorations prioritaires

1. **Remplacer les gabarits de NFR restés sans valeur.** Douze exigences non fonctionnelles portent une forme mesurable mais pas de nombre (v-05, Critical). Pourquoi : une NFR sans valeur ne se teste pas, donc ne se refuse pas — elle passera en recette par défaut. Comment : chronométrer une génération du scénario « traiteur 1 » comme prévu, puis écrire la valeur constatée majorée d'une marge assumée dans chaque NFR concernée ; là où la mesure n'existera pas avant l'architecture, écrire la valeur qui déclenche le refus plutôt que de laisser le champ ouvert.
2. **Réécrire les cinq NFR qui décrivent une solution.** NFR16 et NFR33 à NFR36 nomment un moyen (mécanisme, dispositif, outillage) là où l'exigence devrait nommer un effet observable (v-07, 12 occurrences Critical). Pourquoi : une exigence qui impose le moyen ferme l'espace d'architecture avant qu'elle ne commence, et rend l'exigence invérifiable autrement qu'en inspectant le code. Comment : pour chacune, énoncer ce que le fondateur doit pouvoir constater, et déplacer le moyen évoqué vers les Considérations de mise en œuvre, où il est légitime comme intention.
3. **Rattacher FR6 à un parcours ou l'assumer comme hors parcours.** FR6 (média de substitution pour une page impossible à capturer) est la seule exigence dont la source est une remarque isolée, sans parcours ni décision datée (v-06, et point d'attention repris en v-10). Pourquoi : une exigence sans parcours n'a pas de recette naturelle, et se retrouve arbitrée en cours de route par celui qui la code. Comment : soit l'ajouter au parcours 5 (la vidéo refusée par la garde) comme échappatoire encadrée avec sa recette, soit la marquer explicitement hors MVP et la faire descendre en fin de V1.

### Synthèse

**Ce PRD est :** un contrat de capacités complet et traçable pour la V1 de regie, solide sur le périmètre et les parcours, dont les seules faiblesses sont des valeurs différées à une mesure et cinq exigences non fonctionnelles rédigées en solution.

**Pour le rendre excellent :** traiter les trois améliorations ci-dessus.

## Validation de complétude

**Méthode.** Contrôle de recevabilité mené directement dans le contexte courant (dégradation gracieuse : aucun sous-agent ouvert). Quatre balayages : variables de gabarit restées dans le texte, présence du contenu attendu par section, complétude propre à chaque section, complétude du frontmatter. Ce contrôle ne juge pas la qualité — elle a été appréciée à l'étape précédente — seulement ce qui manque.

### Complétude du gabarit

**Variables de gabarit trouvées : 0**

Balayage sur `{variable}`, `{{variable}}`, `[placeholder]`, `TBD`, `TODO`, `XXX` et leurs équivalents français : aucune occurrence. Aucune variable de gabarit ne subsiste ✓

Seule occurrence d'accolades dans le document : `marketing/video/moteur/{format,scenes,montage,rendu,ffmpeg,images}.mjs` au frontmatter — un chemin de fichiers réel en notation d'expansion, pas un espace réservé.

### Complétude du contenu par section

**Résumé exécutif :** complet — quatre paragraphes (définition du produit, utilisateur cible, problème résolu, état futur visé) plus quatre puces « Ce qui rend ce produit singulier ». L'énoncé de vision est présent et repris au frontmatter (`vision.pilotage`, `vision.etatFutur`).

**Critères de succès :** complet — succès utilisateur, succès business, succès technique, et une table `Résultats mesurables` à cinq indicateurs, chacun avec sa cible et sa méthode de mesure.

**Périmètre du produit :** complet — MVP en sept points, Croissance (fin de V1, V1.1), Vision (V2 et au-delà). Le hors-périmètre est énoncé à trois endroits concordants : ici, au Cadrage, et en phrase de clôture des exigences fonctionnelles puis non fonctionnelles.

**Parcours utilisateur :** complet — cinq parcours numérotés (P1 à P5) plus une table de synthèse rattachant dix capacités à leur parcours d'origine.

**Exigences fonctionnelles :** complet — 49 exigences numérotées FR1 à FR49 sans trou, réparties en sept familles, précédées d'un préambule qui pose la valeur contractuelle de la liste.

**Exigences non fonctionnelles :** complet — 37 exigences numérotées NFR1 à NFR37 sans trou, réparties en six familles (performance, fiabilité, sécurité, accessibilité, intégration, exploitation).

**Autres sections :** complètes — Classification du projet (table à six lignes), Exigences propres au domaine, Innovation et motifs inédits, Exigences propres au type de projet, Cadrage du projet et développement par phases.

### Complétude propre à chaque section

**Mesurabilité des critères de succès : tous** mesurables — chacun des cinq indicateurs porte une cible et la source qui la constate (journal des publications, journal d'audit, test automatisé, scan de secrets).

**Couverture des parcours : oui** — le produit n'a que deux acteurs, le fondateur et Claude ; les deux sont couverts, Claude comme acteur principal du parcours 4 et acteur alternatif des parcours 1 et 5.

**Couverture du périmètre MVP par les exigences fonctionnelles : oui** — les sept capacités du MVP trouvent chacune leurs exigences : Paramètres (FR30 à FR32, FR43, FR44), Générateur (FR1 à FR8), Éditeur (FR9 à FR13), Librairie (FR15 à FR18), Publication Instagram (FR19 à FR29, FR33), MCP (FR37 à FR42), Socle (FR44 à FR46, FR49).

**Critères propres aux exigences non fonctionnelles : une partie** — la forme mesurable est présente partout, mais douze exigences laissent leur valeur ouverte, volontairement renvoyée au chronométrage du scénario « traiteur 1 » et aux décisions d'architecture (relevé en détail à l'étape de mesurabilité).

### Complétude du frontmatter

**stepsCompleted :** présent — 13 entrées, une par étape de création.
**classification :** présent — `projectType`, `domain`, `complexity`, `projectContext`, `distribution`.
**inputDocuments :** présent — cinq entrées, plus `documentCounts` (0 cahier produit, 0 recherche, 0 idéation, 9 documents projet).
**date :** absent — aucun champ de date, de version ou d'horodatage dans le frontmatter.

**Complétude du frontmatter : 3/4**

### Bilan de complétude

**Complétude d'ensemble : 100 %** (6 sections requises complètes sur 6, et 5 sections supplémentaires complètes).

**Manques bloquants : 0**

**Manques mineurs : 2**

1. Aucun champ de date au frontmatter : le document ne porte pas sa date de rédaction. Les décisions du fondateur sont datées dans le corps du texte, ce qui limite la portée du manque, mais un lecteur ne peut pas dater le document lui-même sans consulter l'historique du dépôt.
2. Douze exigences non fonctionnelles sans valeur chiffrée, en attente d'une mesure assumée et planifiée (chronométrage, décisions d'architecture).

**Sévérité : Warning** (aucune variable de gabarit, aucune section manquante ; deux manques mineurs).

**Recommandation :** le PRD est recevable. Ajouter un champ de date au frontmatter, et remplacer les douze valeurs différées dès que le chronométrage aura eu lieu. Aucun des deux manques n'empêche de passer à l'étape suivante du cycle.

## Synthèse de validation

**Méthode.** Cette section ne produit aucun constat nouveau : elle rassemble les résultats des douze contrôles précédents, tels qu'ils ont été écrits aux sections ci-dessus, et en tire un statut d'ensemble, une lecture et une recommandation. Toute divergence entre cette synthèse et une section amont doit être tranchée en faveur de la section amont.

### Statut d'ensemble

**Statut d'ensemble : Critical**, au sens strict du référentiel — deux contrôles sur douze rendent une sévérité Critical, et la règle veut qu'un seul suffise à porter l'ensemble à ce niveau.

**Lecture.** Ce statut ne dit pas que le PRD est inutilisable, et il ne doit pas être lu ainsi. Les deux contrôles en cause pointent **deux causes bornées et déjà identifiées**, dont aucune ne touche la structure, le périmètre ni la traçabilité du document :

1. **Douze valeurs chiffrées volontairement différées** à une mesure qui n'a pas encore eu lieu — le chronométrage d'une génération du scénario « traiteur 1 ». Ces douze écarts sont comptés une fois en mesurabilité (v-05, Critical) et recomptés en manque mineur de complétude (v-12) ; ce sont les mêmes.
2. **Cinq exigences non fonctionnelles rédigées en solution** plutôt qu'en effet observable — NFR16 et NFR33 à NFR36 —, qui produisent les douze fuites d'implémentation relevées en v-07 (Critical). Aucune exigence fonctionnelle n'est concernée : les quarante-neuf FR sont intactes.

Autrement dit, le document est complet à 100 %, conforme à son type de projet à 100 %, sans exigence orpheline et sans variable de gabarit ; ce qui le fait tomber en Critical tient à deux corrections circonscrites, l'une en attente d'une mesure, l'autre purement rédactionnelle.

### Résultats par contrôle

| # | Contrôle | Résultat |
|---|---|---|
| v-01 | Découverte des documents d'entrée | 5 documents, aucun cahier produit |
| v-02 | Détection du format | BMAD Standard — 6 sections de base sur 6 |
| v-03 | Densité d'information | **Pass** (0 violation) |
| v-04 | Couverture du cahier produit | Sans objet (aucun cahier produit fourni) |
| v-05 | Mesurabilité | **Critical** (12 exigences en écart) |
| v-06 | Traçabilité | **Warning** (2 lacunes, 0 exigence orpheline) |
| v-07 | Fuites d'implémentation | **Critical** (12 fuites, toutes dans les NFR) |
| v-08 | Conformité au domaine | Sans objet (domaine non réglementé) |
| v-09 | Conformité au type de projet | **Pass** (100 %) |
| v-10 | Qualité SMART des exigences | **Pass** (0 % d'exigences signalées) |
| v-11 | Appréciation holistique | **4/5 — Bon** (4 principes BMAD atteints sur 7) |
| v-12 | Complétude | **Warning** (100 % de complétude, 2 manques mineurs) |

### Écarts bloquants

**Deux familles, 24 occurrences, aucune dans les exigences fonctionnelles.**

1. **Mesurabilité — 12 exigences sans valeur chiffrée** (v-05). Des gabarits de NFR laissés ouverts en attendant le chronométrage : durée de rendu, seuils de lisibilité, délais de garde. Tant qu'ils portent une formule plutôt qu'un nombre, ces exigences ne sont ni testables ni opposables.
2. **Fuites d'implémentation — 12 occurrences dans cinq NFR** (v-07 : NFR16, NFR33, NFR34, NFR35, NFR36). Ces exigences nomment le moyen (l'outil, la bibliothèque, le mécanisme) au lieu d'énoncer l'effet observable ; elles préemptent des décisions qui reviennent à l'architecture.

### Avertissements

1. **Traçabilité — 2 lacunes** (v-06) : sur 49 exigences fonctionnelles, 32 se rattachent à un parcours utilisateur, 16 à un objectif ou à une décision du fondateur, et **FR6** (média de substitution pour une page impossible à capturer) ne se rattache à aucun parcours. Aucune exigence orpheline au sens strict.
2. **Complétude — 2 manques mineurs** (v-12) : le frontmatter du PRD ne porte **aucun champ de date** (3 champs attendus sur 4) ; et les douze valeurs différées déjà comptées au titre de la mesurabilité.

### Forces

- **Complétude intégrale** : les six sections de base BMAD sont présentes et complètes, cinq sections supplémentaires les renforcent, et le document ne contient **aucune variable de gabarit**, aucun `TODO`, aucun `[à compléter]`.
- **Densité d'information sans remplissage** : contrôle v-03 en Pass, aucune violation détectée sur 625 lignes.
- **Traçabilité explicite** : la table « Synthèse des exigences issues des parcours » et ses dix capacités font charnière entre les parcours et les exigences ; aucune exigence n'est orpheline.
- **Qualité SMART** : 0 % des exigences fonctionnelles signalées, le meilleur résultat de la validation.
- **Périmètre stable** : le hors-périmètre est énoncé en trois endroits concordants, chaque exclusion datée et attribuée au fondateur.
- **Conformité au type de projet** : 100 %, pour un type composite (`web_app` + `developer_tool`) qui cumule deux référentiels.
- **Double public servi** : 4/5 — un dirigeant lit le Résumé exécutif et cinq indicateurs chiffrés, un développeur lit 49 FR numérotées en sept familles.

### Appréciation holistique

**4/5 — Bon.** Quatre principes BMAD atteints sur sept (densité d'information, conscience du domaine, double public, format Markdown), trois partiels (mesurabilité, traçabilité, absence d'anti-motifs), aucun non atteint.

### Trois améliorations prioritaires

1. **Remplacer les gabarits de NFR restés sans valeur.** Chronométrer une génération du scénario « traiteur 1 », écrire la valeur constatée majorée d'une marge ; à défaut, écrire la valeur à partir de laquelle le résultat serait refusé. Lève les 12 écarts de mesurabilité et le second manque de complétude.
2. **Réécrire les cinq NFR qui décrivent une solution** (NFR16, NFR33 à NFR36) : énoncer l'effet observable dans l'exigence, déplacer le moyen vers les Considérations de mise en œuvre. Lève les 12 fuites d'implémentation.
3. **Rattacher FR6 à un parcours** — l'ajouter au parcours 5 comme échappatoire encadrée — ou l'assumer explicitement hors MVP, en fin de V1. Lève la lacune de traçabilité.

À ces trois-là s'ajoute une correction d'une ligne : **ajouter un champ de date au frontmatter du PRD**, absent aujourd'hui.

### Recommandation

**Le PRD est recevable sous réserve des deux corrections ci-dessus.** Il est complet, structuré, traçable et conforme à son type de projet ; ce qui le maintient en Critical est circonscrit à douze valeurs en attente d'une mesure et à cinq exigences non fonctionnelles à reformuler — soit un travail d'édition ciblé, sans reprise de la structure ni du périmètre.

Deux voies s'offrent donc, et elles ne s'excluent pas : corriger d'abord ces deux familles d'écarts (workflow `bmad-edit-prd`, qui sait consommer ce rapport), ou poursuivre la conception en tenant les valeurs différées pour ce qu'elles sont — un engagement à mesurer avant l'architecture. La seule chose à ne pas faire est de laisser les douze valeurs ouvertes traverser l'architecture : c'est là qu'elles deviendraient des hypothèses tacites.

**Rapport de validation enregistré :** `docs/planning/prd-validation-report.md`
