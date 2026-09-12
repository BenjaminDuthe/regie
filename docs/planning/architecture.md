---
stepsCompleted: ['step-01-init', 'step-02-context', 'step-03-starter', 'step-04-decisions']
inputDocuments:
  - 'docs/planning/prd.md'
  - 'docs/planning/prd-validation-report.md'
  - 'MANDAT.md'
  - 'maquette/public/*.html (maquette UX validée le 2026-09-08)'
  - 'saas-souverain:marketing/video/moteur/{format,scenes,montage,rendu,ffmpeg,images}.mjs'
  - 'saas-souverain:marketing/video/generer.mjs'
workflowType: 'architecture'
project_name: 'regie'
user_name: 'Benjaminduthe'
date: '2026-09-08'
---

# Document de décisions d'architecture — regie

_Ce document se construit pas à pas, par découverte collaborative. Chaque section est ajoutée au fil des décisions prises ensemble._

## Analyse du contexte du projet

### Vue d'ensemble des exigences

**Exigences fonctionnelles** — 49 exigences en 7 familles : scénarios et capture (FR1-6),
génération et éditeur (FR7-14), librairie (FR15-18), publication et programmation (FR19-29),
réseaux et comptes (FR30-36), pilotage par MCP (FR37-42), administration, sécurité et audit
(FR43-49).

Trois d'entre elles commandent la structure :

- **FR38 — parité outil MCP ⇔ interface.** Claude exécute par MCP toute action des domaines
  scénarios, générations, vidéos, publications et audit, *avec le même résultat que par
  l'interface*. Cela interdit l'architecture la plus courante — une interface qui appelle ses
  propres routes et un serveur MCP qui réimplémente la même logique. Il n'existe qu'une couche
  de services, appelée par les deux.
- **FR7 et FR40 — rien de long ne s'exécute dans une requête.** Toute opération longue rend
  aussitôt un identifiant et un état interrogeable, que l'appel vienne de l'interface ou de MCP.
- **FR12 — les gardes de rendu n'ont aucune échappatoire.** Une vidéo hors garde de lisibilité
  ou de zone sûre est refusée, et *aucun chemin, interface ou MCP, ne permet de forcer*.

Les autres familles se répartissent en domaines faiblement couplés — scénarios, génération,
librairie, publication, comptes, audit — qui dessinent directement les frontières de services
attendues.

**Exigences non fonctionnelles** — 37 exigences en 6 familles : performance, fiabilité,
sécurité, accessibilité, intégration, exploitation et maintenabilité. Celles qui pèsent sur la
structure :

- File à une seule génération avec position affichée (NFR5).
- État persisté avant lancement, survie au redémarrage, rattrapage dans une fenêtre bornée
  (NFR8, NFR13).
- Clé d'idempotence propre à la publication sur chaque tentative d'envoi (NFR9).
- Chiffrement authentifié au repos ancré sur `REGIE_MASTER_KEY`, refus de démarrer sans elle
  (NFR16).
- Liste close de routes accessibles sans session, vérifiée par un test (NFR18).
- Journal d'audit en ajout seul, qu'aucune route ni aucun outil ne modifie (NFR21).
- Connecteurs isolés derrière la couche de services, sans import croisé (NFR28).
- Serveur MCP sur le transport Streamable HTTP du SDK officiel, épinglé (NFR33).
- Migrations versionnées appliquées au démarrage, sans étape manuelle (NFR35).
- Toute date en heure de Paris, sans décalage aux changements d'heure (NFR37).

**Échelle et complexité**

- Domaine principal : application web mono-utilisateur **et** outil pour développeur (serveur MCP).
- Niveau de complexité : **haute** — tirée par le chiffrement au repos, l'audit inaltérable,
  l'idempotence des envois et l'intégration à trois interfaces tierces. **Pas** par le volume :
  la cadence visée produit environ 160 vidéos et 470 publications par an (NFR6), ce qui ne
  contraint aucun choix technique.
- Composants architecturaux estimés : **dix** — pages serveur et îlots, couche de services,
  capture de pages, moteur vidéo porté, file et planificateur, connecteurs réseau et fichiers de
  bornes, coffre à secrets, journal d'audit en ajout seul, serveur MCP, persistance et migrations.

### Contraintes techniques et dépendances

**Héritées du moteur vidéo existant, lu intégralement (1 952 lignes) :**

