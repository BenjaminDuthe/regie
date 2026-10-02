---
title: Réconciliation de l'ancien PRD regie avec la réorientation du 2026-10-02
created: 2026-10-02
sources:
  - docs/planning/prd.md (ancien PRD, 2026-09-05, 49 FR, 37 NFR)
  - docs/planning/prd-validation-report.md (statut Critical, note 4/5)
  - MANDAT.md, section « Réorientation du 2026-10-02 » et sous-sections
  - docs/planning/design-thinking-2026-10-02.md
cible: docs/planning/prds/prd-regie-2026-10-02/prd.md
---

# Réconciliation de l'ancien PRD regie

## Sommaire

1. Cadre de lecture
2. Exigences fonctionnelles (FR1 à FR49)
3. Exigences non fonctionnelles (NFR1 à NFR37)
4. Décomptes
5. Défauts du rapport de validation à ne pas reproduire
6. Contraintes du mandat toujours valables
7. Exclusions de l'ancien PRD levées par la réorientation
8. Contradictions entre sources à trancher
9. Glossaire de l'ancien PRD encore utile

## 1. Cadre de lecture

**Produit cible.** regie devient un studio de vidéos verticales libre et gratuit, multi-utilisateurs : un **fabricant de brouillons automatiques** (coupe des silences, sous-titres, rythme et musique au choix, habillage par gabarit) que l'on **relit et corrige au téléphone**, sans timeline. Utilisateurs : Benjamin (Établia, MGA, Fanny), qui pilote par MCP, puis une bêta gratuite d'influenceuses (face caméra, lifestyle), qui passent par l'interface. Hébergement sur le serveur de Benjamin. Capture web **par script d'actions**. API privée et MCP sur une couche de services commune. IA locale uniquement. Publication V1 **sur les comptes du propriétaire seulement** (Instagram, Facebook Page, TikTok) ; export ou téléchargement pour les autres.

**Découpage retenu (design thinking).** V1 : circuit de traitement automatique, écran de relecture responsive, capture web par script, publication sur les comptes de Benjamin. V2 : timeline complète, capture des simulateurs iOS et Android, publication pour des tiers après agréments.

**Conventions de classement.**

- **REPRENDRE tel quel** : l'exigence garde son sens et son périmètre. Deux changements s'appliquent partout sans être comptés comme adaptation : « le fondateur » devient « le propriétaire » (ou « l'utilisateur » quand l'action est ouverte aux comptes de la bêta), et les corrections rédactionnelles du § 5 (sujet explicite, ligne « Vérification », pas de nom de technologie).
- **REPRENDRE ADAPTÉ** : l'intention reste, le contenu change ; la colonne dit comment.
- **ABANDONNER** : l'exigence n'a plus de place dans le produit ; la colonne dit pourquoi.

## 2. Exigences fonctionnelles

### 2.1 Scénarios et capture (FR1 à FR6)

