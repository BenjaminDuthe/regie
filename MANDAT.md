# MANDAT — nouveau projet « régie réseaux sociaux + générateur vidéo » (2026-09-05)

> Versionné à la racine du dépôt public `github.com/BenjaminDuthe/regie` depuis le 2026-09-06 (R24) ;
> rédigé le 2026-09-05 dans le scratchpad, avant la création du dépôt.

## Prompt d'origine (mot pour mot)

ok on va améliorer ce projet je veux construire une interface web /grill-plan
le but de cette session tu vas me poser des questions avec 3 choix multiple si les choix ne me convienne pas je mettrais ma réponse dans autres
le but de cette interface sera de gérer tout mes réseaux et préparer mes contenus pour ça on va utiliser les api de tiktok insta facebook pour une page et x et linkedin dit moi lesquels sont payant, ile ne seront pas disponible en V1
je veux un mcp pour que claude puissent tout controller
pour générer une viddéo je veux avoir a donner l'url de plusieurs page avec un ordre page en auto ça scrappe la page avec la connexion a l'app d'enregistrer puis ça génère une vidéos je dois pouvoir avoir un éditeur complet pour modifier tous les textes les animation je veux les modifier depuis l'éditeur et tout ça disponible via mcp
tout ça est un projet a part entiere rassemble toutes infos puis tu créer un nouveau projet sur github en publique
il faut une interface pour rensigener toutes les clé api dans paramettres structure correctmment dès le départ
une fois le grill terminé tu doit démarrer un dev serveur avec l'html pret pour que je valide l'ux et la structure
pour la v1 aucune intégration d'ia a part le mcp
une fois les vidéo génrer elle sont disponible dans une librairie disponible pour les poster en 1 cliq ou programmé le poste

## Lots

| # | Lot | Preuve de complétude | État |
|---|-----|----------------------|------|
| 1 | Grill : questions à 3 choix (+ « Autre »), une décision par question | Toutes les branches tranchées et consignées dans le PRD | fait (2026-09-06) |
| 2 | Verdict API payantes (TikTok, Instagram, Facebook Page, X, LinkedIn) → exclusion de la V1 | Tableau dans le PRD, validé par le fondateur | fait (2026-09-06) — tableau « Classification du projet » et section « Exigences propres au domaine » du PRD |
| 3 | PRD complet : régie web + générateur vidéo (URL ordonnées, connexion app enregistrée, scrap) + éditeur textes/animations + librairie + publication 1 clic / programmée + paramètres clés API + MCP | `prd.md` dans le nouveau dépôt, workflow BMAD arrivé à `step-12-complete` | fait (2026-09-06) — `docs/planning/prd.md` (49 FR, 37 NFR), workflow arrivé à `step-12-complete` |
| 4 | Nouveau dépôt GitHub PUBLIC rassemblant toutes les infos (PRD, mandat, moteur vidéo existant porté ou référencé) | `gh repo view` = PUBLIC ; MANDAT à la racine, PRD dans `docs/planning/prd.md`, moteur vidéo référencé dans le PRD (portage = travail d'architecture) | fait (2026-09-06) |
| 5 | Serveur de dev avec l'HTML prêt (maquette UX + structure) pour validation | Preview ouverte, capture envoyée, validation du fondateur | fait (2026-09-08) — 7 écrans servis par `maquette/serveur.mjs` (port 4310), preview ouverte, 8 captures envoyées, UX validée par le fondateur le 2026-09-08 |
| 6 | Validation du PRD par le workflow BMAD `bmad-validate-prd` (choix du fondateur, 2026-09-06, avant la maquette) | Rapport de validation dans `docs/planning/`, écarts traités ou consignés | fait (2026-09-08) — docs/planning/prd-validation-report.md, 13 étapes, statut Critical, note 4/5 |
| 7 | Architecture technique (`bmad-create-architecture`) : briques retenues, schéma des données, contrat des outils MCP, portage du moteur vidéo existant | `docs/planning/architecture.md` dans le dépôt, workflow BMAD arrivé à sa dernière étape | en cours (2026-09-08) |

## Contraintes posées par le fondateur
- Projet À PART de saas-souverain — rien dans ce dépôt-ci.
- V1 : aucune IA hors MCP.
- Les réseaux à API payante sont exclus de la V1.
- Tout ce que fait l'interface doit être pilotable par Claude via MCP.

## Hors périmètre (déclaré)
- Installation par des tiers (doc, config par instance, support) → V1.1 — panel BMAD + fondateur, 2026-09-05.
- RGPD sur les statistiques d'audience → V1.1 (les stats n'existent pas encore) — fondateur, 2026-09-05.
- Comptes d'une deuxième marque (Fanny, MGA) → hors V1 ; le modèle prévoit la marque, n'en gère qu'une — fondateur, 2026-09-05.
- X (API payante) → V2 ; LinkedIn : connecteur et clé présents, publication après agrément partenaire — fondateur, 2026-09-05.
- Notification externe d'un échec de publication (courriel, Telegram…) et nouvelle tentative automatique → hors V1 ; l'échec est visible dans regie seulement, avec « rejouer » — fondateur, 2026-09-06.
- Relecture mobile et audit par lecteur d'écran → hors V1 ; ordinateur seulement, bandeau sous 1 280 px — fondateur, 2026-09-06.
- GitHub Pages pour les pages CGU et confidentialité → écarté ; regie sert ces pages elle-même (fin de V1) — fondateur, 2026-09-06.
- Image Docker, paquet npm, ligne de commande, API REST publique, second runtime (Python…) → hors V1 ; Docker et npm arrivent en V1.1 avec l'installation tierce — fondateur, 2026-09-06.
- TikTok → glisse en V1.1 en premier si le temps manque avant la fin de V1 ; la programmation et l'éditeur ne glissent jamais — fondateur, 2026-09-06.
- Plusieurs comptes connectés par réseau → hors V1 ; un compte par réseau, remplaçable dans Paramètres — fondateur, 2026-09-06.
- Second facteur d'authentification → hors V1 ; mot de passe défini à la première mise en route — fondateur, 2026-09-06.
- Suppression d'une vidéo ayant eu une publication → refusée ; seule une vidéo jamais publiée se supprime, le reste s'archive — fondateur, 2026-09-06.
- Cible chiffrée de durée de rendu avant le chronométrage de « traiteur 1 », montée en charge multi-utilisateurs ou multi-marques, haute disponibilité → hors V1 — fondateur, 2026-09-06.

