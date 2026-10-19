# Design Thinking Session: regie

**Date:** 2026-10-02
**Facilitator:** Benjamin
**Design Challenge:** Remplacer CapCut par un studio vidéo vertical libre et gratuit, qui capture n'importe quelle application, monte et publie — pour Benjamin et une bêta d'influenceuses.

---

## 🎯 Design Challenge

### Contexte

- **Utilisateurs de la bêta (gratuite tant que le produit n'est pas terminé)** :
  - **Benjamin**, fondateur, pour trois marques : Établia, MGA, Fanny. Contenu : démos d'applications (web, mobile), accroches, sous-titres. Pilote volontiers par Claude via MCP.
  - **Influenceuses de son entourage** : contenu **face caméra** (filmé au téléphone, parlé) et **lifestyle / produits** (plans montés en rythme sur une musique, textes à l'écran). Utilisent l'interface web, a priori pas Claude.
- **Douleurs déclarées** :
  1. CapCut est trop manuel : chaque vidéo se refait de zéro, aucun gabarit de marque, rien de pilotable.
  2. Filmer une app proprement, la recadrer en vertical et zoomer au bon endroit est pénible.
  3. Trop d'outils : capture, montage, sous-titres, publication, un outil par étape.
  4. Licence et prix : CapCut Pro payant, conditions d'utilisation et de propriété des contenus problématiques.
- **Contraintes** : 100 % libre et gratuit (aucune brique sous licence payante ou conditionnelle) ; IA uniquement en local (ex. Whisper) ; tout pilotable par MCP ; hébergé sur le serveur de Benjamin pendant la bêta (accès web, rien à installer) ; publication Instagram, Facebook Page, TikTok.
- **Succès à six mois** : **la bêta est adoptée** — les influenceuses l'utilisent chaque semaine **à la place de CapCut**.
- **Acquis existants** : PRD regie (49 FR, 37 NFR, mono-utilisateur), maquette UX validée (7 écrans), moteur vidéo libre (Chromium + ffmpeg, garde de zone sûre) dans saas-souverain.

### Énoncé du défi

**Comment permettre à des créatrices et créateurs — qu'ils filment leur visage, des produits ou des applications — de passer de leurs rushes ou de leurs écrans à une vidéo verticale montée, sous-titrée et publiée, dans un seul outil libre et gratuit, assez rapide et agréable pour qu'ils abandonnent CapCut chaque semaine ?**

Tension à garder en vue : deux profils aux besoins éloignés (démo d'app pilotée par Claude d'un côté, face caméra et lifestyle à la main de l'autre) dans un même produit.

---

## 👥 EMPATHIZE: Understanding Users

> Sources : déclarations de Benjamin (2026-10-02), son relais de la parole des influenceuses, PRD regie. Les points marqués **(H)** sont des hypothèses non vérifiées auprès des utilisatrices elles-mêmes.

### User Insights

**Benjamin — créateur de démos d'apps (utilisateur n° 1)**
- Publie pour trois marques (Établia, MGA, Fanny) ; vise trois vidéos par semaine, cadence qui ne tient pas aujourd'hui.
- Refait chaque vidéo de zéro dans CapCut : aucun gabarit de marque, rien de réutilisable, rien de pilotable par Claude.
- Filmer une app proprement, la passer en vertical et zoomer au bon endroit lui coûte le plus d'effort.
- Jongle entre plusieurs outils : capture, montage, sous-titres, publication.
- Refuse les licences payantes ou conditionnelles et se méfie des conditions de CapCut sur la propriété des contenus.
- Délègue volontiers à Claude ; veut garder la main en relecture.

**Influenceuses de l'entourage (bêta)**
- Contenu face caméra (filmé et parlé au téléphone) et lifestyle / produits (plans en rythme sur une musique, textes à l'écran).
- **Montent sur téléphone.**
- **Douleur principale déclarée : « c'est trop long de monter une vidéo »** — et toutes les étapes sont jugées trop longues : couper les rushes, sous-titres, rythme et musique, textes et habillage.
- Utilisent l'interface, pas Claude **(H)**.
- Le prix et la licence ne les motivent pas ; le gain de temps, oui **(H, avancée par Victor en party mode)**.

### Key Observations

1. **La douleur n'est pas une étape, c'est l'acte de monter.** Les quatre étapes sont citées : automatiser une seule étape ne suffit pas, il faut un brouillon complet.
2. **Les deux profils veulent la même chose par des portes différentes** : Benjamin délègue le montage à Claude, les influenceuses veulent qu'il se fasse tout seul. Le cœur commun est un moteur de montage automatique, sans écran ni souris.
3. **Le support diverge** : ordinateur pour Benjamin, téléphone pour les influenceuses. L'éditeur riche sert à corriger ; la création initiale ne doit pas en dépendre.
4. **La répétition est une douleur cachée** : refaire son style à chaque vidéo. Un gabarit d'identité visuelle supprime ce travail sans figer le récit.
5. **Transcrire résout deux douleurs à la fois** : Whisper donne les mots (sous-titres) et les silences (coupes).
6. **Aucune influenceuse n'a encore été observée directement** : tout ce qui les concerne passe par Benjamin.

### Empathy Map Summary

| | Benjamin (démos d'apps) | Influenceuse (face caméra / lifestyle) |
|---|---|---|
| **Dit** | « Je veux 3 vidéos par semaine sans y penser. » « Claude doit pouvoir tout piloter. » | « C'est trop long de monter une vidéo. » |
| **Pense** | « Chaque vidéo devrait réutiliser la précédente. » « Je ne veux pas dépendre d'un outil propriétaire. » | « Je préférerais filmer plutôt que monter. » **(H)** |
| **Fait** | Capture, recadre et zoome à la main ; monte dans CapCut ; publie réseau par réseau. | Filme au téléphone, monte dans CapCut mobile ou l'éditeur intégré du réseau ; coupe, sous-titre, cherche une musique, habille. |
| **Ressent** | Frustration de la cadence qui décroche ; méfiance envers les licences. | Lassitude devant le temps de montage ; envie de publier plus souvent **(H)**. |
| **Gain attendu** | Un brouillon prêt depuis une phrase ou un parcours enregistré, à sa marque, publié ou programmé. | Un brouillon prêt depuis ses rushes, à son style, qu'elle n'a plus qu'à relire. |

### Approfondissement (élicitation avancée : 5 pourquoi + pré-mortem)

**Causes racines de « trop long »** — Benjamin les retient **toutes les quatre**, ce qui confirme que la réponse est un brouillon complet, pas une fonction isolée :

| Cause racine | Réponse produit |
|---|---|
| A. **Répétition** — le style se refait à chaque vidéo | Gabarit d'identité visuelle appliqué d'office |
| B. **Jugement** — choisir passages et musique coûte de l'énergie | Montage automatique qui propose des choix, l'humain arbitre |
| C. **Précision au doigt** — la timeline au téléphone est pénible | Pas de timeline sur mobile : relire et corriger un brouillon |
| D. **Volume** — le montage plafonne la fréquence de publication | Plusieurs vidéos tirées d'une même séance de tournage |

**Risques révélés par le pré-mortem** (« octobre 2027, personne n'utilise la bêta ») :

1. **Brouillon médiocre** → elles refont tout dans CapCut. La qualité du premier brouillon est le seuil d'adoption.
2. **Aucune porte d'entrée mobile pendant la bêta** → l'app native arrive plus tard, mais elles tournent et montent au téléphone. Risque direct pour la décision « app native plus tard ».
3. **Sons tendance des plateformes** → la portée sur TikTok et Reels dépend des sons en vogue, ajoutés dans l'app du réseau. **Décision (Benjamin) : au choix, vidéo par vidéo**, soit musique libre de droits intégrée, soit vidéo laissée sans musique et publiée en brouillon sur le réseau, ou exportée, pour y ajouter le son de la plateforme.
4. **Publication sur les comptes de tiers bloquée** → mode développement Meta limité aux testeurs, TikTok privé sans audit. Les agréments deviennent un prérequis de la bêta, pas une tâche de fin de V1.
5. Lenteur de bout en bout (envoi de rushes 4K en 4G, rendu serveur) ; arrivée trop tardive de la version influenceuses ; perte de rushes ou serveur indisponible.


### Approfondissement (2) : premiers principes, avocat du diable, rasoir d'Ockham

**Premiers principes.** Une vidéo verticale qui marche = accroche en 2 s, une seule idée, une coupe toutes les 2 à 3 s, des sous-titres (lecture sans le son), une fin aux couleurs de la marque. Il ne faut que trois entrées : **matière** (rushes ou capture), **intention** (le message), **identité** (le gabarit). Le produit est donc la fonction **matière + intention + gabarit → brouillon** ; la timeline n'est qu'un outil de correction. Ce qui vaut le plus, ce sont les **recettes de format** (démo d'app en 3 scènes, conseil face caméra, avant/après), pas l'éditeur.

**Avocat du diable.**

| Décision | Faille | Correction retenue |
|---|---|---|
| Benjamin d'abord | Outil de démo d'app inutile aux influenceuses (face caméra au téléphone) | Construire d'abord le noyau commun : coupe des silences, sous-titres, gabarit |
| Pas de PWA | Sans porte d'entrée mobile, la bêta échoue | Page web responsive d'envoi des rushes et de relecture (pas une PWA) |
| Éditeur complet | Contredit « ne plus monter » ; risque de refaire CapCut pendant des mois | Timeline repoussée en V2 |
| Voix Piper | Qualité en français incertaine ; les influenceuses parlent elles-mêmes | Voix de synthèse réservée aux démos de Benjamin |
| Publication en V1 | Comptes tiers bloqués par Meta et TikTok | Publication sur les comptes de Benjamin seulement ; export pour les autres |

**Rasoir d'Ockham — plus petit système qui fait adopter la bêta.** Envoi des rushes depuis le téléphone → coupe des silences + sous-titres + gabarit (+ musique au choix) → relecture → téléchargement. Pour Benjamin, la capture web par script alimente le même circuit.

**Découpage retenu (Benjamin) :**
- **V1** : circuit de traitement automatique + écran de relecture responsive + capture web par script + publication sur les comptes de Benjamin.
- **V2** : timeline complète, capture des simulateurs iOS et Android, publication pour des tiers une fois les agréments obtenus.


**Pensée au second ordre — ajouts retenus pour la V1 :**
- **File d'attente avec temps estimé et notification « brouillon prêt »** : le serveur (whisper + ffmpeg) est le goulot ; l'attente ne doit pas faire fuir.
- **Envoi reprenable (tus) et proxy basse définition** : des rushes 4K envoyés en 4G ne doivent pas faire échouer la première impression.
- Non retenus pour l'instant : purge RGPD automatique, corrections simples à la relecture, recettes paramétrables, modèle économique après la bêta.


**Steelmanning CapCut — contre quoi regie se bat :**

| Force de CapCut | Réponse de regie |
|---|---|
| Tout sur le téléphone, rendu local, aperçu instantané, hors ligne | Prix de regie : envoi et attente du serveur. Acceptable seulement si le brouillon arrive **terminé** |
| Modèles tendance appliqués en un geste | Modèles génériques partagés par tous ; regie applique **son** identité à **ses** rushes, avec choix des passages |
| Musique sous licence, sons tendance, export direct TikTok | Confirme la décision « son au choix » : sans musique → terminer dans l'app du réseau |
| Sous-titres automatiques animés | À égaler au minimum (whisper.cpp + styles du gabarit) |
| Habitude et maîtrise | Le plus dur à vaincre : la première vidéo doit être meilleure sans effort |
| Gratuit au départ, innovation continue | Failles : fonctions passées en Pro, conditions d'utilisation contestées en 2025, incertitude autour de ByteDance, aucune mémoire du style, une vidéo par session |

**Décisions (Benjamin) :**
- **Critère d'adoption de la V1** : 7 brouillons sur 10 publiables sans retouche.
- **Argument face à CapCut** : « Tu filmes, regie te rend 3 vidéos à ton style. »

---

## 🎨 DEFINE: Frame the Problem

### Point of View Statement

**Une créatrice ou un créateur de vidéos verticales** (démos d'apps comme Benjamin, face caméra et lifestyle comme les influenceuses de la bêta) **a besoin de publier plus souvent sans monter** : sa matière (rushes filmés au téléphone ou parcours d'app) doit devenir plusieurs vidéos à son style, simplement à relire. Le montage est répétitif, il oblige à faire sans cesse des choix et il est pénible au doigt, alors qu'aujourd'hui c'est lui qui limite le rythme de publication.

### How Might We Questions

Comment pourrions-nous…

1. obtenir un premier brouillon publiable sans retouche 7 fois sur 10 ?
2. capturer une seule fois le style d'une créatrice ou d'un créateur et l'appliquer partout ?
3. **tirer plusieurs vidéos d'une même séance de tournage ?** ⭐
4. **faire relire et corriger au téléphone sans timeline ?** ⭐
5. rendre l'attente du serveur acceptable, voire invisible ?
6. laisser la place aux sons tendance sans perdre le travail fait ?
7. **transformer un parcours d'app en démo sans capture manuelle ?** ⭐
8. faire arbitrer l'humain sans lui faire faire les choix ?

⭐ Priorités retenues par Benjamin pour l'étape IMAGINER (3, 4, 7).

### Key Insights

- Regie n'est pas un éditeur mais un **fabricant de brouillons** ; l'édition est l'exception.
- Le seuil d'adoption est **la qualité du premier brouillon**, pas le nombre de fonctions.
- **Noyau commun** aux deux profils : coupe des silences, sous-titres, gabarit.
- L'actif central : **le gabarit et les recettes de format**.
- Le téléphone est l'entrée et la sortie ; le serveur est le moteur.

---

## 💡 IDEATE: Generate Solutions

### Selected Methods

**Brainstorming** sur les trois priorités (3 : plusieurs vidéos par séance ; 4 : relecture mobile sans timeline ; 7 : parcours d'app vers démo). Quantité d'abord, jugement différé.

### Generated Ideas

**Q3 — plusieurs vidéos par séance :** 1. découpage par idée ✅ · 2. trois formats (15/45/90 s) · 3. une accroche, plusieurs suites · 4. repérage des meilleurs moments · 5. série 1/3, 2/3, 3/3 ✅ · 6. liste de plans avant tournage · 7. calendrier automatique · 8. bêtisier bonus.

**Q4 — relecture au téléphone :** 9. édition par le texte ✅ · 10. tri par glissement ✅ · 11. choix entre trois variantes ✅ · 12. corrections à la voix ✅ · 13. corrections en commentaires · 14. zones douteuses signalées ✅ · 15. lien de relecture sans compte · 16. bascule avant/après.

**Q7 — parcours d'app vers démo :** 17. une phrase à Claude ✅ · 18. enregistreur de clics ✅ · 19. zoom automatique sur chaque clic ✅ · 20. rejeu à chaque mise en production ✅ · 21. données de démo injectées · 22. voix off depuis le script · 23. plusieurs démos d'un parcours long · 24. démos depuis les tests E2E ✅.

✅ = retenu par Benjamin.

### Top Concepts

- **A. Une séance, une série** — découpage par idée, série numérotée, zones douteuses signalées.
- **B. Relire comme on lit** ⭐ — on fait défiler les brouillons et on les trie par glissement, on corrige par le texte ou la voix, on choisit entre trois variantes (accroche, musique, couverture), sans aucune timeline.
- **C. Démo vivante** — phrase à Claude, enregistreur de clics ou tests E2E → un seul script d'actions, rejoué à chaque mise en production, zoom sur les clics.

⭐ Concept retenu pour le prototype : **B**. A et C restent au programme de la V1 mais ne sont pas prototypés ici.

---

## 🛠️ PROTOTYPE: Make Ideas Tangible

### Prototype Approach

Concept prototypé : **B. Relire comme on lit**. Trois méthodes combinées :

- **Storyboard** du parcours de Léa, pour situer chaque écran dans le temps ;
- **Maquette mobile cliquable** (HTML, dans `maquette/`), ouvrable sur téléphone ;
- **Magicien d'Oz** : brouillons fabriqués à la main (ffmpeg + whisper) pour simuler le moteur.

Grossier et rapide à dessein : on cherche à apprendre si la relecture remplace le montage, pas à construire le produit.

### Prototype Description

**Storyboard (6 vignettes)**

1. **Tournage** — Léa filme 8 minutes de conseils skincare.
2. **Envoi** — depuis la page regie sur son téléphone ; la progression survit à une coupure de 4G ; « 3 brouillons prêts vers 18 h 40 ».
3. **Notification** — « Tes 3 vidéos sont prêtes 🎬 ».
4. **Fil de relecture** — brouillons en plein écran façon TikTok ; glisser à droite pour garder, à gauche pour jeter.
5. **Correction** — « Texte » : barrer une phrase recoupe la vidéo ; « Accroche », « Musique » (dont « sans musique, je mets un son TikTok »), « Couverture » : trois variantes au choix.
6. **Sortie** — téléchargement ou envoi en brouillon sur le réseau, puis vidéo suivante.

**Vrai / simulé**

| Élément | Statut |
|---|---|
| Écran mobile, gestes, navigation | Réel, cliquable |
| Vidéos | Clips face caméra libres de droits (Pexels ou Pixabay), licence vérifiée |
| Recoupes après édition du texte, variantes | Précalculées |
| Envoi, file d'attente, notification | Simulés |

### Features to Test

- **Fil + glissement** : garder, jeter, publier.
- **Édition par le texte** : barrer une phrase coupe le passage.
- **Trois variantes** : accroche, musique (ou « sans musique »), couverture.
- Écartés du prototype : zones douteuses, corrections à la voix.

**Hypothèses à valider**

- **H1** — On accepte d'attendre un brouillon plutôt que de monter tout de suite.
- **H2** — Glissement + édition par le texte suffisent sans timeline, 7 fois sur 10.
- **H3** — Trois variantes aident à décider au lieu de ralentir.
- **H4** — Un brouillon automatique soutient la comparaison avec CapCut.

---

## ✅ TEST: Validate with Users

### Testing Plan

- **Vague 1 — Benjamin seul** : corriger les défauts grossiers de la maquette.
- **Vague 2 — 4 à 6 personnes** (Fanny + influenceuses de l'entourage) : séance de 15 min sur leur téléphone, observation silencieuse.
- **Tâches données sans aide** : « Garde les vidéos que tu publierais » · « Enlève la phrase où tu hésites » · « Choisis une accroche » · « Sors la vidéo pour TikTok ».
- **Mesures** : temps jusqu'à une vidéo publiable, nombre de blocages, moments où elle cherche une timeline, réponse à « Tu la publierais telle quelle ? ».
- **Questions de fin** : « Qu'est-ce qui t'a manqué ? » · « Tu l'aurais fait plus vite dans CapCut ? » · « Tu l'utiliserais la semaine prochaine ? ».
- **Recueil** : mesures enregistrées par la maquette elle-même (gestes, temps), en local, sans service tiers.
- **Décision (Benjamin)** : pas de seuil go/no-go. La V1 se construit de toute façon ; le test sert à orienter.

### User Feedback

_À remplir après les séances (vague 1 puis vague 2)._

### Key Learnings

_À remplir après les séances : hypothèses H1 à H4 validées ou invalidées, ce qui change, ce qui reste._

---

## 🚀 Next Steps

### Refinements Needed

- La maquette enregistre elle-même gestes et temps (seule source de mesure retenue).
- Les clips libres de droits doivent ressembler à de vrais rushes face caméra (hésitations, silences), sinon H2 n'est pas testée.
- Purge RGPD des rushes de tiers : écartée du design thinking, à reprendre dans le PRD.

### Action Items

Séquence retenue par Benjamin : **cadrer d'abord**.

1. **Révision du PRD** (lot 8, `bmad-prd`) à partir de ce design thinking.
2. **Architecture** (lot 9, `bmad-architecture`) : circuit de traitement, file d'attente et notifications, envoi reprenable, script d'actions.
3. **Maquette mobile « Relire »** (lot 10 recentré) dans `maquette/public/` : clips libres de droits, recoupes précalculées, mesures locales.
4. **Test vague 1** par Benjamin sur son téléphone.
5. **Magicien d'Oz** puis **vague 2** (Fanny + influenceuses).
6. **Démarches Meta et TikTok** lancées tôt (délais d'audit).

### Success Metrics

- **Qualité** : 7 brouillons sur 10 publiables sans retouche.
- **Vitesse** : moins de 2 min de relecture par vidéo publiée.
- **Adoption de la bêta** : Benjamin et au moins 2 autres personnes publient via regie chaque semaine pendant 4 semaines d'affilée, sans repasser par CapCut.

---

_Generated using BMAD Creative Intelligence Suite - Design Thinking Workflow_