| ID | Résumé d'origine | Groupe | Comment / pourquoi |
|---|---|---|---|
| FR1 | Créer un scénario depuis une liste ordonnée d'URL, texte par défaut par page | ADAPTÉ | Le scénario devient un **script d'actions** (aller à, cliquer, saisir, attendre, faire défiler) enregistré à la main par Benjamin ou écrit par Claude, joué et **enregistré en vidéo** par un navigateur piloté, pour n'importe quelle application web déclarée, plus seulement Établia. Le journal des clics alimente l'auto-zoom. |
| FR2 | Lister, lire, modifier un scénario (ajouter, retirer, réordonner) | ADAPTÉ | Porte sur les étapes du script d'actions ; ajout du **rejeu** d'un script existant (après une mise en production de l'app) sans le réécrire. |
| FR3 | Liste des hôtes autorisés à la capture, refus hors liste (UI et MCP) | ADAPTÉ | Liste rattachée à chaque application à capturer et à son propriétaire, non plus globale ; refus identique par l'interface, le MCP et l'API privée. |
| FR4 | Identifiants du seul compte de démo, connexion automatique à chaque capture | ADAPTÉ | Un jeu d'identifiants de démo **par application capturée** (Établia, MGA…), au coffre ; condition explicite « compte sans second facteur » (point SMART du rapport). |
| FR5 | Tester la connexion enregistrée : page d'accueil capturée ou étape fautive | TEL QUEL | Appliqué par application capturée. |
| FR6 | Média de substitution pour une page non capturable | ADAPTÉ | Généralisé en **import de rushes** (vidéos filmées au téléphone, fichiers existants), source principale des influenceuses ; envoi reprenable et proxy basse définition. Règle aussi le défaut de traçabilité du rapport (FR6 sans parcours). |

### 2.2 Génération et éditeur (FR7 à FR14)

| ID | Résumé d'origine | Groupe | Comment / pourquoi |
|---|---|---|---|
| FR7 | Lancer une génération, identifiant et état suivis (en cours, prête, refusée, échec) | ADAPTÉ | Entrées : **matière** (rushes ou capture) + **intention** + **gabarit** → plusieurs brouillons (découpage par idée, série 1/3…). File multi-utilisateurs avec position, **temps estimé** et notification « brouillon prêt ». |
| FR8 | Vidéo verticale **muette** appliquant les règles d'Établia (accroche, zone sûre, lisibilité) | ADAPTÉ | Devient le **brouillon automatique** : coupe des silences et hésitations, sous-titres par transcription locale, rythme, musique libre de droits **ou** aucune musique (choix vidéo par vidéo), carte de fin du gabarit, accroche en 2 s. Le son de la personne filmée est conservé ; voix de synthèse locale réservée aux démos de Benjamin. Les règles viennent du gabarit, plus d'Établia seule. |
| FR9 | Lire les scènes d'une vidéo (page, texte, animation) | ADAPTÉ | Lire la structure d'un brouillon : segments retenus (source, début, fin), transcription, textes à l'écran, musique, couverture. |
| FR10 | Modifier texte et animation de chaque scène, prévisualiser | ADAPTÉ | Correction **sans timeline** : édition par le texte (barrer une phrase recoupe la vidéo), choix entre trois variantes (accroche, musique ou « sans musique », couverture), garder ou jeter par glissement. L'édition fine par scène et par animation passe en V2 avec la timeline. |
| FR11 | Regénérer après modification | TEL QUEL | S'applique aux corrections de relecture. |
| FR12 | Gardes bloquantes de lisibilité et de zone sûre, jamais forçables | TEL QUEL | Couvre désormais sous-titres et textes du gabarit. Les seuils doivent être nommés et localisés (défaut SMART FR8/FR12). |
| FR13 | Refus de garde : scène, mesure, seuil ; éditeur ouvert sur la scène | ADAPTÉ | Désigne le segment et son code temporel ; ouvre l'**écran de relecture** sur ce segment (pas d'éditeur en V1). Les « zones douteuses signalées » du design thinking s'y rattachent. |
| FR14 | Durée de chaque génération enregistrée et visible | ADAPTÉ | S'y ajoute le **temps estimé** avant le brouillon, affiché dès l'envoi (« 3 brouillons prêts vers 18 h 40 »). |

### 2.3 Librairie (FR15 à FR18)

| ID | Résumé d'origine | Groupe | Comment / pourquoi |
|---|---|---|---|
| FR15 | Librairie filtrable par statut (brouillon, prête, refusée, programmée, publiée, échec) | ADAPTÉ | Librairie **par utilisateur et par marque** ; s'y ajoute le **fil de relecture** plein écran. Statuts revus : ajouter « à relire », « gardé », « jeté » ; renommer l'ancien statut « brouillon » (collision avec « brouillon automatique », voir § 9). |
| FR16 | Légende et au plus 5 hashtags en français, valeurs par défaut des publications | ADAPTÉ | Valeurs par défaut portées par le **gabarit** de la marque ; le plafond de hashtags vient des bornes du réseau, la langue n'est plus imposée. |
| FR17 | Contrôle des bornes de chaque réseau à l'entrée en librairie | TEL QUEL | — |
| FR18 | Supprimer une vidéo jamais publiée, archiver les autres, tracé dans l'audit | ADAPTÉ | Étendu aux **rushes** et aux brouillons ; ajout de la suppression des données d'un utilisateur de la bêta à sa demande (RGPD, purge des rushes de tiers relevée au design thinking). |

### 2.4 Publication et programmation (FR19 à FR29)

