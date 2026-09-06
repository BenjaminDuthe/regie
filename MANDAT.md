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
| 5 | Serveur de dev avec l'HTML prêt (maquette UX + structure) pour validation | Preview ouverte, capture envoyée, validation du fondateur | à faire |

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
