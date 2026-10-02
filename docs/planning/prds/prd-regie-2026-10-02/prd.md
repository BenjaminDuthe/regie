---
title: regie — studio de vidéos verticales libre
status: final
created: 2026-10-02
updated: 2026-10-02
supersedes: docs/planning/prd.md
---

# regie — PRD

## 1. Vision

**regie est le studio de vidéos verticales libre qui monte à ta place.**

**Tu filmes, regie te rend 3 vidéos à ton style.**

Les créatrices et créateurs de vidéos courtes (démos d'apps, face caméra, lifestyle) passent plus de temps à monter qu'à filmer. Les outils actuels, même automatiques, partent d'une seule vidéo et laissent à refaire, chaque fois, le style, le tri des passages et le découpage. regie part de la matière entière — une séance de tournage ou un parcours d'app décrit en une phrase — et rend plusieurs **brouillons** déjà montés au style de la personne : coupes, sous-titres ou textes à l'écran, **gabarit**, musique au choix. Il ne reste qu'à les relire au téléphone, sans timeline.

regie est un logiciel libre (AGPL-3.0). Toute l'intelligence artificielle tourne sur le serveur, sans service tiers, et aucune brique du produit n'est payante. Le service est hébergé par Benjamin ; la bêta est gratuite, et le modèle d'après-bêta sera décidé une fois la bêta validée.

**Principes produit**

- regie fabrique des brouillons ; **l'édition est l'exception**.
- La qualité du premier brouillon prime sur l'étendue des fonctions. En cas de conflit de calendrier, elle passe avant tout ajout (voir §7.2).
- La première vidéo doit être meilleure que ce qu'on obtient seul, sans effort.

## 2. Utilisatrices et utilisateurs cibles

Créatrices et créateurs de vidéos verticales courtes qui publient eux-mêmes : influenceuses face caméra et lifestyle, marques portées par une personne, développeurs qui font la promotion de leurs apps.

Les besoins des influenceuses sont rapportés par Benjamin ; aucune n'a encore été observée directement (voir §10).

### 2.1 Besoins

- **Fonctionnel** — publier plusieurs vidéos par semaine à partir d'une seule séance, sans monter.
- **Identité** — que chaque vidéo soit reconnaissable comme la sienne : même style, mêmes couleurs.
- **Contrôle** — garder le dernier mot sur ce qui est publié, sans faire soi-même les choix fastidieux.
- **Portée** — que les vidéos soient vues : accroche forte, rythme, place pour les sons tendance des réseaux.
- **Régularité** — tenir un rythme de publication sans s'épuiser.
- **Contexte** — tout faire au téléphone, entre deux choses.
- **Démos d'apps** — que les démos se refassent seules quand l'interface de l'app change.

### 2.2 Hors cible (V1)

- **Vidéos longues** : YouTube horizontal, podcasts, vidéos de plus de 3 minutes.
- **Monteuses et monteurs professionnels** : timeline fine, effets, étalonnage.

### 2.3 Parcours clés

- **UJ-1. Léa transforme une séance en trois vidéos.**
  - **Persona + contexte :** Léa, influenceuse lifestyle, filme ses conseils au téléphone et publie sur TikTok et Instagram ; elle n'a plus le temps de monter.
  - **Entrée :** connectée à regie dans le navigateur de son téléphone ; son **gabarit** est réglé (au besoin, le gabarit de départ suffit).
  - **Parcours :** elle filme 8 minutes de conseils skincare → envoie le **rush** depuis son téléphone, l'envoi survit à une coupure de 4G → regie propose la **recette** « face caméra » → une notification annonce « 3 brouillons prêts » → elle les fait défiler en plein écran, garde deux **brouillons** d'un glissement, barre une hésitation dans la **transcription**, choisit une accroche parmi trois **variantes** et « sans musique » pour poser un son tendance sur TikTok.
  - **Moment clé :** la vidéo exportée est publiable telle quelle, à son style, sans être passée par une timeline.
  - **Issue :** elle télécharge la vidéo, la publie dans l'app du réseau et passe au brouillon suivant.
  - **Cas limites :** (a) **rush inexploitable** (cadrage horizontal, fichier illisible) : regie le signale dès l'envoi, avant tout traitement ; (b) **brouillons ratés** : Léa demande « refaire » en indiquant ce qui ne va pas (trop long, mauvais passage), et regie propose une nouvelle série ; (c) **plans sans parole** : Léa envoie des plans de produits sans parler ; regie propose la recette « lifestyle sur musique » et rend des brouillons coupés au rythme d'un morceau, avec des textes à l'écran.

- **UJ-2. Benjamin obtient une démo d'app sans rien capturer.**
  - **Persona + contexte :** Benjamin, développeur solo, fait la promotion de ses apps (dont Établia) ; capturer et monter à la main fait décrocher sa cadence.
  - **Entrée :** dans une conversation avec Claude, connecté à regie par le MCP.
  - **Parcours :** il demande « Montre comment créer une facture dans Établia » → Claude écrit le **script d'actions** à partir de ce que regie lui montre de l'application → regie le joue dans un navigateur et l'enregistre → zoom automatique sur chaque clic, **gabarit** Établia, voix de synthèse → Benjamin relit le **brouillon** sur son téléphone.
  - **Moment clé :** une démo propre existe sans qu'il ait ouvert un outil de capture.
  - **Issue :** il la publie sur ses comptes ou la programme ; à chaque mise en production d'Établia, le script d'actions est rejoué et la démo régénérée.
  - **Cas limite :** le parcours échoue au rejeu (bouton renommé) : regie signale l'étape en échec avec sa capture d'écran et propose de corriger le script d'actions.

- **UJ-3. Fanny filme pour MGA et relit ce que Benjamin prépare.**
  - **Persona + contexte :** Fanny porte la marque MGA ; elle filme parfois face caméra pour MGA et valide les vidéos que Benjamin prépare pour cette marque.
  - **Entrée :** membre de l'**espace de marque** MGA sur regie, depuis son téléphone.
  - **Parcours :** elle envoie un rush tourné au bureau → reçoit des brouillons au gabarit MGA, comme Léa → dans le même espace, elle voit aussi les démos préparées par Benjamin, marquées « à valider » → elle en valide une, en renvoie une autre avec un commentaire.
  - **Moment clé :** les vidéos de la marque, qu'elles viennent d'elle ou de Benjamin, passent par un seul endroit et un seul style.
  - **Issue :** les vidéos validées sont publiées ou téléchargées ; les autres repartent chez leur auteur.
  - **Cas limite :** Benjamin corrige une démo déjà validée : elle repasse « à valider » et Fanny la revoit avant toute publication.

## 3. Glossaire

Termes à employer tels quels dans ce PRD et les documents qui en découlent ; aucun synonyme.

**Personnes et espaces**
- **Utilisateur** — personne ayant un compte regie. Membre d'un ou plusieurs espaces de marque.
- **Administrateur de l'instance** — utilisateur qui règle l'instance hébergée : clés d'application des réseaux, envoi des courriels, droit de publication des espaces, catalogue musical, signalements, ouverture des inscriptions. Rôle distinct du propriétaire. En V1, Benjamin.
- **Espace de marque** — regroupe un gabarit, des comptes réseau, des séances et des vidéos. Un espace a un **propriétaire** et des **membres**.
- **Propriétaire** — utilisateur qui crée l'espace de marque, invite et retire les membres, règle la validation, accorde à des membres le droit de publier et, si l'espace a le droit de publication, connecte les comptes réseau.
- **Membre** — utilisateur invité dans un espace de marque ; le propriétaire en est un.
- **Droit de publication** — autorisation accordée par l'administrateur de l'instance à un espace de marque : connecter des comptes réseau et y publier.

**Matière**
- **Rush** — fichier vidéo brut envoyé par un utilisateur, ou importé.
- **Séance** — ensemble de rushes envoyés ensemble ; une séance produit un ou plusieurs brouillons.
- **Prise** — enregistrement d'un passage ; une séance peut contenir plusieurs prises du même passage.
- **Script d'actions** — liste ordonnée et rejouable d'étapes dans une app web (ouvrir, cliquer, saisir, attendre), écrite par Claude, enregistrée par l'enregistreur de clics ou tirée d'un test de bout en bout.
- **Capture** — enregistrement vidéo produit en jouant un script d'actions dans un navigateur piloté ; traitée ensuite comme un rush.
- **Transcription** — texte mot à mot horodaté d'un rush ou d'une capture.
- **Date de purge** — date à laquelle regie efface les rushes d'une séance (FR-52).

**Fabrication**
- **Gabarit** — identité visuelle d'un espace de marque : logo, couleurs, polices, style des sous-titres, carte de fin. Le récit n'en fait pas partie. Chaque espace a un gabarit par défaut et jusqu'à 3 gabarits en V1.
- **Recette** — structure de format qui guide le montage automatique : découpage, durée, rythme. Trois recettes en V1 : **démo d'app**, **face caméra**, **lifestyle sur musique**.
- **Montage** — description structurée d'une vidéo (plans, coupes, textes, sons) partagée par la relecture, le MCP, l'API et le rendu.
- **Brouillon** — vidéo montée automatiquement, en attente de relecture. Premier statut de toute vidéo.
- **Variante** — alternative proposée pour un élément d'un brouillon : accroche, musique, couverture, prise.
- **Texte à l'écran** — texte posé sur la vidéo hors sous-titres : titre d'un conseil, nom d'un produit, étape d'une démo.
- **Zone douteuse** — mot, coupe ou frontière d'idée dont regie est peu sûr, signalé à la relecture.
- **Rendu** — fichier vidéo final 1080×1920 produit à partir d'un montage.
- **Version allégée** — copie basse définition d'un brouillon, servie pour la relecture au téléphone.
- **Garde** — contrôle bloquant et non forçable (lisibilité, zone sûre, bornes) qui nomme l'élément fautif, la mesure et le seuil.

**Relecture et sortie**
- **Fil de relecture** — écran mobile où les brouillons défilent en plein écran pour être triés et corrigés.
- **Vidéo** — tout objet issu d'un montage. Statuts : **brouillon** → **gardée** → **à valider** (seulement si l'espace a activé la validation) → **prête** ; ou **jetée** ; ou **archivée** ; ou **en échec de traitement**. Sans validation, une vidéo gardée devient prête immédiatement. Une vidéo peut porter plusieurs publications ; leur statut ne change pas celui de la vidéo.
- **Validation** — réglage d'un espace de marque d'au moins deux membres, activé par le propriétaire : toute vidéo gardée doit être approuvée par un membre autre que son auteur avant d'être prête.
- **Publication** — envoi d'une vidéo prête vers un compte réseau, immédiat ou programmé, avec légende et hashtags. Statuts : **programmée** → **publiée** ; ou **en échec** ; ou **annulée** ; pour TikTok, **envoyée en brouillon** (FR-63). Une publication immédiate part sans passer par « programmée ». Une clé unique (clé d'idempotence) empêche tout double envoi.
- **Export** — téléchargement du rendu pour publication manuelle dans l'app d'un réseau.
- **Compte réseau** — compte Instagram Reels, Page Facebook, TikTok ou YouTube Shorts connecté à un espace de marque.
- **Bibliothèque musicale** — catalogue de morceaux à licence libre vérifiée, dans lequel le montage automatique puise ; les utilisateurs peuvent y proposer des morceaux.