| ID | Résumé d'origine | Groupe | Comment / pourquoi |
|---|---|---|---|
| FR19 | Créer une publication depuis une vidéo prête vers un réseau connecté | ADAPTÉ | Seulement vers les **comptes du propriétaire** (une marque = un jeu de comptes) ; pour les autres utilisateurs, la sortie est le **téléchargement** ou l'export. |
| FR20 | Vérifier chaque publication contre les bornes du réseau visé | TEL QUEL | — |
| FR21 | Publier maintenant ou programmer en heure de Paris | TEL QUEL | La publication reste réservée au propriétaire, en France. |
| FR22 | Exécution seule des publications programmées, y compris après redémarrage | TEL QUEL | — |
| FR23 | Jamais deux envois de la même publication | TEL QUEL | — |
| FR24 | Lire le quota du réseau avant de programmer ou publier | TEL QUEL | — |
| FR25 | Publiée avec identifiant, ou échec avec cause, sans nouvelle tentative automatique | TEL QUEL | Donner regie pour sujet (défaut de forme du rapport). |
| FR26 | Rejouer une publication en échec, historique conservé | TEL QUEL | — |
| FR27 | Lister les publications par statut, réseau, période | TEL QUEL | Filtre « marque » ajouté naturellement par FR31. |
| FR28 | Annuler ou déplacer une publication programmée non partie | TEL QUEL | — |
| FR29 | (fin V1) TikTok : niveau de confidentialité et contenu commercial | ADAPTÉ | Passe en V1 ; s'y ajoute l'**envoi en brouillon sur le réseau** (ou l'export) pour terminer avec un son tendance de la plateforme. |

### 2.5 Réseaux et comptes (FR30 à FR36)

| ID | Résumé d'origine | Groupe | Comment / pourquoi |
|---|---|---|---|
| FR30 | Saisir les clés d'application de chaque réseau, jamais réaffichées | TEL QUEL | Action d'administration du propriétaire, interface seulement. |
| FR31 | Un compte par réseau, connexion OAuth par l'interface, remplace le précédent | ADAPTÉ | **Plusieurs comptes par réseau**, un par marque (Établia, MGA, Fanny), tous au propriétaire ; aucun compte d'un tiers en V1. OAuth toujours par l'interface seulement. |
| FR32 | Voir le compte et l'échéance du jeton, être prévenu, reconnecter | TEL QUEL | Par compte connecté ; donner un délai de prévenance proposé (défaut SMART). |
| FR33 | Publier des Reels Instagram | TEL QUEL | — |
| FR34 | (fin V1) Publier sur la Page Facebook, même application Meta | TEL QUEL | — |
| FR35 | (fin V1) Publier sur TikTok, en privé tant que non audité | ADAPTÉ | En V1 ; les démarches d'agrément Meta et TikTok sont lancées **tôt** (prérequis de la publication pour tiers en V2), plus en fin de V1. |
| FR36 | (fin V1) Clé et connexion LinkedIn, sans publication avant agrément | ABANDONNER | LinkedIn ne figure plus dans le périmètre réorienté (Instagram, Facebook Page, TikTok) ; un connecteur qui ne publie pas n'apporte rien à un studio de vidéos verticales pour influenceuses. |

### 2.6 Pilotage par MCP (FR37 à FR42)

| ID | Résumé d'origine | Groupe | Comment / pourquoi |
|---|---|---|---|
| FR37 | Jeton MCP affiché une fois, révocable ; aucune requête sans jeton | ADAPTÉ | Jetons **par utilisateur**, qui ne donnent accès qu'à ses données ; même mécanisme pour l'API privée. |
| FR38 | Toute action métier faisable par MCP avec le même résultat que l'interface | ADAPTÉ | Parité à **trois** : interface, MCP, API privée, sur les domaines réorganisés (capture et scripts, rushes, brouillons, gabarits, publications, audit). |
| FR39 | Aucun outil MCP ne lit ni n'écrit un secret | TEL QUEL | Étendu à l'API privée. |
| FR40 | Opération longue : identifiant et état aussitôt | TEL QUEL | Couvre aussi envoi de rushes et transcription. |
| FR41 | Erreurs MCP structurées (code, message FR, contexte) | TEL QUEL | Donner regie pour sujet (défaut de forme). |
| FR42 | Référence des outils générée depuis le code, un prompt d'exemple par parcours | TEL QUEL | La référence de l'API privée suit la même règle. |

### 2.7 Administration, sécurité et audit (FR43 à FR49)

| ID | Résumé d'origine | Groupe | Comment / pourquoi |
|---|---|---|---|
| FR43 | Mot de passe unique défini à la première mise en route, sans second facteur | ADAPTÉ | **Comptes utilisateurs** : rôle propriétaire et rôle membre de la bêta, accès sur invitation (pas d'inscription ouverte), mot de passe par compte. Le second facteur est à rouvrir puisque le service est en ligne avec des tiers. |
| FR44 | Secrets chiffrés au repos par clé maîtresse de l'environnement, rotation | TEL QUEL | Remplacer « message explicite » par le contenu exigé (défaut du rapport). |
| FR45 | Journaliser toute action modifiant l'état et toute tentative de publication | ADAPTÉ | Ajout de **l'utilisateur** à l'origine (en plus de interface / MCP / API et de l'identifiant de jeton). |
| FR46 | Consulter l'audit avec filtres ; journal inaltérable | ADAPTÉ | Chaque utilisateur voit son audit, le propriétaire voit tout ; filtre par utilisateur. |
| FR47 | (fin V1) Pages CGU et confidentialité servies publiquement ; routes publiques énumérées | ADAPTÉ | Requises **dès la bêta** : des tiers confient leurs rushes (politique de confidentialité nécessaire) et les dossiers d'agrément partent tôt. |
| FR48 | Aucune vidéo accessible publiquement après publication | ADAPTÉ | Étendu : aucun rush, brouillon ni vidéo d'un utilisateur accessible à un autre ou au public, hors adresse temporaire de récupération par un réseau. |
| FR49 | Installation sur le poste du fondateur depuis le dépôt public, aucun secret au dépôt | ADAPTÉ | Devient le **déploiement sur le serveur de Benjamin** (accès web, rien à installer pour la bêta) ; « aucun secret dans le dépôt » reste intact. |

## 3. Exigences non fonctionnelles

### 3.1 Performance (NFR1 à NFR6)

| ID | Résumé d'origine | Groupe | Comment / pourquoi |
|---|---|---|---|
| NFR1 | Aucune page ni réponse MCP n'attend un rendu, un envoi ou un test | TEL QUEL | S'applique aussi à l'API privée et à la transcription. |
| NFR2 | Pages rendues sans appel réseau sortant | TEL QUEL | — |
| NFR3 | Rafraîchissement toutes les 5 s sur une tâche en cours | ADAPTÉ | Complété par la **notification « brouillon prêt »** ; ajouter une ligne « Vérification » (défaut). |
| NFR4 | Durée de génération enregistrée, aucune cible | ADAPTÉ | Fixer une cible chiffrée (délai maximal d'un brouillon pour une durée de rushes donnée) et la **précision du temps estimé** ; plus de valeur laissée ouverte (défaut principal du rapport). |
| NFR5 | Une génération à la fois, en file | ADAPTÉ | File **partagée entre utilisateurs** sur le serveur : ordre équitable, position et temps estimé visibles par chacun ; parallélisme fixé par la capacité du serveur. |
| NFR6 | Volume d'une année : ~160 vidéos, ~470 publications | ADAPTÉ | Volume recalculé pour la bêta (nombre d'utilisateurs × brouillons par semaine) **et volume de rushes stockés** (4K). |

### 3.2 Fiabilité (NFR7 à NFR14)

| ID | Résumé d'origine | Groupe | Comment / pourquoi |
|---|---|---|---|
| NFR7 | Publication programmée partie dans la minute | TEL QUEL | — |
| NFR8 | Rattrapage au démarrage dans une fenêtre bornée (2 h proposées) | TEL QUEL | Reste utile après une maintenance du serveur. |
| NFR9 | Clé d'idempotence, aucun double envoi | TEL QUEL | — |
| NFR10 | Délai de garde par type de tâche longue | ADAPTÉ | Nouveaux types : envoi de rushes, proxy basse définition, transcription, synthèse vocale, enregistrement d'un script. |
| NFR11 | 100 % des échecs d'API réseau visibles, avec « rejouer » | TEL QUEL | — |
| NFR12 | Deux rendus de la même fiche : même durée, mêmes scènes, mêmes textes | ADAPTÉ | Mêmes rushes + même intention + même gabarit + mêmes versions de modèles locaux → même brouillon ; pour la capture, le rejeu du même script sur la même version de l'app. Montrer ce critère dans un parcours (défaut de traçabilité). |
| NFR13 | Tâches, file et états survivent au redémarrage | TEL QUEL | — |
| NFR14 | Toutes les données dans un seul dossier, restauration testée | ADAPTÉ | Données cloisonnées par utilisateur ; volume de rushes, rétention et purge ; sauvegarde du serveur ; le test de restauration reste. |

### 3.3 Sécurité (NFR15 à NFR23)

| ID | Résumé d'origine | Groupe | Comment / pourquoi |
|---|---|---|---|
| NFR15 | Zéro secret en clair (base, journaux, dépôt, réponses MCP) | TEL QUEL | Ajouter les réponses de l'API privée. |
| NFR16 | Chiffrement authentifié, clé maîtresse `REGIE_MASTER_KEY`, refus de démarrer, format versionné | ADAPTÉ | Même exigence, réécrite en effet observable : retirer le nom de variable (fuite relevée par le rapport). |
| NFR17 | Aucune requête MCP sans jeton porteur valide | ADAPTÉ | Étendu à l'API privée ; jeton lié à un utilisateur, aucune donnée d'un autre utilisateur accessible. |
| NFR18 | Routes publiques énumérées, tout le reste sous session | TEL QUEL | — |
| NFR19 | Adresse temporaire de récupération signée, liée à une publication, expirante | TEL QUEL | — |
| NFR20 | Capture limitée aux hôtes autorisés, identifiants de démo, hôte dans l'audit | ADAPTÉ | Par application capturée ; exécution isolée des scripts (ils peuvent être écrits par Claude). |
| NFR21 | Journal d'audit en ajout seul | TEL QUEL | — |
| NFR22 | Mot de passe du fondateur en hachage lent et salé, échecs tracés | ADAPTÉ | Tous les comptes ; limitation des tentatives ; préciser le paramètre de coût (qualificatif « lent » non mesuré). |
| NFR23 | Données personnelles limitées au fondateur, aucune donnée de tiers | ADAPTÉ | Renversé : la bêta traite des **données de tiers** (comptes, visages et voix dans les rushes). Exige un traitement RGPD en V1 : finalité, durée de conservation et purge des rushes, suppression à la demande, hébergement déclaré. |

### 3.4 Accessibilité (NFR24 à NFR27)

| ID | Résumé d'origine | Groupe | Comment / pourquoi |
|---|---|---|---|
| NFR24 | Tout au clavier, focus visible, raccourcis documentés | ADAPTÉ | Clavier sur ordinateur ; au téléphone, chaque geste (glisser pour garder ou jeter) a un bouton équivalent. |
| NFR25 | Contraste AA 4,5:1 | TEL QUEL | — |
| NFR26 | Libellé texte partout, jamais la couleur seule | TEL QUEL | — |
| NFR27 | Écran d'au moins 1 280 px, bandeau en dessous, pas de mobile | ABANDONNER | Contredit le cœur du produit : la relecture se fait au téléphone (écran responsive décidé au design thinking). |

### 3.5 Intégration (NFR28 à NFR33)

| ID | Résumé d'origine | Groupe | Comment / pourquoi |
|---|---|---|---|
| NFR28 | Connecteur de réseau isolé derrière la couche de services | TEL QUEL | — |
| NFR29 | Bornes par réseau dans un fichier versionné, testé | TEL QUEL | — |
| NFR30 | Appel sortant via connecteur, idempotence, délai de garde, journalisé sans secret | TEL QUEL | Ajouter la ligne « Vérification » de la journalisation sans secret (défaut). |
| NFR31 | Échéance des jetons affichée, prévenance avant échéance | TEL QUEL | Donner un délai proposé et une ligne « Vérification » (défaut). |
| NFR32 | Chaque outil MCP = un service, test de parité et de dérive | ADAPTÉ | Parité à trois (interface, MCP, API privée) ; test de dérive étendu à la référence de l'API. |
| NFR33 | Transport Streamable HTTP du SDK TypeScript officiel ; retrait annoncé une version avant | ADAPTÉ | Réécrire sans nommer le SDK (fuite) ; règle de retrait étendue à l'API privée (versionnement). |

### 3.6 Exploitation et maintenabilité (NFR34 à NFR37)

| ID | Résumé d'origine | Groupe | Comment / pourquoi |
|---|---|---|---|
| NFR34 | Installation en quatre étapes (Node, pnpm, Playwright, ffmpeg) | ADAPTÉ | Devient le déploiement sur le serveur ; prérequis (y compris modèles locaux de transcription et de voix) contrôlés au démarrage ; réécrire sans noms d'outils (fuite). |
| NFR35 | Mise à jour par `git pull` + `pnpm install`, migrations au démarrage | ADAPTÉ | Migrations versionnées et atomiques conservées ; mise à jour du serveur sans perte de la file ni des envois en cours ; réécrire sans commandes (fuite). |
| NFR36 | CI à chaque commit (typage, parité, secrets, bornes, reproductibilité, contraste…) | ADAPTÉ | Ajouter le **contrôle des licences** (libres uniquement) et la parité API ; retirer les noms de plateforme et d'outils (fuites). |
| NFR37 | Dates en heure de Paris, changement d'heure sans décalage | TEL QUEL | — |

## 4. Décomptes

| Groupe | FR | NFR | Total |
|---|---|---|---|
| REPRENDRE tel quel | 22 | 18 | 40 |
| REPRENDRE ADAPTÉ | 26 | 18 | 44 |
| ABANDONNER | 1 (FR36) | 1 (NFR27) | 2 |
| **Total** | **49** | **37** | **86** |

**Cinq exigences clés à reprendre** :

1. **FR12** — gardes de lisibilité et de zone sûre bloquantes, jamais forçables (le seuil de qualité du brouillon en dépend).
2. **FR23 / NFR9** — aucun double envoi, clé d'idempotence.
3. **FR39 / NFR15** — aucun secret par MCP ni API, zéro secret en clair.
4. **FR38 / NFR32** — parité des services, étendue à l'API privée.
5. **FR25–FR26 / NFR11** — aucun échec silencieux, cause visible et « rejouer ».

## 5. Défauts du rapport de validation à ne pas reproduire

Le rapport classait l'ancien PRD en **Critical** (note 4/5) pour deux familles d'écarts, plus deux avertissements.

1. **NFR sans valeur ni vérification** (12 écarts de mesurabilité). Chaque NFR porte un critère chiffré **et** une ligne « Vérification ». Si la mesure n'existe pas encore, écrire la valeur qui déclenche le refus plutôt que « à confirmer » ; ne pas laisser une valeur différée traverser l'architecture. Cas typiques à éviter : NFR3, NFR4 (durée sans cible), NFR27, NFR30, NFR31, NFR33 à NFR35.
2. **Fuites d'implémentation dans les NFR** (12 occurrences dans NFR16, NFR33 à NFR36). Aucun nom de bibliothèque, d'outil, de plateforme, de commande ni de variable d'environnement dans une exigence (Playwright, ffmpeg, libx264, Node, pnpm, `git pull`, GitHub Actions, SDK TypeScript, `REGIE_MASTER_KEY`). Énoncer l'effet observable ; renvoyer le moyen aux considérations de mise en œuvre ou à l'architecture. Vigilance accrue : la réorientation invite à nommer Whisper, Piper, tus — même règle.
3. **Sujet implicite** (FR25, FR41, FR48). Chaque FR nomme son acteur (utilisateur, propriétaire, Claude, regie).
4. **Qualificatif non mesuré** : « message explicite » (FR44, NFR16, NFR34, NFR35), « hachage lent » (NFR22). Dire ce que le message contient, donner le paramètre.
5. **Exigence sans parcours** (FR6). Chaque FR remonte à un parcours ou à une décision datée ; une capacité de secours est déclarée comme telle.
6. **Critère de succès non montré par un parcours** (reproductibilité « même fiche → même vidéo ») et **dimension de succès absente du résumé** (« aucun échec silencieux »). Le résumé exécutif annonce toutes les dimensions de succès, et chaque critère se voit dans un parcours.
7. **Seuils de garde hors du PRD** (FR8, FR12). Dire où vivent les seuils (fichier de règles versionné) pour que la mesure soit vérifiable sans lire le code.
8. **Délai non chiffré** (FR32 : « prévenu avant »). Donner une valeur proposée.
9. **Hypothèse risquée non portée par l'exigence** (FR4 : compte sans second facteur ; FR33 : Reel sans agrément). Écrire la condition dans l'exigence.
10. **Navigation** : pas de sommaire ni de renvoi FR → section. Le nouveau PRD a un sommaire et un index des exigences.
11. **Section Innovation sans source** ni chiffre ; à sourcer ou à réduire.
12. **Frontmatter sans date** : déjà corrigé dans le nouveau `prd.md` (`created`, `updated`).

## 6. Contraintes du mandat toujours valables

**Projet et dépôt**

- Projet **à part de saas-souverain** : rien de regie dans ce dépôt-là ; le moteur vidéo est porté ou référencé, jamais partagé.
- Dépôt **public** sur GitHub ; il ne contient **aucun secret** ; fichier d'exemple de configuration sans valeur ; scan de secrets bloquant.
- **100 % libre et gratuit** : licences MIT, Apache, BSD, LGPL/GPL ou domaine public uniquement ; aucune brique sous licence payante ou conditionnelle (**Remotion écarté**). S'applique aussi aux modèles d'IA, à la voix de synthèse (licence réellement libre, à valider sur deux vidéos test) et à la musique intégrée (libre de droits).

**Secrets et coffre**

- Clés API, OAuth et identifiants de démo saisis **par l'interface uniquement** ; aucun secret ne transite par MCP (ni par l'API privée) ; aucune réponse d'outil n'en contient.
- Coffre : clé maîtresse lue dans l'environnement au démarrage, jamais en base, au dépôt ni dans les journaux ; refus de démarrer sans elle ; chiffrement authentifié ; rotation par rechiffrement ; format versionné ; un secret saisi n'est jamais réaffiché.

