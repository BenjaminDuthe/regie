---
title: Réconciliation du design thinking avec le PRD regie
created: 2026-10-02
source: docs/planning/design-thinking-2026-10-02.md
cible: docs/planning/prds/prd-regie-2026-10-02/prd.md
---

# Réconciliation du design thinking avec le PRD regie

## Cadre

On a cherché ce que le design thinking contient et que le PRD perd ou contredit. Sont exclus les points écartés ou reportés en V2 : timeline, simulateurs, publication pour des tiers, PWA, second facteur, modèle économique décidé après la bêta, purge RGPD poussée.

Ce qui est déjà bien repris n'est pas listé : plusieurs brouillons par séance et série numérotée (FR-20), coupe des silences (FR-21), sous-titres (FR-22), accroche en 2 s (FR-23), « son au choix » vidéo par vidéo (FR-24, FR-37), envoi reprenable (FR-10), temps estimé et notification (FR-12, FR-32), fil + glissement + édition par le texte + trois variantes (FR-34 à FR-37), capture par script d'actions sous ses trois origines, avec rejeu et zoom (FR-14 à FR-19, FR-26), voix de synthèse limitée aux démos (FR-27), SM-1 à SM-3.

**21 manques** : 6 de gravité haute, 11 moyenne, 4 basse.

---

## Gravité haute

### M1. La promesse « Tu filmes, regie te rend 3 vidéos à ton style » a disparu

- **Source** : « Argument face à CapCut : "Tu filmes, regie te rend 3 vidéos à ton style." » (Décisions de Benjamin, après le steelmanning). Gain attendu côté influenceuse : « un brouillon prêt depuis ses rushes, à son style, qu'elle n'a plus qu'à relire ».
- **Manque dans le PRD** : la vision (§1) dit « le studio de vidéos verticales libre qui monte à ta place ». C'est juste, mais ce n'est pas l'argument que Benjamin a décidé. Le PRD ne garde ni la formule, ni le tutoiement, ni la notion de « à ton style » comme promesse.
- **Correction** : §1 Vision. Ajouter la promesse mot pour mot, sous la phrase d'ouverture ou à sa place, comme argument de positionnement face à CapCut et comme critère de relecture des parcours UJ-1 et UJ-3.

### M2. Hypothèses H1 à H4 et hypothèses sur les influenceuses absentes de l'index

