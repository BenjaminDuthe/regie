---
validationTarget: 'docs/planning/prd.md'
validationDate: '2026-09-06'
inputDocuments:
  - ../../MANDAT.md
  - saas-souverain:marketing/video/README.md
  - saas-souverain:marketing/video/moteur/{format,scenes,montage,rendu,ffmpeg,images}.mjs
  - saas-souverain:marketing/video/generer.mjs
  - assets-video-2466-sauvegarde:PUBLICATION.md
validationStepsCompleted: [step-v-01-discovery, step-v-02-format-detection, step-v-03-density-validation]
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