**Plateforme**
- **Couche de services** — service unique appelé à l'identique par les trois portes d'entrée : interface, MCP, API privée.
- **Coffre** — stockage chiffré des secrets (jetons des comptes réseau, clés d'application, identifiants de démo), clé maîtresse fournie par l'environnement.
- **Journal d'audit** — trace en ajout seul de chaque action, avec son origine (interface, MCP, API) et son utilisateur.
- **File de traitement** — file des tâches longues (transcription, montage, rendu, capture), avec position et temps estimé.

## 4. Fonctions

### 4.1 Comptes, espaces de marque et membres

**Description :** chaque personne a son compte ; le travail se range dans des espaces de marque (Établia, MGA, l'espace personnel de Léa). Le propriétaire d'un espace invite des membres et décide si les vidéos passent par une validation. Un utilisateur peut appartenir à plusieurs espaces et passer de l'un à l'autre. Réalise UJ-1, UJ-3.

#### FR-1 : Création de compte
Un visiteur peut créer un compte avec une adresse de courriel et un mot de passe ; l'inscription est ouverte dès la V1.
- L'adresse de courriel est confirmée avant la première séance.
- Chaque compte est soumis à un quota d'usage (durée de rushes traitée, stockage), fixé en V1 à 2 h de rushes traités par mois et 20 Go de stockage ; au-delà, l'envoi est refusé avec un message qui l'explique.
- L'administrateur de l'instance peut suspendre les nouvelles inscriptions, par exemple quand la charge dépasse la charge nominale (NFR-32) ; la page d'inscription l'annonce.
- Les tentatives de connexion échouées répétées sont freinées puis bloquées temporairement, et tracées au journal d'audit (seuils : NFR-20).

#### FR-54 : Connexion et mot de passe oublié
Un utilisateur se connecte avec son adresse de courriel et son mot de passe, et se déconnecte. Réalise UJ-1.
- Un utilisateur qui a oublié son mot de passe reçoit, à son adresse confirmée, un lien à usage unique valable 1 h [ASSUMPTION] pour en choisir un nouveau.
- La réponse à une demande ne révèle pas si l'adresse a un compte.
- La demande et l'usage du lien sont tracés au journal d'audit.

#### FR-2 : Espace de marque
Un utilisateur peut créer un espace de marque ; il en devient le propriétaire. Réalise UJ-1, UJ-3.
- Un nouvel utilisateur dispose d'un espace de marque personnel dès sa première connexion.
- Un utilisateur membre de plusieurs espaces voit l'espace actif et peut en changer en un geste.

#### FR-3 : Membres
Le propriétaire peut inviter un membre par un lien d'invitation à usage unique valable 7 jours [ASSUMPTION], et retirer un membre. Réalise UJ-3.
- Un membre retiré perd l'accès à l'espace dès sa requête suivante ; ses vidéos restent dans l'espace.
- Le propriétaire peut accorder ou retirer à un membre le droit de publier depuis l'espace (FR-42).

#### FR-4 : Validation
Le propriétaire peut activer ou désactiver la validation de son espace de marque. Réalise UJ-3.
- La validation ne peut être activée que si l'espace compte au moins deux membres, propriétaire compris.
- Si l'espace retombe à un seul membre, regie désactive la validation, en prévient le propriétaire, et les vidéos « à valider » deviennent « prêtes ».
- Validation inactive : une vidéo gardée devient « prête » immédiatement.
- Validation active : une vidéo gardée passe « à valider » et ne devient « prête » qu'après l'approbation d'un membre autre que son auteur (FR-39).

#### FR-5 : Cloisonnement
regie n'expose aucune donnée d'un espace de marque (rush, transcription, brouillon, vidéo, gabarit, compte réseau) à un utilisateur qui n'en est pas membre, quelle que soit la porte d'entrée (interface, MCP, API privée).
- Un test automatisé tente chaque lecture et chaque écriture depuis un utilisateur non membre et obtient un refus.

### 4.2 Gabarit

**Description :** le gabarit porte l'identité visuelle d'un espace de marque, une fois pour toutes : logo, couleurs, polices, style des sous-titres, carte de fin, légende et hashtags par défaut. Il ne dicte pas le récit, choisi vidéo par vidéo. Chaque espace a un gabarit par défaut, appliqué à toute séance, et jusqu'à 3 gabarits au choix en V1. Réalise UJ-1, UJ-2, UJ-3.

#### FR-55 : Gabarit de départ
regie donne à tout nouvel espace de marque un gabarit de départ, utilisable tout de suite. Réalise UJ-1.
- Le propriétaire peut le personnaliser depuis son téléphone en trois choix : couleur principale, police, style des sous-titres ; il le complète plus tard (FR-6).

#### FR-6 : Définir le gabarit
Le propriétaire peut définir le gabarit par défaut de son espace : logo, deux à quatre couleurs, police des titres et des sous-titres, style des sous-titres, carte de fin, légende et hashtags par défaut. Réalise UJ-1, UJ-3.
- Les polices proposées ou importées doivent avoir une licence libre ; regie refuse un fichier de police sans licence déclarée.
- Si l'espace a plusieurs gabarits, l'utilisateur choisit le gabarit à l'envoi de la séance ; à défaut, le gabarit par défaut s'applique.

#### FR-7 : Aperçu et gardes du gabarit
Le propriétaire voit l'aperçu du gabarit appliqué à un brouillon d'exemple avant de l'enregistrer.
- Un gabarit qui ferait échouer une garde (contraste des sous-titres, taille du texte, texte hors zone sûre) est refusé avec l'élément fautif, la mesure et le seuil. Les seuils sont ceux de FR-28.

#### FR-8 : Changement de gabarit
regie applique une modification du gabarit aux brouillons produits ensuite ; les vidéos prêtes, archivées ou ayant une publication ne changent pas.
- Un utilisateur peut régénérer un brouillon en cours de relecture avec le nouveau gabarit, tant que les rushes de sa séance ne sont pas purgés (FR-52).

### 4.3 Envoi des rushes

**Description :** depuis son téléphone, un utilisateur envoie les rushes d'une séance, avec une intention facultative (« trois conseils skincare »). L'envoi résiste aux coupures du réseau mobile ; regie contrôle chaque rush dès réception, propose une recette et annonce quand les brouillons seront prêts. Réalise UJ-1, UJ-3.

#### FR-9 : Séance
Un utilisateur peut envoyer un ou plusieurs rushes en une séance, depuis le navigateur de son téléphone ou de son ordinateur, et y joindre une intention en texte libre. Réalise UJ-1.
- Formats acceptés : vidéos de téléphone courantes, jusqu'en 4K. Une séance compte au plus 30 minutes de rushes.

#### FR-10 : Envoi reprenable
regie reprend un envoi interrompu (perte de réseau, mise en veille, fermeture de l'onglet) là où il s'est arrêté dès que l'utilisateur revient, sans renvoyer ce qui était déjà reçu. Réalise UJ-1.
- Un envoi interrompu reste reprenable pendant 24 h [ASSUMPTION].
- Couper le réseau à mi-envoi d'un rush de 500 Mo puis le rétablir termine l'envoi sans repartir de zéro.

#### FR-11 : Contrôle à réception
regie contrôle chaque rush dès sa réception, avant tout traitement : orientation, durée, lisibilité du fichier. Réalise UJ-1 (cas limite a).
- Un rush horizontal ou illisible est signalé à l'utilisateur, qui choisit de le retirer ou de le garder.
- L'absence de voix n'est pas une anomalie : regie la relève seulement pour proposer la recette (FR-56).

#### FR-12 : Temps estimé
Dès la fin de l'envoi, regie affiche une heure estimée de disponibilité des brouillons et la position de la séance dans la file de traitement. Réalise UJ-1.

### 4.4 Capture par script d'actions

**Description :** pour montrer une app web, l'utilisateur n'enregistre plus son écran : il obtient un script d'actions, joué et filmé par un navigateur piloté sur le serveur. Le script naît de trois façons : une phrase à Claude, l'enregistreur de clics, ou un test de bout en bout existant. Il reste lisible, modifiable et rejouable ; à chaque mise en production de l'app, la démo se refait seule. Réalise UJ-2.

#### FR-13 : Application à capturer
Le propriétaire d'un espace de marque peut y déclarer une application à capturer : hôtes autorisés, identifiants d'un compte de démonstration (sans second facteur), rangés au coffre. Réalise UJ-2.
- regie peut tester la connexion : il renvoie la page d'accueil capturée, ou l'étape fautive.
- Les identifiants ne sont saisis et modifiés que dans l'interface, jamais par le MCP ni l'API.

#### FR-14 : Script depuis une phrase
Un utilisateur peut demander à Claude, par le MCP, un script d'actions décrit en langage naturel (« montre comment créer une facture ») ; Claude l'écrit, regie le joue. Réalise UJ-2.
- regie fournit à Claude, pour l'application déclarée, les pages visitées, leurs éléments cliquables et des captures d'écran.
- Avant d'accepter le script, regie vérifie que chaque étape vise un hôte autorisé.
- Cette fonction n'existe que par le MCP (exception déclarée à FR-47).

#### FR-15 : Enregistreur de clics
Un utilisateur peut enregistrer un script d'actions en réalisant une fois le parcours dans l'application ; chaque clic, saisie et navigation devient une étape. Réalise UJ-2.

#### FR-16 : Script depuis un test de bout en bout
Un utilisateur peut importer un test de bout en bout existant de son application comme script d'actions. Réalise UJ-2.
- Une étape que regie ne sait pas convertir est signalée avec son numéro ; le script n'est pas créé tant qu'elle n'est pas retirée ou réécrite. En V1, regie accepte les tests écrits pour Playwright et pour Cypress.

#### FR-17 : Lire et modifier un script
Un utilisateur peut lire les étapes d'un script d'actions, en ajouter, en retirer et les réordonner, par l'interface comme par le MCP.

#### FR-18 : Jouer un script
regie joue un script d'actions dans un navigateur piloté, l'enregistre en vidéo verticale et produit le journal horodaté des clics, qui guide le zoom automatique. Réalise UJ-2.
- Toute navigation vers un hôte hors de la liste autorisée arrête la capture avec un refus tracé.
- Chaque capture s'exécute isolée : sans accès au réseau interne du serveur, aux fichiers d'un autre utilisateur ni aux secrets autres que les identifiants de démo de l'application jouée.

#### FR-19 : Rejeu à la mise en production
Un appel authentifié (par exemple depuis la chaîne de déploiement de l'application) rejoue les scripts d'actions choisis et régénère leurs brouillons. Réalise UJ-2.
- L'appel exige un jeton limité au rejeu de scripts d'un espace (FR-46).
- Une étape qui échoue (élément introuvable) est signalée avec son numéro et une capture d'écran ; le script peut être corrigé puis rejoué.

### 4.5 Montage automatique

**Description :** à partir d'une séance (ou d'une capture), de l'intention, du gabarit et d'une recette, regie produit plusieurs brouillons. Pour une séance parlée, il transcrit, découpe la matière par idée, retient la meilleure prise, coupe silences et hésitations, place une accroche dans les deux premières secondes, sous-titre mot à mot au style du gabarit. Pour une séance sans parole, il monte les plans au rythme de la musique avec des textes à l'écran. Il ajoute la carte de fin et propose trois variantes d'accroche, de musique et de couverture. Pour les démos, il zoome sur chaque clic et peut ajouter une voix de synthèse. Réalise UJ-1, UJ-2, UJ-3.

#### FR-56 : Recettes
regie fournit trois recettes en V1 : démo d'app, face caméra, lifestyle sur musique. Réalise UJ-1, UJ-2, UJ-3.
- regie propose une recette d'après la séance : démo d'app pour une capture, face caméra si une voix est présente, lifestyle sur musique sinon.
- L'utilisateur peut choisir une autre recette avant le début du montage ; sans choix de sa part, le montage démarre avec la recette proposée.
- Chaque recette fixe le découpage, la durée cible et le rythme : un changement de plan, de zoom ou de texte à l'écran au moins toutes les 3 s.
- La recette utilisée s'affiche sur chaque brouillon du fil.

#### FR-20 : Plusieurs brouillons par séance
Pour les recettes parlées, regie découpe la transcription d'une séance par idée distincte et produit un brouillon par idée. Réalise UJ-1.
- Quand les idées s'enchaînent, les brouillons forment une série numérotée (1/3, 2/3, 3/3) avec la suite annoncée en fin de vidéo.
- Si aucune idée ne donne un brouillon qui passe les gardes, regie l'annonce avec la raison et un conseil de tournage, au lieu de livrer des brouillons médiocres.
- Une séance produit au plus 5 brouillons.

#### FR-59 : Meilleure prise
Quand un même passage est dit plusieurs fois dans la séance, regie retient la prise la plus complète, sans hésitation et à la voix la plus nette. Réalise UJ-1.
- Les autres prises sont proposées en variante dans le fil (FR-37).

#### FR-21 : Coupe des silences et hésitations
regie retire de chaque brouillon parlé les silences de plus de 0,7 s [ASSUMPTION], les hésitations et les faux départs repérés dans la transcription. Réalise UJ-1.

#### FR-22 : Sous-titres
regie pose sur chaque brouillon parlé des sous-titres mot à mot, animés au style du gabarit, tirés d'une transcription faite sur le serveur (qualité : NFR-38). Réalise UJ-1.
- Les mots dont la transcription est peu sûre sont signalés à la relecture (FR-60).

#### FR-57 : Montage sur musique
Avec la recette lifestyle sur musique, regie choisit les plans les plus nets et les plus stables de la séance, les ordonne et les coupe au rythme du morceau choisi. Réalise UJ-1 (cas limite c).
- Une séance sans parole produit au moins un brouillon.
- L'accroche des deux premières secondes est portée par un texte à l'écran (FR-58).

#### FR-58 : Textes à l'écran
regie pose des textes à l'écran (titre d'un conseil, nom d'un produit, étape d'une démo) tirés de l'intention ou de la transcription, au style du gabarit, sous contrôle des gardes (FR-28). Réalise UJ-1, UJ-2.
- Un utilisateur les corrige dans le fil comme la transcription (FR-36).

#### FR-23 : Accroche
Chaque brouillon commence par une accroche qui tient dans les deux premières secondes ; regie propose trois variantes d'accroche. Réalise UJ-1.

#### FR-24 : Musique
regie propose trois variantes de musique tirées de la bibliothèque musicale, plus la variante « sans musique » pour poser ensuite un son tendance dans l'app du réseau. Réalise UJ-1.
- La voix des rushes est conservée et reste intelligible sous la musique (NFR-39).

#### FR-25 : Couverture
regie propose trois variantes de couverture (image d'ouverture), au style du gabarit. Réalise UJ-1.

#### FR-26 : Zoom automatique des démos
Sur une capture, regie recadre en 9:16 et zoome sur la zone de chaque clic à partir du journal des clics, avec un curseur visible. Réalise UJ-2.

#### FR-27 : Voix de synthèse
Sur une démo, regie peut ajouter une voix de synthèse produite sur le serveur, à partir d'un texte tiré du script d'actions et modifiable avant rendu. Réalise UJ-2.
- Seules des voix sous licence réellement libre autorisant l'usage commercial sont proposées.
- La voix retenue est validée sur deux vidéos test avant la bêta (voir Questions ouvertes).

#### FR-28 : Gardes
regie refuse de rendre un brouillon qui échoue à une garde (lisibilité, zone sûre, bornes) ; la garde est non forçable et nomme le segment, son code temporel, la mesure et le seuil. Réalise UJ-1, UJ-2.
- Le brouillon bloqué apparaît dans le fil, segment fautif mis en avant ; l'utilisateur le corrige par le texte ou demande « refaire ». Il ne peut pas être gardé tant que la garde échoue.
- Valeurs par défaut [ASSUMPTION] : contraste des sous-titres et des textes à l'écran sur leur fond d'au moins 4,5:1 ; hauteur des capitales d'au moins 48 px sur 1920 ; tout texte dans la zone sûre de 880×1220 px placée à (0, 220) sur 1080×1920, soit 220 px libres en haut, 480 px en bas et 200 px à droite.
- Les seuils et les marges de zone sûre propres à chaque réseau vivent dans le fichier versionné des bornes (NFR-27), qui peut resserrer ces valeurs par défaut.

#### FR-29 : Refaire
Un utilisateur peut demander une nouvelle série de brouillons pour une séance, en indiquant ce qui ne va pas (trop long, mauvais passage, autre angle) et, au besoin, une autre recette. Réalise UJ-1 (cas limite b).
- « Refaire » n'est plus possible après la purge des rushes de la séance (FR-52).

#### FR-30 : Reproductibilité
regie produit le même montage à partir des mêmes rushes, de la même intention, du même gabarit, de la même recette et des mêmes versions de modèles, tant que les rushes sont conservés (FR-52).

### 4.6 File de traitement et notifications

**Description :** rien ne bloque l'utilisateur pendant que regie travaille. Envois, transcriptions, captures, montages et rendus passent par une file ; l'utilisateur peut fermer la page et revenir quand regie le prévient. Réalise UJ-1, UJ-2.

#### FR-31 : File visible
Un utilisateur voit, pour chacune de ses séances et captures, l'étape en cours (envoi, contrôle, transcription, montage, rendu), sa position dans la file et le temps restant estimé.

#### FR-32 : Notifications
regie prévient l'utilisateur dans l'interface et par courriel quand une série de brouillons est prête, quand une étape de traitement échoue et quand une publication échoue. Il n'y a pas de notification push en V1, faute de PWA et d'app native.
- La notification d'échec nomme l'étape, la cause et l'action possible (renvoyer un rush, corriger un script, relancer, rejouer une publication).
- regie ne fait jamais de nouvelle tentative automatique après un échec ; seul l'utilisateur relance (FR-33) ou rejoue (FR-44).

#### FR-33 : Relancer
Un utilisateur peut relancer une étape en échec sans renvoyer ses rushes, tant qu'ils ne sont pas purgés (FR-52) ; l'historique des tentatives est conservé.
- Une vidéo dont la régénération ou le rendu échoue passe « en échec de traitement » ; une relance réussie lui rend son statut précédent.

### 4.7 Fil de relecture

**Description :** l'écran où l'on passe le plus de temps. Plein écran au téléphone comme à l'ordinateur, il enchaîne les brouillons d'une série ; on garde ou on jette d'un geste, on corrige par le texte ou à la voix, on choisit entre trois variantes. Aucune timeline en V1. Réalise UJ-1, UJ-3.

#### FR-34 : Parcourir le fil
Un utilisateur parcourt les brouillons d'une série en plein écran, lecture automatique avec le son, et voit leur numéro dans la série.

#### FR-61 : Relecture sur version allégée
regie sert dans le fil une version allégée de chaque brouillon, adaptée au réseau mobile (NFR-33). Réalise UJ-1.
- L'export et la publication utilisent toujours le rendu complet 1080×1920, tiré des rushes d'origine.

#### FR-35 : Garder ou jeter
Un utilisateur garde un brouillon en le glissant d'un côté, le jette en le glissant de l'autre ; un bouton visible fait la même chose pour qui ne peut pas glisser.
- Un brouillon jeté se récupère jusqu'à la purge des rushes de sa séance (FR-52) ; il est ensuite supprimé.

#### FR-36 : Corriger par le texte
Un utilisateur lit la transcription d'un brouillon, barre une phrase pour la couper de la vidéo, la rétablit, et corrige un mot de sous-titre ou un texte à l'écran ; le brouillon se met à jour sans repasser par la file complète.
- Les zones douteuses (FR-60) sont surlignées et proposées en premier.
- Une vidéo prête corrigée redevient « gardée » et suit de nouveau le circuit de FR-4.
- Une vidéo qui a une publication programmée ou publiée ne se corrige plus.
- La correction n'est plus possible après la purge des rushes de la séance (FR-52).

#### FR-60 : Zones douteuses
regie signale dans le fil les mots peu sûrs de la transcription, les coupes et les frontières d'idée dont il doute (phrase coupée qui pourrait être voulue, idée scindée en deux). Réalise UJ-1.
- Elles sont proposées en premier à la relecture (FR-36).

#### FR-62 : Corriger à la voix
Un utilisateur peut dicter une correction (« coupe la deuxième phrase », « raccourcis l'intro ») ; regie la transcrit sur le serveur et l'applique comme une correction par le texte, avec le même aperçu. Réalise UJ-1.
- La correction à la voix suit les mêmes règles que FR-36, dont la limite de purge.

#### FR-37 : Choisir une variante
Un utilisateur choisit entre les trois accroches, les trois musiques (ou « sans musique »), les trois couvertures et, le cas échéant, les autres prises (FR-59), avec un aperçu en moins de 2 s [ASSUMPTION].
- Le choix d'une variante n'est plus possible après la purge des rushes de la séance (FR-52).

#### FR-38 : Légende
Un utilisateur lit et corrige la légende et les hashtags proposés à partir du gabarit et de la transcription ; leur nombre respecte les bornes du réseau visé.

### 4.8 Validation

**Description :** dans un espace de marque où la validation est activée (FR-4), une vidéo gardée attend l'accord d'un membre autre que son auteur avant d'être prête. Réalise UJ-3.

#### FR-39 : Demander et donner la validation
Un membre autre que l'auteur voit les vidéos « à valider » dans son fil, en valide une ou la renvoie avec un commentaire. Réalise UJ-3.
- Une vidéo validée devient « prête ».
- Une vidéo renvoyée redevient « gardée » et revient dans le fil de son auteur, commentaire joint ; elle repasse « à valider » quand l'auteur la corrige ou la soumet de nouveau.
- Une vidéo corrigée après validation repasse « à valider » (FR-36).

### 4.9 Export et publication

**Description :** une vidéo prête se télécharge toujours. Sur les comptes réseau des espaces qui ont le droit de publication, elle se publie maintenant ou à une heure choisie, sans jamais partir deux fois. Une vidéo peut avoir plusieurs publications, une par compte réseau. Réalise UJ-1, UJ-2, UJ-3.

#### FR-40 : Export
Tout utilisateur peut télécharger une vidéo prête au format vertical attendu par les réseaux, avec sa légende et sa couverture. Réalise UJ-1.
- Le fichier exporté ne porte aucun filigrane de regie.

#### FR-41 : Comptes réseau
Le propriétaire d'un espace qui a reçu le droit de publication de l'administrateur de l'instance (FR-70) peut connecter un compte par réseau parmi Instagram Reels, Page Facebook, TikTok et YouTube Shorts. La connexion se fait dans l'interface uniquement. Réalise UJ-2.
- Il voit l'échéance de chaque connexion, est prévenu dans l'interface et par courriel 7 jours avant qu'elle expire, puis la veille [ASSUMPTION], et peut reconnecter.
- En V1, l'administrateur n'accorde le droit de publication qu'à ses propres espaces, faute d'agrément des réseaux pour des tiers.
- TikTok publie en privé tant que l'application n'est pas auditée ; YouTube Shorts publie en privé tant que l'application n'est pas vérifiée.

#### FR-42 : Publier ou programmer
Le propriétaire de l'espace, ou un membre à qui il a accordé le droit de publier (FR-3), crée une publication depuis une vidéo prête vers un compte connecté de l'espace, la publie maintenant ou la programme à une date et une heure de Paris. Réalise UJ-2, UJ-3.
- Avant création, regie vérifie la vidéo contre les bornes du réseau visé et lit le quota restant.
- Une même vidéo peut avoir une publication par compte connecté.

#### FR-63 : Réglages TikTok
Avant d'envoyer une vidéo vers un compte TikTok, l'utilisateur qui publie choisit le niveau de confidentialité parmi ceux que le compte permet et déclare si la vidéo est un contenu commercial (sa marque ou une marque partenaire). Réalise UJ-2.
- Il peut aussi envoyer la vidéo en brouillon dans l'app TikTok pour y poser un son tendance ; la publication finit alors « envoyée en brouillon ».

#### FR-43 : Exécution des publications programmées
regie exécute automatiquement les publications programmées à l'heure dite, y compris après un redémarrage, et n'envoie jamais deux fois la même publication.

#### FR-44 : Résultat d'une publication
regie conclut chaque publication : « publiée », avec l'identifiant et le lien rendus par le réseau, ou « en échec », avec la cause. Il n'y a pas de nouvelle tentative automatique ; l'échec est notifié dans l'interface et par courriel (FR-32).
- L'utilisateur peut rejouer une publication en échec ; l'historique des tentatives est conservé.
- Il peut annuler une publication programmée qui n'est pas partie (elle passe « annulée ») ou la déplacer.
- Le statut d'une publication ne change pas celui de sa vidéo.

#### FR-45 : Bibliothèque des vidéos
Un utilisateur liste ses vidéos et publications par espace, statut de vidéo, statut de publication, réseau et période.
- Une vidéo dont aucune publication n'est publiée peut être supprimée.
- Une vidéo qui a au moins une publication publiée ne peut pas être supprimée : elle est archivée (statut « archivée »), sauf suppression du compte (FR-53).

### 4.10 MCP et API privée

**Description :** tout ce que fait l'interface, Claude le fait par le MCP et une future app native par l'API privée, avec le même résultat, sans jamais toucher un secret. Réalise UJ-2.

#### FR-46 : Jetons
Un utilisateur crée des jetons d'accès depuis l'interface ; chaque jeton est affiché une seule fois et révocable. Aucune requête au MCP ni à l'API privée n'aboutit sans jeton valide.
- Un jeton n'ouvre que les espaces dont son utilisateur est membre, avec les droits de cet utilisateur.
- Un jeton peut être limité à un espace et à une action (par exemple le rejeu de scripts, FR-19).

#### FR-47 : Parité à trois
Toute action métier de l'interface existe au MCP et à l'API privée avec le même résultat.
- Exceptions déclarées : la saisie et la lecture des secrets (identifiants de démo, clés d'application), la connexion des comptes réseau, les réglages de l'administrateur de l'instance, qui restent dans l'interface ; le script depuis une phrase (FR-14), qui n'existe que par le MCP.
- Aucun outil MCP ni point de l'API ne lit, n'écrit ni ne renvoie un secret.

#### FR-48 : Erreurs structurées
Une erreur rendue par le MCP ou l'API porte un code stable, un message en français et le contexte utile (objet, étape, valeur fautive), sans secret.

#### FR-64 : Lire un montage
Un utilisateur lit la structure d'un brouillon ou d'une vidéo par l'interface, le MCP ou l'API : recette, segments retenus (rush, début, fin), transcription, textes à l'écran, musique, couverture, zones douteuses. Réalise UJ-2.

#### FR-65 : Référence du MCP et de l'API
regie sert une référence des outils du MCP et des points de l'API privée, générée depuis le code à chaque version, avec un exemple de demande à Claude par parcours. Réalise UJ-2.

#### FR-66 : Journal d'audit consultable
Un utilisateur consulte le journal d'audit de ses actions ; le propriétaire, celui de son espace ; l'administrateur de l'instance, celui des réglages de l'instance. Les filtres portent sur la période, l'utilisateur, l'origine (interface, MCP, API) et l'objet.

### 4.11 Bibliothèque musicale

**Description :** regie embarque un catalogue de musiques libres de droits, utilisables commercialement sur tous les réseaux visés, parmi lesquelles le montage choisit ses trois propositions (FR-24). Réalise UJ-1.

#### FR-49 : Catalogue et licences
Chaque morceau du catalogue porte sa source, sa licence et l'attribution exigée ; seuls des morceaux dont la licence autorise l'usage commercial sans redevance y entrent.
- Quand la licence demande une attribution, regie l'ajoute à la légende proposée.
- Un morceau proposé par un utilisateur n'entre au catalogue qu'après vérification de sa licence par l'administrateur de l'instance.

#### FR-50 : Ambiance
Le gabarit d'un espace peut indiquer des ambiances préférées (énergique, calme, sans musique par défaut) qui orientent les trois propositions.

### 4.12 Données personnelles et obligations légales

**Description :** des personnes confient leurs rushes et leur visage à regie. En V1, regie respecte le minimum légal, sans promesse de confidentialité au-delà : pages légales, durée de conservation, effacement, copie des données, point de contact, accès au code source.

#### FR-51 : Pages légales
regie sert publiquement ses conditions d'utilisation et sa politique de confidentialité dès la bêta ; la création de compte demande leur acceptation.
- Les conditions d'utilisation affirment que l'utilisateur garde la propriété de ses rushes et de ses vidéos ; regie ne s'accorde que les droits nécessaires au service.

#### FR-52 : Durée de conservation
regie purge les rushes d'une séance 30 jours après que tous ses brouillons ont été gardés ou jetés. Il conserve le montage et le rendu des vidéos gardées tant que le compte existe.
- La date de purge s'affiche sur la séance et sur chacun de ses brouillons dès que le délai commence.
- Après la purge, ne sont plus possibles : refaire (FR-29), corriger par le texte ou à la voix (FR-36, FR-62), choisir une variante (FR-37), régénérer avec un nouveau gabarit (FR-8), relancer une étape qui lit les rushes (FR-33), récupérer un brouillon jeté (FR-35). Les brouillons jetés sont supprimés.
- Exporter, publier, programmer et archiver restent possibles.
- Une séance dont les brouillons ne sont jamais tous triés est purgée 60 jours après la livraison de sa série ; un courriel la rappelle à 30 jours. Les brouillons déjà rendus restent téléchargeables jusqu'à la purge.
- Pour une capture, la purge porte sur l'enregistrement ; le script d'actions reste et peut être rejoué.

#### FR-53 : Suppression du compte
Un utilisateur peut supprimer son compte ; ses rushes, brouillons, vidéos, scripts et secrets sont effacés, à l'exception des traces d'audit exigées par la loi.
- Un espace de marque partagé revient à son propriétaire ; si le propriétaire part, l'espace et son contenu sont supprimés après avertissement des membres, qui peuvent d'abord télécharger les vidéos prêtes.

#### FR-67 : Lien vers le code source
Chaque page de regie donne un lien vers le code source de la version en service, comme l'exige la licence AGPL-3.0.

#### FR-68 : Copie de ses données
Un utilisateur peut télécharger une archive de ses données : compte, vidéos prêtes, montages, scripts d'actions, légendes, sans aucun secret.

#### FR-69 : Point de contact et signalement
regie publie un point de contact pour signaler un contenu illicite ou exercer un droit sur ses données. L'administrateur de l'instance reçoit les signalements et peut suspendre l'espace en cause.

### 4.13 Administration de l'instance

**Description :** l'instance hébergée a besoin de réglages qui ne relèvent d'aucun espace de marque : clés des réseaux, envoi des courriels, droit de publication. Ils reviennent à l'administrateur de l'instance. Réalise UJ-2.

#### FR-70 : Administrateur de l'instance
regie a un rôle d'administrateur de l'instance, distinct du propriétaire d'un espace ; en V1, Benjamin le tient. Réalise UJ-2.
- L'administrateur est désigné à l'installation de l'instance ; aucune action de l'interface, du MCP ni de l'API ne donne ce rôle.
- Il accorde ou retire le droit de publication à un espace de marque (FR-41).
- Il saisit les clés d'application (FR-71), vérifie les morceaux proposés (FR-49), traite les signalements (FR-69) et peut suspendre les nouvelles inscriptions (FR-1).
- Ce rôle ne donne aucun accès aux contenus d'un espace dont il n'est pas membre (FR-5).

#### FR-71 : Clés d'application
L'administrateur de l'instance saisit, remplace et teste les clés d'application de chaque réseau (Instagram et Page Facebook, TikTok, YouTube) et les paramètres du service d'envoi de courriels, dans l'interface seulement. Réalise UJ-2.
- Une clé enregistrée n'est jamais réaffichée ; seul son état est visible (présente, dernier test réussi ou cause de l'échec).
- Aucune clé ne se lit ni ne s'écrit par le MCP ou l'API privée (FR-47).
- Les clés sont rangées au coffre (NFR-15).

## 5. Exigences transverses

Chaque exigence porte une valeur mesurable et sa vérification. Aucune ne nomme de technologie : les choix techniques relèvent de l'architecture.

**Charge nominale** : 20 utilisateurs actifs (ayant envoyé une séance dans les 7 derniers jours), chacun envoyant jusqu'à 3 séances de 10 min de rushes par semaine [ASSUMPTION sur le volume par utilisateur].

### 5.1 Performance et file

| ID | Exigence | Vérification |
|----|----------|--------------|
| NFR-1 | Aucune page, réponse MCP ou réponse de l'API n'attend la fin d'un envoi, d'une transcription, d'une capture ou d'un rendu ; réponse en moins de 500 ms au 95e centile hors téléchargement, à charge nominale. | Test de charge à charge nominale sur les points d'entrée pendant un rendu en cours. |
| NFR-2 | Une série de brouillons est prête en moins de 15 min pour 10 min de rushes en 1080p, file vide. | Chronométrage sur un jeu de rushes de référence, à chaque version ; une version qui dépasse le seuil est refusée. |
| NFR-3 | Le temps restant affiché (FR-12, FR-31) s'écarte de moins de 30 % du temps réel dans 80 % des cas. | Comparaison journalisée estimé / réel sur les 50 derniers traitements. |
| NFR-4 | La file sert les utilisateurs à tour de rôle : aucun utilisateur ne fait attendre les autres plus d'un traitement complet. | Test avec trois utilisateurs envoyant chacun trois séances. |
| NFR-5 | La relecture d'un brouillon démarre en moins de 2 s sur un téléphone en 4G, sur la version allégée (FR-61). | Mesure sur un téléphone de milieu de gamme, débit bridé à 10 Mbit/s. |
| NFR-6 | Une correction par le texte (FR-36) se voit dans l'aperçu en moins de 10 s. | Chronométrage sur un brouillon de 60 s. |
| NFR-32 | À charge nominale, aucune séance n'attend plus de 1 h avant le début de son traitement. | Test de charge simulant la charge nominale sur une semaine condensée ; attente maximale relevée par séance. |
| NFR-33 | La version allégée d'un brouillon de 60 s pèse moins de 15 Mo [ASSUMPTION]. | Mesure sur les brouillons du jeu de rushes de référence. |

### 5.2 Fiabilité

| ID | Exigence | Vérification |
|----|----------|--------------|
| NFR-7 | Tâches, file, envois en cours et publications programmées survivent à un redémarrage du serveur. | Test : redémarrage forcé pendant un envoi, un rendu et avant une publication programmée. |
| NFR-8 | Une publication programmée part dans la minute qui suit son heure ; après un arrêt, celles manquées depuis moins de 2 h partent au démarrage, les autres passent en échec avec leur cause. | Test d'horloge simulée, dont le passage à l'heure d'été et à l'heure d'hiver à Paris. |
| NFR-9 | Zéro double envoi d'une même publication, même en cas de coupure pendant l'envoi. | Test d'injection de coupure entre l'envoi et la réponse du réseau. |
| NFR-10 | 100 % des échecs (traitement, capture, publication) sont visibles avec leur cause et une action ; aucun échec silencieux. | Test automatisé qui injecte un échec à chaque étape de traitement et dans chaque connecteur, puis vérifie la cause, l'action proposée et la notification. |
| NFR-11 | Chaque type de tâche longue a un délai de garde ; une tâche qui le dépasse passe en échec avec sa cause. Délais [ASSUMPTION] : contrôle à réception 5 min ; transcription 3 × la durée des rushes, au moins 10 min ; montage d'une séance 30 min ; rendu d'un brouillon 15 min ; capture 15 min ; voix de synthèse 10 min ; appel à un réseau 10 min. | Test avec une tâche bloquée par type. |
| NFR-12 | Deux rendus des mêmes entrées (FR-30) produisent des montages identiques : mêmes segments, mêmes textes, même durée à 40 ms près. | Test de reproductibilité automatisé à chaque version. |
| NFR-13 | Les données sont sauvegardées chaque jour ; perte maximale de 24 h, restauration complète en moins de 4 h [ASSUMPTION] ; une restauration complète est testée chaque mois. | Rapport de restauration daté et chronométré dans le journal d'exploitation. |
| NFR-34 | Le service est disponible 99 % du temps sur chaque mois, hors maintenance annoncée dans l'interface. | Sonde externe toutes les minutes sur la page d'accueil et un point de l'API ; rapport mensuel. |

### 5.3 Sécurité et confidentialité

| ID | Exigence | Vérification |
|----|----------|--------------|
| NFR-14 | Zéro secret en clair : base, journaux, dépôt, réponses de l'interface, du MCP et de l'API. | Scan de secrets bloquant à chaque commit ; test qui cherche les valeurs connues des secrets de test dans la base, les journaux et les réponses. |
| NFR-15 | Les secrets sont chiffrés avec un chiffrement authentifié ; sans clé maîtresse valide, regie refuse de démarrer en nommant la cause (clé absente, clé invalide) sans en afficher la valeur ; le format chiffré est versionné ; la clé maîtresse peut être remplacée, tous les secrets étant rechiffrés sans perte. | Test de démarrage sans clé et avec une clé fausse ; test de remplacement de la clé maîtresse. |
| NFR-16 | Aucune donnée d'un utilisateur ni d'un espace n'est lisible par un autre, par l'interface, le MCP ou l'API. | Suite de tests de cloisonnement sur chaque point d'entrée, avec deux comptes. |
| NFR-17 | Toute route est sous session ou jeton, sauf une liste publique énumérée : connexion, inscription, mot de passe oublié, pages légales, point de contact, lien vers le code source, adresses signées de NFR-18. | Test qui compare les routes servies à la liste. |
| NFR-18 | Une vidéo n'est jamais servie publiquement, sauf par une adresse signée, liée à une publication et expirant en moins de 1 h. | Test d'accès sans signature et après expiration. |
| NFR-19 | Une capture s'exécute isolée : aucun accès au réseau interne, aux fichiers d'un autre utilisateur ni aux secrets hors ceux de son application ; navigation hors des hôtes autorisés refusée et tracée. | Test avec un script qui tente chacun de ces accès. |
| NFR-20 | Mots de passe stockés en hachage salé dont le coût dépasse 100 ms par tentative sur le serveur ; au-delà de 5 échecs en 15 min, le compte est freiné puis bloqué temporairement, et l'échec tracé. | Test de connexion et mesure du coût du hachage. |
| NFR-21 | Toute action qui modifie l'état et toute tentative de publication est consignée dans un journal en ajout seul, avec l'utilisateur, l'origine (interface, MCP, API) et l'identifiant du jeton, sans secret. | Test : une action par point d'entrée, puis lecture du journal ; tentative de modification refusée. |
| NFR-35 | Aucune page ne charge de ressource d'un tiers ; aucun rush, transcription ni rendu ne quitte le serveur, sauf vers un réseau de publication choisi par l'utilisateur. | Liste des appels sortants des pages et du serveur comparée à la liste autorisée, à chaque version. |

### 5.4 Accessibilité, appareils et ton

| ID | Exigence | Vérification |
|----|----------|--------------|
| NFR-22 | Toutes les pages fonctionnent du téléphone de 360 px de large à l'ordinateur, sans défilement horizontal. | Tests visuels à 360, 768 et 1 280 px. |
| NFR-23 | Contraste du texte d'au moins 4,5:1 ; aucune information portée par la couleur seule. | Contrôle automatique du contraste à chaque commit. |
| NFR-24 | Sur ordinateur, tout se fait au clavier avec un focus visible ; sur téléphone, chaque geste a un bouton équivalent. | Parcours UJ-1 et UJ-3 au clavier seul et sans geste. |
| NFR-25 | Dates et heures affichées et programmées en heure de Paris, sans décalage au changement d'heure. | Test aux deux changements d'heure annuels. |
| NFR-36 | Les textes de l'interface et des courriels tutoient, emploient le vocabulaire d'une créatrice et non celui d'un monteur, et annoncent les heures en clair (« Tes 3 vidéos sont prêtes », « 3 brouillons prêts vers 18 h 40 ») ; aucun terme de la liste des mots interdits (timeline, keyframe, codec…). | Contrôle automatique des textes de l'interface contre la liste des mots interdits, à chaque version. |

### 5.5 Liberté, intégrations et exploitation

| ID | Exigence | Vérification |
|----|----------|--------------|
| NFR-26 | 100 % des dépendances, modèles d'IA et voix ont une licence libre autorisant l'usage commercial ; les musiques sont libres de droits avec une source vérifiable ; aucun appel à un service d'IA en nuage. | Contrôle des licences bloquant à chaque commit ; liste des appels sortants comparée aux réseaux autorisés. |
| NFR-27 | Chaque réseau passe par un connecteur isolé ; les bornes de chaque réseau (durée, poids, légende, hashtags) et les seuils des gardes (contraste, taille du texte, marges de zone sûre par réseau, FR-28) sont dans un fichier versionné et testé. | Tests des bornes et des seuils par réseau. |
| NFR-28 | Chaque action du MCP et de l'API appelle le même service que l'interface ; un test de parité échoue si une action manque d'un côté ou si la référence (FR-65) diverge. | Test de parité et de dérive automatisé. |
| NFR-29 | Un changement incompatible du MCP ou de l'API est annoncé une version avant d'être appliqué. | Journal des changements vérifié à chaque version. |
| NFR-30 | Au démarrage, regie contrôle ses prérequis (outils de traitement, modèles locaux, clé maîtresse) et refuse de démarrer en nommant celui qui manque. | Test de démarrage avec chaque prérequis retiré. |
| NFR-31 | Une mise à jour applique ses migrations de façon atomique, sans perdre la file, les envois en cours ni les publications programmées. | Test de mise à jour pendant une file chargée. |
| NFR-37 | Les mesures d'usage (gestes, temps de relecture, corrections, « refaire ») sont enregistrées sur le serveur de regie, sans service d'analyse tiers. | Liste des appels sortants ; présence des mesures de SM-1 et SM-2 en base après un parcours UJ-1. |

### 5.6 Qualité du montage

| ID | Exigence | Vérification |
|----|----------|--------------|
| NFR-38 | La transcription a un taux d'erreur de mots d'au plus 10 % [ASSUMPTION] sur le jeu de rushes français de référence. | Mesure sur le jeu de référence, à chaque version de modèle. |
| NFR-39 | Sous la voix, la musique reste au moins 12 dB plus basse [ASSUMPTION]. | Mesure du niveau voix / musique sur les brouillons du jeu de référence. |

## 6. Non-objectifs

- Timeline et montage image par image : V2.
- Capture d'apps mobiles dans les simulateurs iOS et Android : V2.
- Publication sur les comptes de tiers : V2, après agréments Meta et TikTok.
- X et LinkedIn : non prévus.
- Application native, PWA, notifications push : plus tard.
- Second facteur d'authentification : hors V1.
- Recettes paramétrables par l'utilisateur : hors V1.
- Haute disponibilité par serveurs redondants : hors V1.
- Interface dans une autre langue que le français : hors V1.
- Vidéos longues (au-delà de 3 min) et outils pour monteurs professionnels.
- Statistiques d'audience.
- Toute IA en nuage et toute brique sous licence payante ou conditionnelle.
- Promesse de confidentialité au-delà du minimum légal.

## 7. Périmètre de la V1

### 7.1 Dans la V1

- Comptes ouverts et espaces de marque partagés avec validation (§4.1) ;
- gabarit (§4.2) ;
- envoi des rushes (§4.3) ;
- capture par script d'actions (§4.4) ;
- montage automatique avec trois recettes (§4.5) ;
- file et notifications (§4.6) ;
- fil de relecture adapté au téléphone et à l'ordinateur (§4.7) ;
- validation (§4.8) ;
- export pour tous et publication vers Instagram Reels, Page Facebook, TikTok et YouTube Shorts pour les espaces qui ont le droit de publication (§4.9) ;
- MCP et API privée (§4.10) ;
- bibliothèque musicale (§4.11) ;
- données personnelles et obligations légales (§4.12) ;
- administration de l'instance (§4.13).

### 7.2 Hors V1

Voir §6. Le noyau commun, la programmation et le fil de relecture ne glissent jamais. En cas de conflit de calendrier, la qualité du premier brouillon passe avant l'ajout de fonctions (§1).

### 7.3 Ordre de livraison

1. **Noyau commun** : comptes et espaces (§4.1), envoi des rushes (§4.3), coupe des silences (FR-21), sous-titres (FR-22), gabarit (§4.2), fil de relecture (§4.7) et export (FR-40).
2. **Démos d'apps de Benjamin** : capture par script d'actions (§4.4), recette démo d'app, zoom et voix de synthèse (FR-26, FR-27).
3. **Recettes face caméra et lifestyle sur musique** : découpage par idée, meilleure prise, montage sur musique, textes à l'écran (FR-20, FR-57 à FR-59), pour la bêta des influenceuses.
4. **Publication** : administration de l'instance (§4.13), comptes réseau, publication et programmation (§4.9), validation (§4.8).

Les démarches d'agrément Meta et TikTok sont lancées dès l'étape 1 (voir Questions ouvertes).

## 8. Indicateurs de réussite

SM-1 à SM-4 portent sur la bêta ; SM-5 prépare l'ouverture publique.

| ID | Indicateur | Cible | Mesure |
|----|------------|-------|--------|
| SM-1 | Brouillons publiables sans retouche | 7 sur 10 | Part des brouillons gardés sans correction par le texte ni « refaire » ; question « Tu la publierais telle quelle ? » en mesure qualitative. |
| SM-2 | Temps de relecture | Moins de 2 min par vidéo publiée | Temps passé dans le fil de relecture, divisé par le nombre de vidéos prêtes. |
| SM-3 | Adoption | Benjamin et 2 autres personnes, dont au moins une influenceuse de la bêta, publient chaque semaine pendant 4 semaines sans repasser par CapCut | Vidéos prêtes ou publiées par utilisateur et par semaine ; question hebdomadaire sur l'outil de montage utilisé. |
| SM-4 | Démos à jour | 100 % des démos rejouées à chaque mise en production de l'app | Rejeux réussis / mises en production signalées. |
| SM-5 | Activation | 50 % des inscrits exportent une vidéo dans les 7 jours [ASSUMPTION] | Inscriptions et premiers exports par semaine d'inscription. |

**Contre-indicateurs** (à surveiller pour ne pas tricher sur les cibles) :

- Taux de « refaire » supérieur à 1 séance sur 3 : le montage rate son intention.
- Brouillons gardés puis jamais publiés : SM-1 gonflé par des vidéos médiocres.
- Échecs de traitement ou de publication supérieurs à 5 % : la fiabilité passe avant la vitesse.
- Recherche d'une timeline ou abandon dans le fil : la relecture ne suffit pas.

## 9. Questions ouvertes

1. **Modèle économique** : gratuit ou payant, décidé après la bêta. Bloque : sortie de bêta.
2. **Voix de synthèse** : choix d'une voix sous licence réellement libre autorisant l'usage commercial, validée sur deux vidéos test (FR-27). Bloque : étape 2 de la livraison.
3. **Agréments Meta et TikTok** : démarches à lancer dès le début de la V1, sans attendre la V2 ; calendrier et prérequis de la publication pour des tiers. Bloque : V2.
4. **Capacité du serveur** : chronométrage qui confirme ou corrige NFR-2 et NFR-32, et tient un modèle de langage local pour le découpage, les accroches, « refaire » et la correction à la voix. Bloque : architecture.

## 10. Index des hypothèses

| Hypothèse | Où | À confirmer par |
|-----------|----|-----------------|
| Une série de brouillons en moins de 15 min pour 10 min de rushes | NFR-2 | Chronométrage sur le serveur de Benjamin |
| H1 — On accepte d'attendre un brouillon plutôt que de monter tout de suite | FR-12, FR-31 | Tests utilisateurs, vagues 1 et 2 |
| H2 — Glissement et édition par le texte suffisent sans timeline, 7 fois sur 10 | FR-35, FR-36, SM-1 | Tests utilisateurs, vagues 1 et 2 |
| H3 — Trois variantes aident à décider au lieu de ralentir | FR-23 à FR-25, FR-37 | Tests utilisateurs, vagues 1 et 2 |
| H4 — Un brouillon automatique soutient la comparaison avec CapCut | SM-1, SM-3 | Tests utilisateurs, vague 2 |
| Les influenceuses utilisent l'interface, pas Claude | §2, UJ-1 | Tests utilisateurs, vague 2 |
| Le gain de temps les motive, pas le prix ni la licence | §1, §2 | Tests utilisateurs, vague 2 |
| Elles préfèrent filmer plutôt que monter | §2.1, UJ-1 | Tests utilisateurs, vague 2 |
| Un modèle de langage local tient NFR-2 sur le serveur | FR-14, FR-20, FR-23, FR-29, FR-62 | Chronométrage sur le serveur de Benjamin |
| Volume par utilisateur de la charge nominale : 3 séances de 10 min par semaine | §5, NFR-1, NFR-32 | Mesures d'usage de la bêta (NFR-37) |
| Lien de mot de passe oublié valable 1 h | FR-54 | Benjamin |
| Lien d'invitation valable 7 jours | FR-3 | Benjamin |
| Envoi interrompu reprenable 24 h | FR-10 | Benjamin |
| Silence coupé au-delà de 0,7 s | FR-21 | Jeu de rushes de référence |
| Gardes par défaut : contraste 4,5:1, capitales de 48 px, zone sûre 880×1220 à (0, 220) | FR-28, NFR-27 | Rendus de test sur chaque réseau |
| Aperçu d'une variante en moins de 2 s | FR-37 | Chronométrage sur téléphone |
| Avertissement d'expiration : 7 jours puis la veille | FR-41 | Benjamin |
| Délais de garde par type de tâche | NFR-11 | Durées mesurées sur le jeu de référence |
| Perte maximale de 24 h, restauration en moins de 4 h | NFR-13 | Premier test de restauration |
| Version allégée de moins de 15 Mo pour 60 s | NFR-33 | Mesure avec NFR-5 |
| Taux d'erreur de mots d'au plus 10 % | NFR-38 | Jeu de rushes français de référence |
| Musique au moins 12 dB sous la voix | NFR-39 | Écoute sur le jeu de référence |
| Activation : 50 % des inscrits exportent en 7 jours | SM-5 | Benjamin |
| Valeurs proposées en atelier, sans validation consignée : 500 ms (NFR-1), 30 % / 80 % (NFR-3), 2 s (NFR-5), 10 s (NFR-6), 2 h (NFR-8), 40 ms (NFR-12), 1 h (NFR-18), 100 ms et 5 échecs en 15 min (NFR-20) | NFR-1 à NFR-20 | Benjamin |

## 11. Risques

| Risque | Parade dans ce PRD |
|--------|--------------------|
| Brouillon médiocre : retour aux outils habituels | Principes produit (§1), recettes et meilleure prise (FR-56, FR-59), zones douteuses (FR-60), SM-1 |
| Aucune porte d'entrée commode au téléphone | Envoi depuis le téléphone (FR-9), version allégée (FR-61), NFR-22 |
| Sons tendance impossibles à poser | Variante « sans musique » (FR-24), envoi en brouillon TikTok (FR-63), export (FR-40) |
| Publication pour des tiers bloquée par les agréments | Export pour tous (FR-40), droit de publication par espace (FR-41), démarches lancées dès l'étape 1 (§7.3) |
| Lenteur ou perte de rushes | Envoi reprenable (FR-10), version allégée (FR-61), NFR-2, NFR-7, NFR-13, NFR-32 |