**Pilotage**

- Tout ce que fait l'interface est **pilotable par Claude via MCP**, par une couche de services commune (aujourd'hui aussi à l'API privée).
- MCP joignable seulement avec un jeton révocable ; origine de chaque action dans un audit en ajout seul.

**IA**

- **IA locale uniquement** (transcription, voix) ; **aucune API d'IA en nuage**.

**Réseaux et publication**

- Réseaux à API payante exclus (**X**).
- Publication V1 sur les **comptes du propriétaire** seulement ; tiers = export ou téléchargement jusqu'aux agréments.
- Échec de publication visible dans regie, **sans notification externe ni nouvelle tentative automatique** ; « rejouer » manuel.
- Une vidéo ayant eu une publication ne se supprime pas : elle s'archive.
- Son : vidéo par vidéo, musique libre intégrée **ou** vidéo sans musique pour ajouter un son de la plateforme.

**Produit**

- Promesse centrale « ne plus monter » : un brouillon complet à relire, pas un éditeur.
- Gabarit de marque = **identité visuelle seulement** (logo, couleurs, polices, style des sous-titres) ; le récit reste libre.
- Parcours de démo toujours converti en **script d'actions modifiable et rejouable** ; le journal des clics alimente l'auto-zoom.
- Capture d'écran ou de fenêtre du Mac en direct **non retenue**.
- Mobile : application native **plus tard**, **pas de PWA** ; en attendant, écran web responsive d'envoi et de relecture.
- Ordre : Benjamin et ses démos d'abord, mais en construisant le **noyau commun** (coupe des silences, sous-titres, gabarit) ; le brouillon automatique doit marcher sur ses démos avant la maquette influenceuses.
- Hébergement de la bêta sur le **serveur de Benjamin**, accès web.
- Critères : 7 brouillons sur 10 publiables sans retouche ; moins de 2 min de relecture par vidéo ; Benjamin et au moins 2 autres publient via regie chaque semaine pendant 4 semaines.