## Réorientation du 2026-10-02 — capture vidéo de n'importe quelle application + montage façon CapCut

Décisions du fondateur, 2026-10-02 :
- **Capture** : la vidéo ne naît plus seulement de captures d'écran d'URL Établia. Trois sources en V1 : (1) apps web par URL, scénario joué et **enregistré en vidéo** par un navigateur piloté ; (2) apps mobiles enregistrées dans le simulateur iOS / l'émulateur Android ; (3) import de rushes existants. La capture de fenêtre ou d'écran du Mac en direct n'est pas retenue.
- **Éditeur façon CapCut, tout en V1** : timeline multi-clips (couper, rogner, réordonner, vitesse) ; recadrage 9:16 avec auto-zoom qui suit curseur et clics ; textes et animations (accroches, sous-titres, carte de fin, garde de zone sûre conservée) ; musique et transitions.
- **Publication** : le périmètre régie du PRD (Instagram, Facebook Page, TikTok, programmation, librairie) **reste en V1**.
- **100 % gratuit et libre** : aucune brique sous licence payante ou conditionnelle (Remotion écarté) ; uniquement des licences libres (MIT, Apache, BSD, LGPL/GPL, domaine public) — fondateur, 2026-10-02.
- **IA** : la contrainte « aucune IA hors MCP » est levée **pour de l'IA locale uniquement** (ex. transcription Whisper en local pour les sous-titres) ; aucune API d'IA en nuage.

Conséquences : le PRD (familles « scénarios et capture » et « génération et éditeur ») et l'architecture (portage du moteur, modèle de rendu, éditeur) sont à réviser avant tout code.