- **Source** : H1 (on accepte d'attendre un brouillon plutôt que de monter tout de suite), H2 (glissement + édition par le texte suffisent sans timeline, 7 fois sur 10), H3 (trois variantes aident à décider au lieu de ralentir), H4 (un brouillon automatique soutient la comparaison avec CapCut). Points marqués **(H)** : elles utilisent l'interface et pas Claude ; le prix et la licence ne les motivent pas, le gain de temps si ; elles préféreraient filmer plutôt que monter ; « aucune influenceuse n'a encore été observée directement ».
- **Manque dans le PRD** : §10 ne liste que NFR-2. Une bonne partie du PRD repose pourtant sur ces paris (file d'attente plutôt qu'aperçu instantané, absence de timeline, trois variantes, interface sans Claude pour les influenceuses), mais rien ne les signale comme non vérifiés.
- **Correction** : §10 Index des hypothèses. Ajouter H1 à H4 en les reliant à FR-12/FR-31 (H1), FR-35/FR-36 et SM-1 (H2), FR-23 à FR-25 et FR-37 (H3), SM-1 et SM-3 (H4). Ajouter aussi les trois hypothèses (H) sur les influenceuses, liées à §2 et UJ-1. Chacune doit être « à confirmer par » les tests de la vague 1 et de la vague 2. Préciser en §2 que les besoins des influenceuses viennent de Benjamin et n'ont pas encore été observés.

### M3. Les recettes de format n'ont aucune exigence fonctionnelle

- **Source** : « Ce qui vaut le plus, ce sont les recettes de format (démo d'app en 3 scènes, conseil face caméra, avant/après), pas l'éditeur. » Key insight : « L'actif central : le gabarit et les recettes de format. » (Les « recettes paramétrables » sont écartées, mais pas les recettes elles-mêmes.)
- **Manque dans le PRD** : « Recette » existe dans le glossaire, la description du §4.5 et FR-30, mais aucune FR ne dit quelles recettes la V1 fournit, qui en choisit une (l'utilisateur ou regie à partir de l'intention), ni ce qu'une recette impose (nombre de scènes, durée, structure). Le gabarit a trois FR, alors que l'actif présenté comme son égal n'en a aucune.
- **Correction** : §4.5. Ajouter une FR « Recettes » : la V1 livre au moins trois recettes fixes (démo d'app en 3 temps, conseil face caméra, avant/après). regie choisit la recette d'après l'intention et la matière, l'utilisateur peut en imposer une à l'envoi (FR-9) ou au « refaire » (FR-29), et la recette utilisée s'affiche dans le fil. Les recettes paramétrables restent hors V1, à ajouter au §6.

### M4. Le contenu lifestyle et produits, sans parole, est contredit par le PRD

- **Source** : les influenceuses font du contenu « lifestyle / produits (plans montés en rythme sur une musique, textes à l'écran) ». Elles citent comme trop longues toutes les étapes, dont « rythme et musique, textes et habillage ».
- **Manque ou contradiction dans le PRD** : le montage automatique (§4.5) repose entièrement sur la transcription (découpage par idée, coupe des silences, sous-titres, édition par le texte). Pire, FR-11 signale comme anomalie un rush « sans voix audible », ce qui est le cas normal d'un plan produit. Rien ne dit comment regie choisit, ordonne et cale sur une musique des plans muets. Le parcours UJ-1 ne couvre que le face caméra.
- **Correction** : §4.3 FR-11. Le contrôle de la voix ne s'applique qu'aux recettes parlées. Un rush muet est accepté pour une recette de type lifestyle. §4.5 : ajouter une FR « Montage sur musique » qui choisit les meilleurs plans, coupe au rythme du morceau et ajoute des textes à l'écran tirés de l'intention. §2.3 : ajouter un cas limite à UJ-1, ou un court UJ-4 lifestyle. Si ce profil est volontairement repoussé, l'écrire au §6 et l'ajouter à l'index des hypothèses, puisque c'est la moitié du public bêta.

### M5. La qualité du premier brouillon comme seuil d'adoption n'est pas posée en principe

- **Source** : « Le seuil d'adoption est la qualité du premier brouillon, pas le nombre de fonctions. » Steelmanning : le prix de regie (envoi et attente) n'est « acceptable seulement si le brouillon arrive terminé » ; « la première vidéo doit être meilleure sans effort ». Key insight : « regie n'est pas un éditeur mais un fabricant de brouillons ; l'édition est l'exception. » Pré-mortem n° 1 : brouillon médiocre, donc retour dans CapCut.
- **Manque dans le PRD** : SM-1 chiffre le 7 sur 10, mais rien n'en fait une règle d'arbitrage. Rien ne dit qu'en cas de conflit, la qualité du brouillon passe avant l'ajout de fonctions (le §7.2 fait glisser TikTok, pas une fonction de relecture). L'idée « l'édition est l'exception » n'apparaît pas non plus.
- **Correction** : §1 ou nouvelle section « Principes produit ». (1) regie fabrique des brouillons, l'édition est l'exception. (2) La qualité du premier brouillon prime sur l'étendue des fonctions. (3) La première vidéo doit être meilleure que CapCut, sans effort. Reprendre ensuite ce principe au §7.2 comme règle d'arbitrage du périmètre.

### M6. Ordre de construction : le noyau commun d'abord

- **Source** : avocat du diable, sur « Benjamin d'abord » : « Construire d'abord le noyau commun : coupe des silences, sous-titres, gabarit. » Rasoir d'Ockham : « Envoi des rushes depuis le téléphone → coupe des silences + sous-titres + gabarit (+ musique au choix) → relecture → téléchargement. » Pré-mortem : « arrivée trop tardive de la version influenceuses ».
- **Manque dans le PRD** : le §7.1 met tout le périmètre à plat, sans ordre. Le §7.2 ne prévoit de glissement que pour TikTok. Rien n'empêche donc de construire d'abord la capture par script d'actions (§4.4), espaces partagés et validation compris, et de retarder le circuit qui sert aux influenceuses.
- **Correction** : §7. Ajouter une sous-section « Ordre de livraison » : (1) le circuit minimal du rasoir d'Ockham, de l'envoi au téléchargement, (2) la capture par script d'actions, (3) la publication sur les comptes de Benjamin, (4) la validation et les espaces partagés. Le §7.2 doit dire que le circuit minimal ne glisse jamais.

---

## Gravité moyenne

### M7. Zones douteuses signalées (idée 14, concept A)

- **Source** : idée 14 « zones douteuses signalées ✅ ». Concept A : « découpage par idée, série numérotée, zones douteuses signalées ». Elle n'est écartée que du prototype, pas de la V1 (« A et C restent au programme de la V1 »).
- **Manque dans le PRD** : FR-22 ne signale que les mots peu sûrs de la transcription. Les passages dont le découpage ou la coupe est incertain (frontière d'idée, coupe d'une phrase qui pourrait être voulue) ne sont pas signalés.
- **Correction** : §4.5 FR-20 et FR-21, §4.7 FR-36. regie signale dans le fil les coupes et les frontières d'idée dont il est peu sûr, et les propose en premier à la relecture, comme les mots douteux.

### M8. Corrections à la voix (idée 12, concept B)

- **Source** : idée 12 « corrections à la voix ✅ ». Concept B retenu : « on corrige par le texte ou la voix ». Elle n'est écartée que du prototype.
- **Manque dans le PRD** : rien sur une correction dictée (« coupe la deuxième phrase », « raccourcis l'intro »).
- **Correction** : §4.7. Ajouter une FR « Corriger à la voix » : une consigne dictée, transcrite sur le serveur, appliquée au brouillon comme une correction par le texte. Si Benjamin la repousse, l'inscrire explicitement au §6, puisqu'elle fait partie du concept retenu.

### M9. Envoi en brouillon sur le réseau pour y poser un son tendance

- **Source** : décision sur les sons tendance : vidéo « laissée sans musique et publiée en brouillon sur le réseau, ou exportée, pour y ajouter le son de la plateforme ». Storyboard, étape 6 : « téléchargement ou envoi en brouillon sur le réseau ».
- **Manque dans le PRD** : FR-42 ne connaît que « publier maintenant » et « programmer ». Rien ne permet d'envoyer la vidéo comme brouillon dans l'app du réseau, pour l'y finir avec un son tendance. FR-24 renvoie à l'app du réseau sans moyen d'y aller autrement que par l'export.
- **Correction** : §4.9 FR-42. Ajouter un troisième mode, « envoyer en brouillon sur le réseau », sur les comptes connectés là où le réseau le permet (sinon, export). Le statut final est « envoyée en brouillon », distinct de « publiée ».

### M10. Proxy basse définition pour les rushes 4K

- **Source** : ajouts retenus pour la V1 : « Envoi reprenable (tus) et proxy basse définition : des rushes 4K envoyés en 4G ne doivent pas faire échouer la première impression. » Pré-mortem : « envoi de rushes 4K en 4G ».
- **Manque dans le PRD** : FR-10 couvre la reprise, pas le volume. Aucune exigence ne permet de lancer le traitement, ou au moins la relecture, avant d'avoir reçu les 4K.
- **Correction** : §4.3. Ajouter une FR, ou un critère à FR-9 et FR-10, sans nommer de technologie : le traitement peut démarrer sur une version allégée du rush, et le rendu final utilise l'original une fois reçu. Ajouter un NFR chiffré au §5.1, par exemple « brouillons disponibles pour 10 min de 4K envoyées en 4G en moins de X ».

### M11. Ton et voix du produit

- **Source** : notification « Tes 3 vidéos sont prêtes 🎬 », formules du storyboard (« 3 brouillons prêts vers 18 h 40 », « sans musique, je mets un son TikTok »), promesse au tutoiement « à ton style ». Ressenti cible : lassitude devant le montage, envie de publier plus souvent.
- **Manque dans le PRD** : aucune règle de ton (tutoiement, phrases courtes, chaleureux, sans jargon de montage). FR-32 parle de « prévenir » sans dire comment, et les messages d'erreur (FR-48) ont une forme technique, pas un ton.
- **Correction** : nouvelle sous-section du §5, ou annexe « Ton et vocabulaire de l'interface » : tutoiement, vocabulaire de créatrice et non de monteur, notifications au format « Tes N vidéos sont prêtes », heure annoncée en clair. Reprendre ces exemples comme critères de FR-12 et FR-32.

### M12. SM-3 perd « à la place de CapCut »

- **Source** : succès à six mois : « les influenceuses l'utilisent chaque semaine à la place de CapCut ». Success Metrics : « sans repasser par CapCut ».
- **Manque dans le PRD** : SM-3 compte les vidéos prêtes ou publiées. Il ne mesure ni le remplacement de CapCut, ni la présence d'influenceuses parmi les « 2 autres personnes ».
- **Correction** : §8 SM-3. Ajouter « sans repasser par CapCut » (mesure déclarative hebdomadaire ou question de fin de semaine) et préciser qu'au moins une des deux personnes est une influenceuse de la bêta.

### M13. Mesures de la relecture et recueil local

- **Source** : mesures du test : « temps jusqu'à une vidéo publiable, nombre de blocages, moments où elle cherche une timeline, réponse à "Tu la publierais telle quelle ?" ». Recueil : « en local, sans service tiers ». Questions de fin : « Tu l'utiliserais la semaine prochaine ? »
- **Manque dans le PRD** : SM-1 et SM-2 supposent un recueil de mesures d'usage, mais aucune FR ou NFR ne le prévoit, ni n'impose qu'il reste sur le serveur. Le contre-indicateur « cherche une timeline » n'existe pas.
- **Correction** : §5.5. Ajouter un NFR : les mesures d'usage (gestes, temps de relecture, corrections, refaire) sont enregistrées sur le serveur de regie, sans service d'analyse tiers. §8 : ajouter le contre-indicateur « recherche d'une timeline ou abandon dans le fil » et la question « publiable telle quelle ? » comme mesure qualitative de SM-1.

### M14. Pas de section risques, et les agréments comme prérequis de la bêta

- **Source** : pré-mortem en cinq risques (brouillon médiocre, aucune porte d'entrée mobile, sons tendance, publication pour tiers bloquée, lenteur ou perte de rushes). « Les agréments deviennent un prérequis de la bêta, pas une tâche de fin de V1. » Action 6 : « Démarches Meta et TikTok lancées tôt (délais d'audit). »
- **Manque dans le PRD** : aucune section de risques. Les agréments ne sont qu'une question ouverte (§9 Q5), rattachée à la V2, alors que la source demande de lancer les démarches dès maintenant.
- **Correction** : ajouter un §« Risques » qui reprend les cinq risques du pré-mortem, avec leur parade dans le PRD (M5, FR-9, FR-24/M9, FR-41, FR-10/M10/NFR-7/NFR-13). §9 Q5 : préciser « démarches à lancer dès le début de la V1, sans attendre la V2 ».

### M15. Premier gabarit sans effort

- **Source** : HMW 2 « capturer une seule fois le style… et l'appliquer partout ». Steelmanning : « la première vidéo doit être meilleure sans effort ». Douleur : « refaire son style à chaque vidéo ».
- **Manque dans le PRD** : UJ-1 suppose que le gabarit « est déjà réglé ». FR-6 en fait un formulaire complet (logo, 2 à 4 couleurs, polices, style, carte de fin, légende). Le PRD ne dit pas comment une influenceuse obtient sa première vidéo à son style sans passer d'abord par ce réglage.
- **Correction** : §4.2. Ajouter une FR « Premier gabarit » : un gabarit par défaut utilisable tout de suite, réglable en quelques choix (couleur, police, style de sous-titres) depuis le téléphone, puis complété plus tard. Ajouter l'entrée correspondante à UJ-1.

### M16. Rythme : une coupe toutes les 2 à 3 s

- **Source** : premiers principes : « accroche en 2 s, une seule idée, une coupe toutes les 2 à 3 s, des sous-titres (lecture sans le son), une fin aux couleurs de la marque ».
- **Manque dans le PRD** : tout y est sauf le rythme des coupes. Aucune FR ni garde ne fixe un écart maximal entre deux changements de plan, alors que c'est un critère de « brouillon publiable ».
- **Correction** : §4.5. Ajouter un critère de rythme (changement de plan, zoom ou texte au plus toutes les 3 s environ, selon la recette) à FR-21 ou à la FR « Recettes » de M3. Le vérifier à la reproductibilité (NFR-12) ou par un test de recette.

### M17. Textes à l'écran et habillage

- **Source** : contenu lifestyle avec « textes à l'écran ». Étape « textes et habillage » citée comme trop longue.
- **Manque dans le PRD** : à part les sous-titres, l'accroche et la carte de fin, aucune FR ne crée de textes à l'écran (titres de conseil, prix produit, « étape 2 ») ni ne permet de les corriger au fil de relecture.
- **Correction** : §4.5. Ajouter une FR « Textes à l'écran » : regie pose des intertitres tirés de l'intention ou de la transcription, au style du gabarit, sous contrôle des gardes. §4.7 FR-36 : ils se corrigent comme le texte.

---

## Gravité basse

### M18. Fanny : marque ou personne ?

- **Source** : « Benjamin, fondateur, pour trois marques : Établia, MGA, Fanny. » Ailleurs, Fanny est aussi une testeuse (« Vague 2 — Fanny + influenceuses »).
- **Contradiction dans le PRD** : UJ-3 présente Fanny comme une personne qui « porte les marques MGA et Établia ». La marque Fanny disparaît, et Fanny devient porteuse d'Établia, ce que la source ne dit pas.
- **Correction** : §2.3 UJ-3. Vérifier auprès de Benjamin, puis corriger : Fanny est une marque, et sans doute la personne qui l'incarne, avec un espace de marque Fanny. Les trois espaces de Benjamin sont Établia, MGA et Fanny.

### M19. Douleurs « trop d'outils » et « propriété des contenus »

- **Source** : douleur 3 « Trop d'outils : capture, montage, sous-titres, publication ». Douleur 4 : conditions d'utilisation de CapCut « problématiques » sur la propriété des contenus. Défi : « dans un seul outil libre et gratuit ».
- **Manque dans le PRD** : la vision parle de liberté (AGPL, IA sur le serveur), mais ne dit ni « un seul outil de la capture à la publication », ni « tes rushes et tes vidéos restent à toi ». FR-51 (pages légales) ne prévoit aucune clause de propriété.
- **Correction** : §1 Vision, une phrase sur le circuit complet dans un seul outil. §4.12 FR-51 : les conditions d'utilisation affirment que l'utilisateur garde la propriété de ses contenus et que regie n'en fait aucun autre usage.

### M20. Sous-titres au niveau de CapCut au minimum

- **Source** : steelmanning : « Sous-titres automatiques animés : à égaler au minimum (whisper.cpp + styles du gabarit). »
- **Manque dans le PRD** : FR-22 dit « animés au style du gabarit », sans barre de qualité de référence.
- **Correction** : §4.5 FR-22. Ajouter comme critère un taux d'erreur de mots maximal sur un jeu de rushes français de référence, et une parité de styles d'animation de base (mot surligné, apparition par mot).

### M21. Enchaîner relecture, sortie et vidéo suivante

- **Source** : fonctions testées : « Fil + glissement : garder, jeter, publier ». Storyboard étape 6 : « téléchargement ou envoi en brouillon sur le réseau, puis vidéo suivante ». Tâche de test : « Sors la vidéo pour TikTok ».
- **Manque dans le PRD** : l'export et la publication (§4.9) sont décrits à part du fil (§4.7). Aucune FR ne dit que la sortie se fait depuis le fil, en un geste, avec retour automatique au brouillon suivant (UJ-1 le raconte, mais aucune FR ne le porte).
- **Correction** : §4.7. Ajouter un critère à FR-35, ou une FR « Sortir depuis le fil » : depuis un brouillon gardé (et prêt), l'utilisateur exporte ou publie sans quitter le fil, puis le fil passe au brouillon suivant.

---

## Ajouts du PRD absents de la source (pour information, non comptés)

Ces éléments ne sont pas des pertes, mais ils élargissent le périmètre au-delà du design thinking. Benjamin doit les confirmer, car ils pèsent sur le risque n° 5 du pré-mortem (« version influenceuses trop tardive ») :

- **YouTube Shorts** (FR-41, glossaire). La source ne cite qu'Instagram, Facebook Page et TikTok.
- **Inscription ouverte dès la V1** (FR-1). La source décrit une bêta pour l'entourage.
- **Espaces de marque partagés, validation et circuit d'approbation** (FR-3, FR-4, FR-39, UJ-3). Absents de la source.
- **Quotas par compte** (FR-1). Absents de la source.