**Hors périmètre toujours valable**

- Installation par des tiers (documentation, configuration par instance, support).
- Statistiques d'audience.
- Haute disponibilité.

## 7. Exclusions de l'ancien PRD levées par la réorientation

| Ancienne exclusion | Nouvelle décision |
|---|---|
| Une seule marque | Établia, MGA, Fanny pour Benjamin, plus les comptes de la bêta |
| Un compte par réseau | Un compte par marque et par réseau (propriétaire seulement) |
| Mono-utilisateur, pas de montée en charge | Multi-utilisateurs (bêta d'influenceuses) |
| Ordinateur seulement, relecture mobile hors V1 | Relecture au téléphone au cœur de la V1 |
| Aucune IA hors MCP | IA locale autorisée |
| Pas d'API REST publique | API privée authentifiée dès la conception, exposée avec l'app native |
| Aucune donnée de tiers | Rushes et comptes de tiers, d'où un traitement RGPD en V1 |
| Vidéos muettes par conception | Son des rushes, musique libre au choix, voix de synthèse pour les démos |
| Docker, paquet npm hors V1 (installation locale) | Déploiement serveur ; le mode de livraison est tranché à l'architecture |
| Aucune notification externe | Notification « brouillon prêt » ajoutée ; l'exclusion tient toujours pour les échecs de publication |

## 8. Contradictions entre sources à trancher

1. **Éditeur.** Le MANDAT (réorientation) dit « éditeur façon CapCut, tout en V1 » (timeline multi-clips, recadrage, musique, transitions) ; le design thinking, postérieur, repousse la timeline en **V2**. Ce document suit le design thinking.
2. **Capture mobile.** Le MANDAT retient trois sources en V1 dont les simulateurs iOS et Android ; le design thinking les place en **V2**. Ce document suit le design thinking.
3. **TikTok glisse en V1.1 si le temps manque** (ancien mandat) : à reconfirmer, TikTok étant le réseau central des influenceuses.
4. **Second facteur hors V1** : décision prise pour un outil local mono-utilisateur ; à reconfirmer pour un service en ligne ouvert à des tiers.

## 9. Glossaire de l'ancien PRD encore utile

| Terme | Sens à conserver | Remarque |
|---|---|---|
| Publication | Objet unique qui relie vidéo, légende, hashtags, réseau, compte et date | Inchangé ; s'ajoute la marque. |
| Librairie | Point de passage obligé entre fabrication et diffusion | Côtoie le nouveau « fil de relecture ». |
| Statuts | prête, refusée, programmée, publiée, échec | **« brouillon » est à renommer** : le mot désigne désormais le brouillon automatique ; prévoir un autre terme pour l'ancien statut. |
| Garde (de lisibilité, de zone sûre) | Contrôle bloquant, non forçable, qui renvoie élément fautif, mesure et seuil | Zone sûre de référence : 880×1220 en (0, 220) sur 1080×1920 à 25 i/s, à confirmer dans le gabarit. |
| Refusée / échec | « refusée » = garde ou bornes ; « échec » = erreur d'exécution (réseau, délai) | Distinction à garder. |
| Bornes (fichier de bornes) | Limites versionnées par réseau : conteneur, codec, ratio, durées, taille, légende, hashtags | Inchangé. |
| Connecteur | Module isolé par réseau derrière la couche de services | Inchangé. |
| Couche de services / parité | Un service unique appelé à l'identique par chaque porte d'entrée | Trois portes désormais. |
| Coffre, clé maîtresse | Stockage chiffré des secrets, clé fournie par l'environnement | Inchangé. |
| Clé d'idempotence | Identifiant de tentative qui interdit le double envoi | Inchangé. |
| Rejouer | Relance manuelle d'une tâche en échec, historique conservé | Inchangé. |
| Fenêtre de rattrapage | Retard maximal toléré pour une publication manquée | Inchangé. |
| Délai de garde | Durée maximale d'une tâche longue, par type | Nouveaux types de tâches. |
| Origine | Porte d'entrée d'une action (interface, MCP) dans l'audit | Ajouter API et utilisateur. |
| Journal d'audit | Trace en ajout seul de chaque action et tentative | Inchangé. |
| Paramètres | Écran d'administration : réseaux, applications à capturer, jetons | Réservé au propriétaire pour les réseaux. |
| Hôtes autorisés | Liste des adresses que la capture peut ouvrir | Par application capturée. |
| Compte de démo / tenant de démo | Compte sans donnée réelle utilisé pour filmer une app | Par application. |
| Connexion enregistrée, test de connexion | Ouverture automatique de session avant capture, et sa vérification | Inchangé. |
| Scénario | Ancienne liste ordonnée d'URL | Remplacé par **script d'actions** ; garder le terme seulement pour l'historique. |
| Média de substitution | Média fourni à la place d'une page non capturable | Généralisé en **rush importé**. |
| Accroche | Ouverture qui retient (2 à 3 s) | Une des trois variantes proposées à la relecture. |
| Jeton MCP | Jeton porteur révocable, affiché une fois | Par utilisateur. |
| Routes publiques | Liste fermée des adresses accessibles sans session | Inchangé. |
| Adresse temporaire de récupération | URL signée et expirante pour qu'un réseau récupère une vidéo | Inchangé. |
| Mode développeur, agrément | Publication limitée aux comptes rattachés tant que l'App Review (Meta) ou l'audit (TikTok) n'est pas obtenu | Démarches à lancer tôt. |
| Archivage | Retrait de la librairie courante sans perte, pour une vidéo déjà publiée | Inchangé. |

Termes à abandonner : « fondateur » (remplacé par « propriétaire » ou « utilisateur »), « fiche » (ambigu), « traiteur 1 » (scénario de chronométrage propre à l'ancien moteur, à remplacer par un jeu de rushes de référence).