- Dépendance npm unique : `playwright-core`. Binaires externes : Chromium et ffmpeg avec
  libx264. La découverte de ffmpeg est déjà paramétrable par une variable d'environnement.
- Encodage figé par contrainte de plateforme : `yuv420p`, `-loop 1 -t` par image fixe,
  `+faststart`, montage en deux passes. À porter tel quel.
- Gardes bloquantes par décision du fondateur : les contrôles de zone sûre et de lisibilité
  lèvent. Le portage préserve ce comportement — c'est ce qu'exige FR12.
- La piste audio lève explicitement : la V1 reste muette (FR8), et le point d'extension existe
  déjà.
- Le catalogue de scènes (quatre types : accroche, fin, captures, animation) définit la surface
  exacte de l'éditeur : c'est le schéma de données de FR9 à FR11.
- Deux liens au dépôt d'origine à couper au portage : les trois fichiers de polices résolus
  depuis la racine de `saas-souverain`, et la référence documentaire des couleurs de marque.
- La frontière entre la fiche vidéo et le moteur est déjà nette (un module exportant un nom et
  une liste de scènes), ce qui prépare le passage d'un fichier à un scénario stocké.

**Imposées par le mandat et le PRD :**

- Un seul runtime Node/TypeScript ; pages rendues côté serveur avec des îlots interactifs ;
  Chromium et Firefox récents, testé sur Chromium seul ; interface prévue pour au moins 1 280 px
  avec bandeau explicite en dessous.
- Toutes les données dans un seul dossier copiable — base, fichiers vidéo, médias de
  substitution, audit, coffre chiffré (NFR14) ; la clé maîtresse gardée à part.
- Dépôt public sans aucun secret ; installation en quatre étapes : clonage, `pnpm install`,
  `.env`, démarrage (NFR34).
- Aucune intelligence artificielle en V1 hors du pilotage MCP.

**Valeurs laissées ouvertes jusqu'au chronométrage de « traiteur 1 » :** durée de référence
d'une génération (NFR4), délais de garde par type de tâche (NFR10), intervalle de
rafraîchissement des pages montrant une tâche en cours (NFR3). Ces valeurs ne conditionnent
aucune décision de structure — seulement des constantes, qui seront *remplacées* par les
valeurs mesurées, jamais complétées.

### Préoccupations transverses identifiées

- **Audit** — toute action modifiant l'état et toute tentative de publication écrivent une
  entrée, avec l'origine : interface, ou identifiant du jeton MCP. Le journal ne se modifie ni
  ne s'efface (FR45, FR46, NFR21).
- **Idempotence** — chaque tentative d'envoi porte une clé propre à la publication, valable au
  travers des rejeux, des redémarrages et des rattrapages (FR23, NFR9).
- **Délai de garde** — toute tâche longue en porte un, par type ; son dépassement produit un
  échec explicite, libère la file et rend la tâche rejouable (NFR10).
- **Frontière des secrets** — les secrets entrent par l'interface seule et ne sortent par aucun
  chemin : ni MCP, ni journaux, ni base en clair. C'est la seule asymétrie assumée entre
  l'interface et le pilotage par MCP (FR30, FR31, FR39, NFR15).
- **Heure de Paris** — toute date affichée, saisie ou programmée ; un changement d'heure ne
  décale aucune publication (FR21, NFR37).
- **Parité** — chaque outil MCP appelle le service qu'appelle l'interface, et un test le
  vérifie, à l'origine près dans l'audit (FR38, NFR32).
- **Bornes des réseaux** — vérifiées deux fois, à l'entrée en librairie et avant l'acceptation
  d'une publication, contre un fichier de bornes versionné par réseau (FR17, FR20, NFR29).

## Évaluation d'un socle de départ

_Toutes les versions citées ci-dessous ont été relevées au registre npm le 2026-09-08, et non
dans un résumé de recherche : sur ce point précis, les résumés se contredisaient._

### Domaine technologique principal

**Application web rendue côté serveur avec îlots interactifs, doublée d'un outil pour
développeur.** Le PRD impose un seul runtime Node/TypeScript, des pages serveur avec îlots, un
serveur MCP en Streamable HTTP, et un **processus de longue durée** qui porte la file de
génération, le planificateur et le pilotage de sous-processus lourds (Chromium par
`playwright-core`, `ffmpeg`). Ce dernier point est décisif : ce n'est pas un site, c'est un
serveur applicatif qui rend aussi des pages.

