---
validationTarget: 'docs/planning/prd.md'
validationDate: '2026-09-06'
inputDocuments:
  - ../../MANDAT.md
  - saas-souverain:marketing/video/README.md
  - saas-souverain:marketing/video/moteur/{format,scenes,montage,rendu,ffmpeg,images}.mjs
  - saas-souverain:marketing/video/generer.mjs
  - assets-video-2466-sauvegarde:PUBLICATION.md
validationStepsCompleted: [step-v-01-discovery, step-v-02-format-detection, step-v-03-density-validation, step-v-04-brief-coverage-validation, step-v-05-measurability-validation, step-v-06-traceability-validation, step-v-07-implementation-leakage-validation]
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