| # | Lot | Preuve de complétude | État |
|---|-----|----------------------|------|
| 8 | Révision du PRD pour la capture vidéo multi-sources et l'éditeur timeline | `prd.md` amendé, nouvelles FR tracées | fait (2026-10-02) — nouveau PRD `docs/planning/prds/prd-regie-2026-10-02/prd.md` (71 FR, 39 NFR), finalisé avec bmad-prd |
| 9 | Révision de l'architecture (modèle de timeline, moteur de rendu vidéo, capture web/mobile, IA locale) puis clôture des étapes 7-8 | `architecture.md` arrivé à sa dernière étape | fait (2026-10-02) — socle `docs/planning/architecture/architecture-regie-2026-10-02/ARCHITECTURE-SPINE.md` (21 décisions), relu par quatre revues ; `architecture.md` marqué remplacé |
| 10 | Maquette de l'éditeur timeline et de l'écran de capture | Écrans servis par `maquette/serveur.mjs`, validés par le fondateur | en cours (2026-10-02) — écran « Relire » validé (`maquette/public/relire.html`) ; écran de capture maquetté (`maquette/public/capture.html` : sites autorisés avec preuve DNS, compte de démo au coffre, scripts depuis Claude, un parcours enregistré ou un test importé, étapes modifiables, capture filmée avec journal, refus hors site, échec au rejeu à corriger, voix, jeton de rejeu), à valider |

### Décisions de la session de design thinking et du party mode BMAD (2026-10-02)

- **Utilisateurs** : Benjamin (Établia, MGA, Fanny) puis une bêta gratuite d'influenceuses de son entourage (face caméra, lifestyle / produits), tant que le produit n'est pas terminé. Lève « une seule marque » et « un compte par réseau » de la V1.
- **Succès à six mois** : la bêta est adoptée, les influenceuses l'utilisent chaque semaine à la place de CapCut.
- **Promesse centrale : « ne plus monter »** : un brouillon monté automatiquement (coupes, sous-titres, rythme et musique, habillage), qu'on relit et corrige. Par MCP pour Benjamin, par un bouton pour les influenceuses.
- **Ordre** : Benjamin et les démos d'apps d'abord ; le brouillon automatique doit marcher sur ses démos avant toute maquette pour les influenceuses.
- **Hébergement de la bêta** : serveur de Benjamin, accès web.
- **Mobile** : les influenceuses montent sur téléphone, d'où une application native plus tard, pas de PWA en attendant. Lève « ordinateur seulement » à terme.
- **API privée dès la conception** : une couche de services commune à l'interface, au MCP et à une API authentifiée, exposée quand l'app native arrive. Lève l'exclusion « API REST publique ».
- **Parcours des démos d'apps** : enregistré à la main par Benjamin ou écrit par Claude, toujours converti en un script d'actions modifiable et rejouable. Le journal des clics alimente l'auto-zoom.
- **Gabarit de marque** : identité visuelle seulement (logo, couleurs, polices, style des sous-titres). Le récit reste libre, décidé vidéo par vidéo.
- **Voix** : synthèse vocale locale (type Piper), avec une voix sous licence réellement libre, à valider sur deux vidéos test.

### Arbitrages du design thinking et de la révision du PRD (2026-10-02)

Ces arbitrages remplacent les points contraires de la section « Réorientation » ci-dessus.

- **Découpage V1 / V2** : V1 = montage automatique en brouillons, relecture au téléphone sans timeline, capture web par script d'actions, publication sur les comptes de Benjamin (Instagram, Facebook Page, TikTok, YouTube Shorts). **V2** = timeline complète, capture des simulateurs iOS et Android, publication pour des tiers une fois les agréments Meta et TikTok obtenus.
- **TikTok** revient en V1 pour les comptes de Benjamin.
- **Espace de marque partagé** avec circuit de validation dès la V1 (Fanny filme pour MGA et valide ce que Benjamin prépare).
- **Relecture mobile** : page web responsive en V1, sans PWA ; l'app native reste pour plus tard.
- **Licence AGPL-3.0** ; service hébergé par Benjamin ; modèle économique décidé après la bêta.
- **Second facteur** toujours hors V1.
- Le PRD de référence devient `docs/planning/prds/prd-regie-2026-10-02/prd.md` ; l'ancien `docs/planning/prd.md` reste comme source.
- **Inscription ouverte** dès la V1, avec quota par compte (2 h de rushes par mois, 20 Go) ; séance de 30 min max, 5 brouillons par séance, 3 gabarits par espace.
- **Échecs de publication** notifiés aussi par courriel (remplace « visible dans regie seulement »), toujours sans nouvelle tentative automatique.