### Socles envisagés

**1. `create-astro`, gabarit `minimal`, avec `@astrojs/node`.** Astro `7.3.1` (2026-09-03) ;
adaptateur `@astrojs/node` `11.1.5` (2026-08-31), épinglé sur `astro ^7.2.1` ; `create-astro`
`5.2.4`. C'est exactement le modèle « pages serveur et îlots » demandé, sans avoir à le
construire. L'adaptateur offre deux modes : *standalone* (Astro démarre son propre serveur et
sert les fichiers) et *middleware* (Astro exporte un `handler` monté dans notre propre serveur
Node, mais n'assure **pas** le service des fichiers statiques). Le mode middleware est celui qui
permet de faire cohabiter, dans un seul processus, les pages, le point d'entrée MCP et les
tâches longues. Réserve consignée : le ticket ouvert
[withastro/astro#15753](https://github.com/withastro/astro/issues/15753) signalait des îlots
**serveur** cassés avec l'adaptateur Node en bêta v6 ; sa clôture sur la v7 stable n'a pas été
vérifiée. Repli documenté si le cas se présente : n'utiliser que des îlots **client**
(`client:load`), qui suffisent à l'éditeur et à la librairie.

**2. Un gabarit full-stack — Next.js, SvelteKit, Remix.** Écarté. Ces socles supposent un
déploiement sans état et poussent la logique dans les routes, ce que FR38 interdit : la parité
outil MCP ⇔ interface exige une couche de services appelée par les deux, et un test la vérifie.
Ils apportent en outre un modèle de rendu bien plus lourd que ce que sept écrans réclament.

**3. Fastify `5.12.3` seul, avec un moteur de gabarits.** Techniquement valable — un vrai
processus long, un contrôle total des routes accessibles sans session (NFR18) — mais il faut
réécrire à la main le routage de pages, la construction des fichiers d'interface et
l'hydratation des îlots, c'est-à-dire tout ce qu'Astro fournit. Fastify reste pertinent **sous**
Astro en mode middleware : c'est une décision d'architecture, pas un socle de départ.

**4. Aucun socle, squelette pnpm/TypeScript écrit à la main.** C'est la maquette actuelle :
serveur Node sans dépendance, sept pages HTML, navigation recopiée dans chaque fichier. Elle a
rempli son rôle de validation UX et ne tient pas comme socle — aucune factorisation, aucune
interactivité, aucun typage.

### Socle retenu : `create-astro` (gabarit `minimal`) avec `@astrojs/node`

**Justification.** C'est le seul socle qui donne le modèle de rendu exigé sans imposer une
architecture de routes qui contredirait la parité MCP. Il est minimal par construction : le
gabarit `minimal` ne pose ni style, ni tests, ni lint, donc il ne préempte aucune décision
d'architecture. Il est activement maintenu — deux publications dans les dix jours précédant le
relevé. Et son mode middleware laisse le processus long — file, planificateur, serveur MCP —
sous notre contrôle, au lieu de nous enfermer dans le serveur d'un framework.

**Commande d'initialisation.** La racine du dépôt porte déjà `.gitignore`, `README.md`,
`MANDAT.md`, `docs/` et `maquette/` : `create-astro` ne s'exécute pas proprement sur un dossier
non vide. On génère donc à côté, puis on fusionne en préservant les fichiers existants.

```bash
pnpm create astro@latest socle-astro -- --template minimal --typescript strict --no-install --no-git --skip-houston
```

```bash
pnpm add astro@7.3.1 @astrojs/node@11.1.5 && pnpm add -D vitest@5.0.0
```

**Décisions d'architecture apportées par le socle :**

**Langage et exécution** — TypeScript en mode `strict` (option `--typescript strict`), modules
ES, `astro check` pour le contrôle de types. Astro `7.3.1` exige **Node ≥ 22.12.0** ;
`better-sqlite3` `13.0.3` exige ≥ 22 ; Vitest `5.0.0` exige `^22.12 || ^24 || >=26`. La cible
documentée pour NFR34 est donc **Node 24**, Active LTS au moment du relevé, avec Node 22
(Maintenance LTS) comme plancher toléré. Note de calendrier : à partir d'octobre 2026, Node
passe à une majeure par an et toutes les versions deviennent LTS — la distinction pair/impair
disparaît, et la formulation de NFR34 devra en tenir compte.

**Solution de style** — aucune imposée : CSS scopé par composant `.astro`, plus une feuille
commune. Le socle laisse ouverte la reprise directe de `maquette/public/style.css`.

**Outillage de construction** — Vite, fourni par Astro : rechargement à chaud en développement,
empaquetage et empreintes de contenu en production. Entrée serveur construite par défaut dans
`dist/server/entry.mjs`.

**Cadre de tests** — **aucun**. Le gabarit `minimal` n'en pose pas ; Vitest est un ajout
explicite, requis par NFR32 (test de parité outil ⇔ service) et NFR18 (liste close des routes
accessibles sans session).

**Organisation du code** — routage par fichier sous `src/pages/`, composants sous
`src/components/`, configuration dans `astro.config.mjs`, variables d'environnement typées par
`import.meta.env`. Les îlots se déclarent par directive : `client:load` pour l'hydratation
navigateur, `server:defer` pour le rendu serveur différé avec contenu de repli. Le socle
n'impose **rien** sur une couche `src/services/` : celle qu'exige FR38 s'y ajoute librement,
appelée par les pages comme par les outils MCP.

**Expérience de développement** — serveur de développement avec rechargement à chaud, contrôle
de types par `astro check`. Ni lint ni formatage : ce sont des ajouts.

**Ce que le socle ne décide pas** — et qui reste entier pour les décisions d'architecture : le
mode d'adaptateur (*standalone* ou *middleware*), la persistance (fichier ou serveur), la
cohabitation du serveur MCP dans le même processus ou dans un second, l'origine de `ffmpeg`, et
le portage du moteur vidéo existant.

**Note :** l'initialisation du projet par cette commande doit être la **première story
d'implémentation**.

## Décisions d'architecture structurantes

_Versions relevées au registre npm le 2026-09-13. Aucune estimation de durée : le rythme de mise
en œuvre ne se déduit pas de ces choix._

### Hiérarchie des décisions

**Décisions bloquantes (rien ne se code avant) :** topologie des processus · persistance · origine
du binaire `ffmpeg` · portage du moteur vidéo existant.

**Décisions structurantes (elles façonnent l'architecture sans la bloquer) :** hachage du mot de
passe et forme de la session · forme des migrations · origine du navigateur de capture · mécanique
du planificateur · journalisation.

**Décisions repoussées (assumées, avec leur raison) :** cache applicatif (une seule marque, un seul
utilisateur — SQLite suffit) · limitation de débit sur les routes internes (un seul appelant) ·
second facteur (hors V1, MANDAT) · publication multi-comptes (hors V1) · observabilité distante (le
journal local et la table d'audit couvrent la V1).

### Architecture des données

**Décision — SQLite, dans le dossier de données, via `better-sqlite3` et `drizzle-orm`.**
Versions : `better-sqlite3` 13.0.3 (2026-08-05, `engines.node >= 22`) · `drizzle-orm` 0.45.2.
_Motif._ NFR13 (survie au redémarrage) et la sauvegarde « un dossier à copier » (étape 10 du PRD)
exigent que l'état vive sur le disque, à côté des vidéos rendues. Un serveur de base séparé
contredirait l'installation en quatre étapes (NFR34). L'accès synchrone de `better-sqlite3` convient
à un processus unique servant un seul utilisateur.
_Porte sur._ Librairie, scénarios, programmation, journal d'audit, jetons chiffrés, file de tâches.
_Apporté par le socle._ Non.
_Coût assumé._ Compilation native au premier `pnpm install` ; `engines.node >= 22` s'aligne sur le
plancher déjà fixé par Astro 7.

**Décision — migrations en fichiers SQL numérotés, appliquées au démarrage.**
`0001_x.sql`, `0002_y.sql`… exécutés en ordre par un exécuteur maison tenant une table
`schema_migrations` (nom du fichier + empreinte SHA-256 + horodatage).
_Motif._ NFR35 exige des migrations versionnées appliquées au démarrage. Le SQL appliqué est celui
qu'on a écrit et relu — pas un SQL généré qu'on relit après coup ; sur SQLite, la réécriture de
table produit des migrations qu'il vaut mieux avoir écrites soi-même.
_Porte sur._ Démarrage du processus, toute évolution de schéma. _Apporté par le socle._ Non.
_Coût assumé._ Le schéma Drizzle (TypeScript) et le SQL se tiennent à jour à la main ; un test de
dérive schéma ⇔ base ferme cet écart.

**Décision — bornes de validation vérifiées à l'entrée, avec `zod` 4.5.4.**
_Motif._ FR12 exige des gardes bloquantes sans échappatoire, et le SDK MCP impose déjà `zod` en
dépendance de pair (NFR33) : un seul vocabulaire de validation pour les outils MCP, les formulaires
de l'interface et les bornes du moteur vidéo. _Porte sur._ Tous les points d'entrée.
_Apporté par le socle._ Non.

### Authentification et sécurité

**Décision — mot de passe unique haché par `scrypt` (`node:crypto`), session en cookie signé.**
Cookie `HttpOnly`, `SameSite=Lax`, `Secure` hors développement, signé par une clé dérivée de
`REGIE_MASTER_KEY` par HKDF.
_Motif._ Aucune dépendance native supplémentaire après `better-sqlite3` — c'est ce qui protège
l'installation en quatre étapes chez un tiers (NFR34). `scrypt` est un algorithme de dérivation de
mot de passe approuvé, disponible dans le runtime. Mot de passe unique, poste du fondateur, pas de
second facteur en V1 (MANDAT) : Argon2id (`@node-rs/argon2` 2.2.1) ne rachèterait pas sa dépendance
native. Sessions en base écartées : la révocation ligne par ligne est sans objet à un seul
utilisateur.
_Porte sur._ Première mise en route, toutes les routes de l'interface. _Apporté par le socle._ Non.
_Coût assumé._ Environ trente lignes écrites à la main plutôt qu'une bibliothèque.

**Décision — `REGIE_MASTER_KEY` est la racine unique des secrets ; AES-256-GCM pour les jetons.**
Les jetons OAuth des réseaux sont chiffrés au repos (NFR16). La clé vient de l'environnement, jamais
d'un fichier versionné. Absente au démarrage : refus de démarrer, message explicite.
_Motif._ NFR16 et la contrainte permanente « aucun secret hors du coffre ».
_Porte sur._ Connecteurs, écran Paramètres, sauvegarde. _Apporté par le socle._ Non.

**Décision — aucun outil MCP ne lit ni n'écrit un secret ; le jeton MCP est distinct de la session.**
Le serveur MCP n'est joignable qu'avec un jeton porteur, comparé en temps constant, stocké haché.
Les clés API et le parcours OAuth restent exclusivement dans l'interface (FR39, NFR15).
_Motif._ La vision « Claude pilote tout » s'arrête à la frontière des secrets, et c'est une décision
produit déjà prise. _Porte sur._ Route MCP, contrat des outils, écran Paramètres.

**Décision — les routes sans session sont énumérées dans le code (NFR18).**
Une liste explicite (pages CGU et confidentialité, rappels OAuth, santé) ; tout le reste passe par
la garde. La liste est un fait testable, pas une convention de nommage.

### Modèles d'API et de communication

**Décision — un seul processus Fastify 5.12.3 ; Astro monté en middleware ; MCP en route à part.**
Fastify est le serveur ; l'adaptateur `@astrojs/node` 11.1.5 est en mode `middleware` et son
`handler` est monté sur Fastify ; la route MCP (transport Streamable HTTP du SDK officiel
`@modelcontextprotocol/sdk` 1.30.0) vit dans le même processus, derrière le jeton ; la file de
génération et le planificateur tournent dans ce même processus.
_Motif._ NFR5 (une seule génération à la fois), NFR13 (survie au redémarrage), FR7/FR40 (opérations
longues qui rendent un identifiant puis un état) exigent un processus de longue durée qui détient la
file. Un second processus imposerait un protocole entre les deux, pour un seul utilisateur.
_Porte sur._ Tout. _Apporté par le socle._ Non — le socle fournit l'adaptateur, pas le choix du mode.
_Coût assumé._ En mode middleware, l'adaptateur ne sert pas les fichiers statiques : c'est à notre
serveur de servir `dist/client`.

**Décision — la logique vit dans des services ; les outils MCP et les routes HTTP sont deux façades
sur le même service.** Aucune règle métier dans une route ni dans un outil.
_Motif._ FR38 impose la parité outil ⇔ interface et NFR32 la teste : la parité n'est tenable que si
les deux appellent le même code.
_Porte sur._ `src/services/`, les routes, les outils MCP, le test de parité.

**Décision — les erreurs sont typées et nommées ; aucun échec silencieux.**
Un échec de publication, de génération ou de capture produit une entrée d'audit et un état lisible
dans l'interface (critère de succès du PRD : « aucun échec silencieux »).
_Porte sur._ File, connecteurs, moteur vidéo.

**Décision — journal applicatif structuré avec `pino` 10.3.1 ; journal d'audit en base.**
`pino` écrit du JSON sur la sortie standard (rotation par redirection). Le journal d'audit des
publications reste une table en ajout seul (NFR21) — ce sont deux journaux distincts, l'un pour
diagnostiquer, l'autre pour prouver. Aucun secret n'entre dans l'un ni dans l'autre.

### Architecture de l'interface

**Décision — pages rendues côté serveur, îlots interactifs, rafraîchissement périodique.**
Astro 7.3.1, îlots **client** (`client:load`), rafraîchissement périodique des écrans qui suivent
une tâche longue (proposition : 5 s, à confirmer à la mise au point).
_Motif._ Décision de l'étape 7 du PRD (pages serveur + îlots). Les îlots serveur (`server:defer`)
sont écartés en V1 : le ticket withastro/astro#15753 signale un défaut avec l'adaptateur Node en
bêta v6, non requalifié sur la v7 stable — on ne fonde pas l'interface dessus.
_Porte sur._ Tous les écrans. _Apporté par le socle._ Oui, pour Astro et les directives d'îlot.

**Décision — pas de bibliothèque d'état global ; l'état vit sur le serveur.**
Chaque îlot lit son état par une route qui interroge le service.
_Motif._ L'interface est un miroir de ce que le MCP peut faire : dupliquer l'état côté navigateur
créerait une seconde vérité. _Porte sur._ Librairie, éditeur, publication.

**Décision — CSS scopé Astro + une feuille commune, reprise de `maquette/public/style.css`.**
La maquette validée le 2026-09-08 est la référence visuelle ; sa feuille est le point de départ, pas
une réécriture. Disposition ordinateur ≥ 1 280 px, bandeau en dessous (NFR27).
_Porte sur._ Tous les écrans. _Apporté par le socle._ Partiellement — Astro n'impose pas de style.

**Décision — cibles de navigateur : Chromium et Firefox récents, testé sur Chromium seul.**
Décision de l'étape 7 du PRD. Socle d'accessibilité : contraste, ordre de tabulation, libellés.

### Infrastructure et déploiement

**Décision — `ffmpeg-static` 5.3.0 embarqué, repli sur un binaire système par variable
d'environnement.**
_Motif._ Version épinglée donc rendu reproductible (critère de succès du PRD), installation en
quatre étapes préservée (NFR34). _Porte sur._ Moteur vidéo, intégration continue, README.
_Coût assumé._ Environ 80 Mo à l'installation, et **la construction distribuée est sous licence
GPL : le README du dépôt public doit le mentionner.**

**Décision — `playwright` 1.63.0, Chromium téléchargé à l'installation.**
_Motif._ La version du navigateur est épinglée avec celle du paquet : deux postes rendent la même
vidéo. Un Chrome système se met à jour tout seul et ferait bouger le rendu sans qu'on ait rien
changé ; `playwright-core` + Chromium installé à part imposerait une cinquième étape d'installation,
à répéter en intégration continue.
_Porte sur._ Capture des pages de l'application, intégration continue (NFR36).
_Apporté par le socle._ Non. _Coût assumé._ Environ 150 Mo téléchargés, en plus des 80 Mo de ffmpeg.

**Décision — planificateur à réveil calculé sur la prochaine échéance.**
Le processus lit en base la plus proche échéance à venir et programme un réveil dessus ; recalcul
après chaque départ, chaque ajout et chaque modification. Au démarrage, rattrapage des échéances
dépassées dans une fenêtre bornée (2 h par défaut, réglable — étape 10 du PRD). Heure de Paris
(NFR37), changements d'heure compris : les échéances sont stockées en instant absolu, l'affichage
seul est localisé.
_Motif._ Nos échéances sont des dates uniques en base, pas des règles récurrentes : une bibliothèque
de planification `cron` (`croner` 10.0.1) paierait pour la moitié de ce qu'elle sait faire. Une
vérification toutes les minutes interrogerait la base à vide toute la journée, pour un retard
pouvant aller jusqu'à une minute. _Porte sur._ Publication programmée, redémarrage.
_Apporté par le socle._ Non.
_Coût assumé._ Le recalcul à chaque écriture est à notre charge ; un oubli et une publication part
en retard — un test le couvre.

**Décision — moteur vidéo recopié tel quel en `.mjs`, typé par ses `.d.mts` existants.**
Les sept fichiers (`format`, `scenes`, `montage`, `rendu`, `ffmpeg`, `images`, `generer` —
1 952 lignes) passent dans `regie` sans réécriture, avec leurs `.d.mts` et leurs tests unitaires.
_Motif._ Ce code est éprouvé et produit déjà des vidéos publiées ; le réécrire en TypeScript
mélangerait un portage et une refonte. `astro check` le voit à travers ses déclarations.
_Porte sur._ Génération, éditeur, tests.
_Coût assumé._ Deux styles cohabitent dans le dépôt ; le README dit lequel s'applique où.

**Décision — un seul runtime Node/TypeScript, ESM, TypeScript `strict`.**
Node 24 cible, Node 22 plancher (Astro 7 : `engines.node >= 22.12.0` ; `better-sqlite3` 13 : `>= 22`).
_Note de calendrier :_ à partir d'octobre 2026, Node passe à une majeure par an, toutes LTS — la
formulation de NFR34 devra en tenir compte.

**Décision — intégration continue GitHub Actions avec Chromium et ffmpeg (NFR36) ; tests avec
`vitest` 5.0.0.** Deux tests sont nommés par le PRD et ne se négocient pas : la **parité** outil MCP
⇔ service (NFR32) et la **dérive** entre le schéma déclaré et la base.

**Décision — installation en quatre étapes : clonage, `pnpm install`, `.env`, démarrage.**
Le premier démarrage applique les migrations, crée le dossier de données et demande le mot de passe.
_Porte sur._ README, référence des outils MCP générée depuis le code (FR42).

### Effets croisés et ordre de mise en œuvre

**Ordre imposé par les dépendances :**

1. Initialisation du socle (`create-astro` minimal + `@astrojs/node`) — première story.
2. Serveur Fastify, Astro en middleware, fichiers statiques servis, routes sans session énumérées.
3. Dossier de données, SQLite, exécuteur de migrations, `0001` de schéma initial.
4. Première mise en route : mot de passe `scrypt`, cookie signé, garde de session.
5. Coffre : `REGIE_MASTER_KEY`, AES-256-GCM, écran Paramètres.
6. Services + file de tâches (une à la fois) + états des opérations longues.
7. Route MCP derrière jeton, premiers outils, test de parité et référence générée.
8. Portage du moteur vidéo, `ffmpeg-static`, `playwright`, capture des pages.
9. Éditeur, librairie.
10. Connecteurs — Instagram d'abord (MVP), puis Facebook Page, TikTok, LinkedIn.
11. Planificateur et rattrapage au démarrage.

**Effets croisés à ne pas perdre de vue :**

- Le **processus unique** rend la file, le planificateur et le MCP solidaires : ce qui tue le
  processus arrête les trois. D'où le rattrapage borné au démarrage, qui n'est pas un confort.
- `scrypt` et le cookie signé **dépendent de `REGIE_MASTER_KEY`** : sans elle, ni session ni jeton
  déchiffrable. La clé est donc dans l'installation en quatre étapes, pas dans un écran.
- **Deux dépendances natives ou téléchargées** (`better-sqlite3`, Chromium de Playwright) plus un
  binaire embarqué (`ffmpeg`) : l'installation tierce (V1.1) se jugera sur ces trois points, et
  c'est ce qui justifie d'avoir refusé une troisième dépendance native pour le hachage.
- Le **mode middleware** nous rend responsables des fichiers statiques : un oubli ici se voit comme
  une page sans style, pas comme une erreur.
- Le **moteur en `.mjs`** impose que la frontière entre code typé et code déclaré soit nette : les
  `.d.mts` sont la seule interface, et un test de dérive les surveille.
