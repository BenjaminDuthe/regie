---
stepsCompleted: ['step-01-init', 'step-02-context', 'step-03-starter', 'step-04-decisions', 'step-05-patterns', 'step-06-structure']
inputDocuments:
  - 'docs/planning/archive/2026-09/prd.md'
  - 'docs/planning/archive/2026-09/prd-validation-report.md'
  - 'MANDAT.md'
  - 'maquette/public/*.html (maquette UX validée le 2026-09-08)'
  - 'saas-souverain:marketing/video/moteur/{format,scenes,montage,rendu,ffmpeg,images}.mjs'
  - 'saas-souverain:marketing/video/generer.mjs'
workflowType: 'architecture'
project_name: 'regie'
user_name: 'Benjaminduthe'
date: '2026-09-08'
---

> **Remplacé le 2026-10-02.** Ce document décrit l'ancienne régie (SQLite, cookie signé, stockage S3, installation en 4 étapes, ffmpeg-static, moteur `.mjs`, rendu à 1 280 px, LinkedIn, sans Safari iOS). Il ne fait plus foi. L'architecture en vigueur est le socle `docs/planning/architecture/architecture-regie-2026-10-02/ARCHITECTURE-SPINE.md`, avec son explication `architecture-expliquee.html`.


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

## Motifs d'implémentation et règles de cohérence

> **Objet.** Ces règles n'existent pas pour le style : elles existent parce que deux agents qui
> codent deux stories différentes, sans elles, produisent du code qui ne s'assemble pas. Chaque
> motif ci-dessous répond à un point où deux décisions raisonnables mènent à deux codes
> incompatibles.

### Points de conflit couverts

Vingt-deux points de décision, répartis en cinq familles : nommage (6), structure (4), format (5),
communication (3), processus (4).

Les points de conflit déjà fermés par les étapes 2 à 4 ne sont pas rouverts ici : la logique vit
dans les services, les entrées sont validées par `zod`, les erreurs sont typées et nommées, le
journal est du JSON `pino`, il n'y a aucune bibliothèque d'état global, le style reprend la feuille
commune de la maquette, et les migrations sont des fichiers SQL numérotés.

### Motifs de nommage

**Langue.** Le français, partout et sans frontière : fonctions, variables, colonnes, états, codes
d'erreur, noms d'outils MCP, noms de fichiers. Le moteur vidéo porté est déjà intégralement en
français (34 exports relevés) ; un dépôt à deux vocabulaires oblige à traduire à chaque appel, et la
frontière passerait précisément par la génération vidéo, là où le code neuf appelle le moteur le
plus souvent. Restent en anglais, par contrainte externe seulement : les mots-clés du langage, les
API de bibliothèques (`select`, `where`, `default`), et les acronymes établis (API, MCP, HTTP, JSON,
SQL, OAuth, URL, UTC).

**Base de données.** Tables au pluriel, `snake_case` : `videos`, `publications`, `comptes_reseau`,
`taches`, `scenarios`, `journal_audit`, `migrations_appliquees`. Colonnes `snake_case` : `cree_le`,
`publie_le`, `programme_pour`, `etat`, `video_id`. Clé primaire toujours `id`. Clé étrangère toujours
`<table_au_singulier>_id`.

> *Ajustement de l'étape 4* : la table de suivi des migrations y était nommée `schema_migrations`.
> Elle devient `migrations_appliquees` — aucune migration n'existe encore, le renommage ne coûte
> rien aujourd'hui et coûterait une migration de plus demain.

**TypeScript.** `camelCase` sur les mêmes mots : `creeLe`, `publieLe`, `programmePour`, `videoId`. La
traduction `snake_case` ⇔ `camelCase` a **un seul point** dans tout le dépôt : la déclaration du
schéma Drizzle. Aucun autre fichier ne fait de conversion de casse.

**Conventions de suffixe** — elles suppriment les questions à répétition :

| Forme | Sens | Exemple |
|---|---|---|
| `est…` / `a…` | booléen | `estArchivee`, `aUneSession` |
| `…Le` | instant passé | `creeLe`, `publieLe` |
| `…Pour` | échéance future | `programmePour`, `expirePour` |
| `…Ms` / `…Secondes` | durée, unité dans le nom | `dureeMs`, `delaiGardeSecondes` |
| `…Id` | identifiant d'une autre entité | `videoId`, `tacheId` |
| `TOUT_EN_MAJUSCULES` | constante de module | `ROUTES_PUBLIQUES`, `ETATS_TACHE` |

**Points d'entrée HTTP.** `/api/<ressource-au-pluriel>` pour les lectures, `/api/<ressource>/<verbe>`
pour les mutations, en français, en `kebab-case`. Le paramètre de route est **toujours** `:id`,
jamais `:videoId` :

```
GET  /api/videos                     GET  /api/videos/:id
POST /api/videos/generer             POST /api/publications/programmer
POST /api/publications/:id/annuler
```

**Outils MCP.** `<domaine>_<verbe>` en `snake_case` français, sans préfixe `regie_` (le client
préfixe déjà par le nom du serveur) : `videos_lister`, `videos_generer`, `videos_obtenir`,
`publications_programmer`, `publications_annuler`, `taches_etat`. **La règle de parité est
nominative** : à `videos_generer` correspondent exactement `services/videos.ts → genererVideo()` et
`POST /api/videos/generer`. Le test de parité (NFR32) lit cette correspondance, il ne la devine pas.

### Motifs de structure

**Organisation par couche.**

```
src/
  pages/          pages Astro servies par le serveur
  composants/     .astro partagés + îlots client:load
  services/       LA logique métier — source unique
  routes/         façade HTTP (Fastify) : valide, appelle un service, enveloppe
  mcp/            façade MCP : serveur + outils/
  connecteurs/    un dossier par réseau, aucun import croisé (NFR28)
  base/           schéma Drizzle, accès, migrations/
  moteur/         moteur vidéo porté (.mjs + .d.mts), non réécrit
  noyau/          erreurs, journal, configuration, coffre, horloge
tests/            parite.test.ts, derive-schema.test.ts (transverses uniquement)
donnees/          hors dépôt : base SQLite, médias, rendus
```

`src/routes/` et `src/mcp/outils/` se regardent en miroir : voir les deux dossiers côte à côte rend
visible une parité rompue.

**Un fichier de service par domaine**, nommé comme la ressource : `services/videos.ts`,
`services/publications.ts`, `services/scenarios.ts`, `services/parametres.ts`. Pas de
`services/index.ts` qui ré-exporte tout — l'import nomme toujours son domaine.

**Tests colocalisés.** `videos.ts` a `videos.test.ts` à côté de lui, comme le moteur porté a déjà ses
`*.unit.test.ts`. Un fichier de service sans test voisin se voit en ouvrant le dossier. Deux
exceptions, et deux seulement, dans `tests/` : le test de parité outil ⇔ service et le test de dérive
schéma ⇔ base — ils portent sur le système entier, les ranger sous un domaine mentirait sur leur
portée.

**Fichiers.** `kebab-case.ts` pour le code, `PascalCase.astro` pour les composants
(`CarteVideo.astro`, `FileTaches.astro`), `NNNN_description.sql` pour les migrations
(`0001_socle.sql`).

### Motifs de format

**Toute réponse HTTP interne porte la même enveloppe**, succès comme échec :

```ts
{ ok: true,  donnees: T }
{ ok: false, erreur: { code: 'VIDEO_INTROUVABLE', message: 'Aucune vidéo…', champ?: 'id' } }
```

Le code HTTP reste juste et sert les intermédiaires (200 succès, 400 validation, 401 sans session,
404 introuvable, 409 conflit d'état, 422 garde du moteur, 500 imprévu) — mais **la décision
d'affichage d'un îlot se prend sur `ok`**, jamais sur le statut. C'est ce qui rend « aucun échec
silencieux » vérifiable plutôt qu'espéré.

**Codes d'erreur** : `TOUT_EN_MAJUSCULES` français, forme `<DOMAINE>_<CAUSE>` : `VIDEO_INTROUVABLE`,
`PUBLICATION_DEJA_PARTIE`, `MOTEUR_CADRE_INVALIDE`, `RESEAU_JETON_EXPIRE`. Le `message` est en
français et destiné à l'écran : il n'est jamais une trace technique.

**Opérations longues.** Toute opération qui dépasse la requête rend un identifiant, jamais son
résultat : `{ ok: true, donnees: { tacheId, etat: 'en_attente' } }` (FR7, FR40). L'appelant,
interface ou MCP, interroge ensuite `taches_etat`.

**États.** Un vocabulaire fermé, minuscules, `snake_case`, **le même pour les tâches et pour les
publications** : `brouillon`, `en_attente`, `en_cours`, `reussi`, `echoue`, `annule`, `archive`. Deux
vocabulaires parallèles obligeraient chaque écran à savoir lequel il regarde.

**Dates.** ISO 8601 en UTC avec le `Z`, en base (`TEXT`) comme en JSON :
`2026-09-13T08:30:00.000Z`. La localisation en heure de Paris (NFR37) se fait **au rendu seulement**.
Aucune date locale ne traverse une frontière de module.

### Motifs de communication

**L'état vit sur le serveur.** Les îlots ne se parlent pas : pas d'événement navigateur maison, pas
de bus, pas de magasin global. Un îlot interroge un point d'entrée (rafraîchissement périodique,
proposition 5 s) et rend ce qu'il reçoit. Deux îlots qui montrent la même chose interrogent le même
point d'entrée.

**Journal structuré.** `pino`, un objet par ligne. Champs obligatoires : `evenement` en `snake_case`
français au passé (`video_generation_demarree`, `publication_programmee`, `reseau_jeton_rafraichi`),
`tacheId` dès qu'il en existe une, `dureeMs` sur l'événement de fin. Niveaux : `debug` diagnostic,
`info` fait métier, `warn` dégradation rattrapée, `error` échec rendu à l'utilisateur. **Aucun
secret, aucun jeton, aucune URL signée** — ni dans le journal, ni dans l'audit.

**Journal d'audit.** Une ligne par acte publiable, en ajout seul : jamais de `UPDATE`, jamais de
`DELETE` (NFR21).

### Motifs de processus

**Chargement.** Chaque îlot expose trois états explicites : `chargement`, `pret`, `erreur`. Un écran
vide n'est jamais un état par défaut — c'est un défaut déguisé.

**Erreurs.** Une seule classe, `ErreurRegie`, portant `code`, `message` (français, pour l'écran) et
`cause`. **Les services lèvent, les façades traduisent** : une route et un outil MCP attrapent
`ErreurRegie` et l'enveloppent ; ils ne construisent pas d'erreur eux-mêmes. Jamais de `catch` vide,
jamais de valeur de repli substituée en silence.

**Nouvelles tentatives.** Aucune en V1 : une publication qui échoue reste visible, en état `echoue`,
avec une action « rejouer » déclenchée par un humain. La reprise automatique est explicitement hors
périmètre (MANDAT, 2026-09-06).

**Validation.** `zod` à l'entrée du **service**, une seule fois, avec un schéma nommé
`<verbe><Ressource>Schema` (`genererVideoSchema`). Les façades ne valident pas une deuxième fois :
elles passent la charge utile brute au service. Un seul lieu de validation, donc un seul endroit à
lire pour savoir ce qui est accepté.

**Session.** Toute route exige une session, sauf celles énumérées dans la constante unique
`ROUTES_PUBLIQUES` de `src/noyau/` (NFR18). Le MCP n'a pas de session : il porte un jeton comparé en
temps constant. Aucune route ne décide seule d'être publique.

### Règles d'application

**Tout agent qui code sur ce dépôt DOIT :**

1. lire cette section avant d'écrire une ligne ;
2. réutiliser un nom existant plutôt qu'en inventer un voisin — chercher avant de nommer ;
3. écrire le test colocalisé dans le même changement que le code ;
4. faire passer toute logique par un service, jamais dans une route ou un outil ;
5. répondre par l'enveloppe, toujours, y compris sur le chemin heureux.

**Vérification.** Trois contrôles automatiques portent ces règles, le reste tient à la relecture : le
test de parité (chaque outil MCP a son service et son point d'entrée), le test de dérive (le schéma
Drizzle correspond à la base migrée), et le linter sur la casse des identifiants.

**Écart assumé.** Un écart à ces motifs s'écrit dans le fichier concerné, en une ligne commençant par
`// Écart :` suivie de la raison. Un écart non déclaré est un défaut, pas un choix.

**Mise à jour.** Ces motifs se modifient dans cette section d'abord, dans le code ensuite — jamais
l'inverse.

### Exemples

**Bon** — un service, une validation, une erreur nommée :

```ts
// src/services/publications.ts
export const programmerPublicationSchema = z.object({
  videoId: z.string().uuid(),
  reseau: z.enum(['instagram', 'facebook_page', 'tiktok']),
  programmePour: z.string().datetime(),
});

export async function programmerPublication(entree: unknown) {
  const { videoId, reseau, programmePour } = programmerPublicationSchema.parse(entree);
  const video = await base.videoParId(videoId);
  if (!video) throw new ErreurRegie('VIDEO_INTROUVABLE', "Cette vidéo n'existe plus.");
  if (video.etat === 'archive') {
    throw new ErreurRegie('VIDEO_ARCHIVEE', 'Une vidéo archivée ne se publie pas.');
  }
  return base.creerPublication({ videoId, reseau, programmePour, etat: 'en_attente' });
}
```

**Bon** — la façade n'ajoute que l'enveloppe :

```ts
// src/routes/api/publications.ts
serveur.post('/api/publications/programmer', async (requete, reponse) => {
  try {
    const donnees = await programmerPublication(requete.body);
    return { ok: true, donnees };
  } catch (cause) {
    return reponse.code(statutPour(cause)).send({ ok: false, erreur: enErreurPublique(cause) });
  }
});
```

**Anti-motifs** — chacun a été vu ailleurs et coûte cher ici :

| Anti-motif | Pourquoi il est refusé |
|---|---|
| `if (!video) return null` dans un service | L'appelant ne sait pas *pourquoi* c'est nul ; l'écran affiche du vide. Lever `ErreurRegie`. |
| Requête Drizzle dans une route ou un outil MCP | La parité outil ⇔ service devient invérifiable, et les deux façades divergent. |
| Valider dans la route **et** dans le service | Deux vérités sur ce qui est accepté ; l'une des deux finit périmée. |
| `reponse.send(video)` sans enveloppe | L'îlot doit deviner l'échec au statut HTTP ; un oubli devient un écran blanc. |
| `catch (e) { console.error(e) }` | Échec silencieux, exactement ce que le PRD proscrit. |
| `new Date().toLocaleString('fr-FR')` stocké en base | Une heure locale en base est une donnée qu'on ne peut plus comparer. |
| Un état `pending` à côté de `en_attente` | Deux vocabulaires pour une même notion ; chaque écran doit savoir lequel il lit. |
| Un `videos.ts` sans `videos.test.ts` | Le manque est invisible et personne ne le rattrape. |

### Reste ouvert après cette étape

Deux valeurs proposées attendent encore la confirmation du fondateur, et le PRD les renvoyait déjà à
l'architecture : l'intervalle de rafraîchissement des îlots (proposition 5 s) et la largeur minimale
de l'interface (proposition 1 280 px). Elles seront tranchées avec la structure du projet ou le cadre
de validation.

## Structure du projet et frontières

Cette section fixe où vit chaque chose et ce qui a le droit d'appeler quoi. Elle n'est pas
cosmétique : sans elle, deux agents qui codent deux stories différentes inventent chacun leur
emplacement, et la troisième story hérite de deux arborescences incompatibles.

Trois arbitrages du fondateur commandent la structure qui suit :

1. **Envoi de la vidéo aux réseaux → téléversement direct partout, hébergement externe pour
   Instagram.** L'option d'une adresse temporaire signée servie par regie a été écartée en
   connaissance de cause. Conséquences assumées : une dépendance externe de plus, un compte à
   gérer, un secret de plus dans le coffre, et la vidéo quitte la machine du fondateur pour
   Instagram. Conséquence structurelle directe : **regie ne sert aucune route signée et n'expose
   aucun répertoire de rendus** — en échange, une couche `src/hebergement/` apparaît, isolée comme
   un connecteur, avec sa clé propre dans Paramètres.
2. **Dossier de données → `./donnees/` à la racine du projet, surchargeable.** Le dossier vit à
   côté du code cloné, il est ignoré par le dépôt, et la variable `REGIE_DONNEES` le déplace
   (disque externe, NAS). Sauvegarder, c'est copier un dossier visible. Cela n'ajoute aucune étape
   à l'installation en quatre étapes (NFR34). Contrepartie à écrire noir sur blanc dans le
   LISEZ-MOI : **un `rm -rf` du dossier cloné emporte les données avec lui**.
3. **Aperçu de l'éditeur → le HTML du moteur, affiché dans un cadre.** Une route rend le HTML
   d'une scène avec les mêmes fonctions que le rendu final, et l'affiche dans un `iframe` aux
   dimensions de la zone sûre. Un seul générateur de HTML : l'aperçu ne peut pas diverger du
   résultat. Le moteur expose déjà sa composition de scène sans passer par ffmpeg
   (`htmlZones`, `variablesCss`, `poserCadrage`, `placerVue`), donc rien n'est à inventer.

### Arborescence complète du projet

```
regie/
├── .env.exemple                    ← modèle commenté : REGIE_MASTER_KEY, REGIE_DONNEES, REGIE_JETON_MCP
├── .gitignore                      ← donnees/ , .env , dist/ , node_modules/
├── .github/workflows/ci.yml        ← Node 24 + Chromium + ffmpeg (NFR36)
├── .claude/launch.json
├── astro.config.mjs                ← @astrojs/node en mode « middleware »
├── drizzle.config.ts
├── package.json  ·  pnpm-lock.yaml  ·  tsconfig.json  ·  vitest.config.ts
├── LICENCE  ·  LISEZ-MOI.md  ·  MANDAT.md
├── docs/
│   ├── planning/{prd.md, prd-validation-report.md, architecture.md}
│   ├── outils-mcp.md               ← GÉNÉRÉ depuis le code (FR42), jamais édité à la main
│   └── exemples-de-prompts.md
├── maquette/                       ← référence UX figée du 2026-09-08, hors production
│   ├── serveur.mjs
│   └── public/{index,generateur,editeur,publication,parametres,audit,mise-en-route}.html + style.css
├── migrations/
│   ├── 0001_socle.sql              ← videos, scenarios, taches, journal_audit, migrations_appliquees
│   ├── 0002_reseaux.sql            ← comptes_reseau, publications
│   └── LISEZ-MOI.md                ← règle de numérotation et d'irréversibilité
├── donnees/                        ← HORS DÉPÔT ; déplaçable par REGIE_DONNEES ; c'est LA sauvegarde
│   ├── regie.db                    ← SQLite (+ .db-wal, .db-shm)
│   ├── captures/<video_id>/001.png…
│   ├── rendus/<video_id>.mp4
│   └── journal/regie-AAAA-MM-JJ.log
├── scripts/
│   ├── generer-reference-mcp.ts    ← écrit docs/outils-mcp.md depuis le registre d'outils
│   ├── verifier-parite.ts          ← contrôle outil ⇔ service ⇔ route (NFR32)
│   └── essai-connecteur.ts         ← script jetable d'exploration d'API
├── src/
│   ├── serveur.ts                  ← POINT D'ENTRÉE UNIQUE : Fastify + Astro + MCP + planificateur
│   ├── env.ts                      ← lecture et validation zod des variables, une seule fois
│   ├── pages/
│   │   ├── index.astro             ← librairie
│   │   ├── generateur.astro  ·  editeur.astro  ·  publication.astro
│   │   ├── parametres.astro  ·  audit.astro
│   │   ├── mise-en-route.astro     ← mot de passe initial, première visite seulement
│   │   └── connexion.astro
│   ├── composants/
│   │   ├── Mise.astro  ·  Entete.astro  ·  GardeLargeur.astro   ← bandeau sous la largeur minimale (NFR27)
│   │   ├── CarteVideo.astro  ·  EtatConnecteur.astro            ← rendu serveur
│   │   ├── FileTaches.astro        ← ÎLOT client:load, rafraîchissement périodique
│   │   ├── EditeurScenes.astro     ← ÎLOT client:load
│   │   ├── ApercuScene.astro       ← ÎLOT : iframe vers /apercu/:scenarioId/:index
│   │   └── FormulaireProgrammation.astro ← ÎLOT client:load
│   ├── services/                   ← TOUTE la logique ; un fichier par domaine ; pas d'index.ts
│   │   ├── videos.ts  ·  videos.test.ts
│   │   ├── scenarios.ts  ·  scenarios.test.ts
│   │   ├── publications.ts  ·  publications.test.ts
│   │   ├── comptes.ts  ·  comptes.test.ts
│   │   ├── taches.ts  ·  taches.test.ts
│   │   ├── audit.ts  ·  audit.test.ts
│   │   └── parametres.ts  ·  parametres.test.ts
│   ├── routes/                     ← façade HTTP ; miroir de mcp/outils/
│   │   ├── videos.ts  ·  scenarios.ts  ·  publications.ts
│   │   ├── comptes.ts  ·  taches.ts  ·  audit.ts
│   │   ├── session.ts              ← connexion, déconnexion, mot de passe initial
│   │   ├── oauth.ts                ← départs et retours OAuth ; JAMAIS exposé au MCP
│   │   ├── apercu.ts               ← HTML d'une scène, produit par le moteur
│   │   └── legales.ts              ← CGU et confidentialité servies par regie
│   ├── mcp/
│   │   ├── serveur.ts              ← SDK 1.30.0, transport Streamable HTTP, monté sur /mcp
│   │   ├── jeton.ts                ← porteur, comparaison en temps constant
│   │   └── outils/                 ← miroir de routes/ ; aucun accès aux secrets (FR39)
│   │       ├── videos.ts  ·  scenarios.ts  ·  publications.ts
│   │       ├── taches.ts  ·  audit.ts
│   │       └── registre.ts         ← liste unique lue par le serveur ET par la génération de doc
│   ├── connecteurs/                ← NFR28 : AUCUN import d'un connecteur vers un autre
│   │   ├── contrat.ts              ← interface commune : publier, rafraichirJeton, etatCompte
│   │   ├── instagram/{oauth.ts, publier.ts, instagram.test.ts}
│   │   ├── facebook_page/{oauth.ts, publier.ts, facebook_page.test.ts}
│   │   ├── tiktok/{oauth.ts, publier.ts, tiktok.test.ts}
│   │   └── linkedin/{oauth.ts, publier.ts, linkedin.test.ts}   ← clé et connecteur, publication après agrément
│   ├── hebergement/                ← exigé par le choix « hébergement externe pour Instagram »
│   │   ├── contrat.ts              ← deposer(fichier) → URL publique ; retirer(URL)
│   │   ├── depot-s3.ts             ← implémentation compatible S3, clé au coffre
│   │   └── hebergement.test.ts
│   ├── capture/                    ← Playwright isolé, comme les connecteurs
│   │   ├── navigateur.ts           ← lancement, fermeture, Chromium épinglé
│   │   ├── session-app.ts          ← connexion enregistrée à l'application cible
│   │   ├── parcours.ts             ← URL ordonnées → fichiers dans donnees/captures/
│   │   └── capture.test.ts
│   ├── moteur/                     ← RECOPIÉ TEL QUEL depuis saas-souverain ; typé par ses .d.mts
│   │   ├── format.mjs + format.d.mts        ·  scenes.mjs + scenes.d.mts
│   │   ├── images.mjs + images.d.mts        ·  montage.mjs
│   │   ├── rendu.mjs  ·  ffmpeg.mjs
│   │   └── generer.mjs + generer.d.mts
│   ├── base/
│   │   ├── schema.ts               ← SEUL point de traduction snake_case ⇔ camelCase
│   │   ├── connexion.ts  ·  migrer.ts  ·  schema.test.ts
│   ├── planificateur/
│   │   ├── file.ts                 ← une génération à la fois (NFR5)
│   │   ├── reveil.ts               ← réveil calculé sur la prochaine échéance
│   │   ├── rattrapage.ts           ← fenêtre bornée au démarrage (NFR13)
│   │   └── planificateur.test.ts
│   └── noyau/
│       ├── coffre.ts               ← AES-256-GCM sous REGIE_MASTER_KEY (NFR16)
│       ├── session.ts              ← scrypt + cookie signé
│       ├── routes-publiques.ts     ← constante ROUTES_PUBLIQUES (NFR18)
│       ├── erreur.ts               ← ErreurRegie
│       ├── journal.ts              ← pino + audit en ajout seul (NFR21)
│       ├── horaire.ts              ← UTC en base, Paris à l'affichage (NFR37)
│       └── chemins.ts              ← résolution de donnees/ ; unique endroit qui lit REGIE_DONNEES
└── tests/
    ├── parite-mcp.test.ts          ← NFR32 : tout outil a son service et sa route
    └── derive-moteur.test.ts       ← NFR32 : les exports du moteur n'ont pas bougé
```

### Frontières d'architecture

**Frontière d'API.** Deux façades, une seule logique. `src/routes/` et `src/mcp/outils/` sont des
traducteurs : ils lisent une requête, appellent un service, emballent le résultat dans
`{ok, donnees, erreur}`. Aucune règle métier n'y vit. Un service ne connaît ni Fastify, ni le SDK
MCP, ni l'objet `Request` — c'est ce qui rend la parité de FR38 vérifiable mécaniquement plutôt que
promise.

**Frontière de composants.** Une page Astro lit par service et rend du HTML. Un îlot ne parle qu'à
`/api/*`, jamais à un service directement. Aucun composant n'importe `src/base/`,
`src/connecteurs/`, `src/hebergement/` ou `src/noyau/coffre.ts`.

**Frontière de services.** `src/services/` est le seul consommateur de `src/base/`,
`src/connecteurs/`, `src/hebergement/`, `src/capture/`, `src/moteur/` et `src/planificateur/`. Les
services ne s'importent pas entre eux, à deux exceptions déclarées : `taches.ts` et `audit.ts`, que
tout le monde utilise.

**Frontière de données.** Le dépôt ne contient aucune donnée ; `donnees/` les contient toutes. Un
seul fichier lit `REGIE_DONNEES` — `noyau/chemins.ts` — et tout chemin de fichier passe par lui.
Aucun répertoire de `donnees/` n'est servi en statique : c'est la conséquence directe du choix
d'hébergement externe.

**Frontière des secrets.** Un secret n'existe en clair qu'entre `noyau/coffre.ts` et le connecteur
qui l'utilise. Ni les pages, ni les îlots, ni les outils MCP, ni le journal ne le voient
(FR39, NFR16). La clé de l'hébergeur externe suit exactement le même chemin que les jetons de
réseaux — elle n'est pas un cas à part.

### Cartographie des exigences vers la structure

| Domaine | Service | Route | Outil MCP | Écran | Table |
|---|---|---|---|---|---|
| Librairie, archivage, suppression | `services/videos.ts` | `routes/videos.ts` | `videos_lister`, `videos_obtenir` | `index.astro` | `videos` |
| Génération (URL ordonnées → rendu) | `services/videos.ts` + `capture/` + `moteur/` | `POST /api/videos/generer` | `videos_generer` | `generateur.astro` | `taches` |
| Éditeur textes et animations | `services/scenarios.ts` | `routes/scenarios.ts` + `routes/apercu.ts` | `scenarios_obtenir`, `scenarios_modifier` | `editeur.astro` | `scenarios` |
| Programmation et publication | `services/publications.ts` + `planificateur/` + `hebergement/` | `routes/publications.ts` | `publications_programmer`, `publications_annuler` | `publication.astro` | `publications` |
| Comptes réseaux et OAuth | `services/comptes.ts` + `connecteurs/` | `routes/comptes.ts`, `routes/oauth.ts` | *aucun* (FR39) | `parametres.astro` | `comptes_reseau` |
| Suivi des tâches longues | `services/taches.ts` | `routes/taches.ts` | `taches_etat` | îlot `FileTaches` | `taches` |
| Audit | `services/audit.ts` | `routes/audit.ts` | `audit_lister` | `audit.astro` | `journal_audit` |
| Première mise en route | `noyau/session.ts` | `routes/session.ts` | *aucun* | `mise-en-route.astro` | `parametres_app` |

**Préoccupations transverses.** Authentification : `noyau/session.ts` en garde Fastify globale,
l'exception étant la constante `ROUTES_PUBLIQUES` (NFR18). Journalisation et audit :
`noyau/journal.ts`, appelé par les services, jamais par les façades — sinon un même événement se
journalise deux fois ou pas du tout selon le chemin d'entrée. Erreurs : les services lèvent
`ErreurRegie`, les deux façades la traduisent. Temps : `noyau/horaire.ts`, seul endroit qui connaît
l'Europe/Paris (NFR37). Validation : `zod` à l'entrée de chaque service.

### Points d'intégration

**Communication interne.** Tout est en mémoire dans un seul processus : appel de fonction, pas de
bus, pas d'événement maison. `serveur.ts` compose dans l'ordre — variables, base, migrations,
coffre, services, routes, MCP, Astro, planificateur — et c'est le seul fichier qui connaît cet
ordre.

**Intégrations externes.** Quatre réseaux, un dépôt de fichiers, un navigateur, deux binaires.
Instagram publie depuis une URL déposée par `hebergement/`, puis retirée ; Facebook Page, TikTok et
LinkedIn reçoivent le fichier en téléversement direct depuis `donnees/rendus/`. Chromium sert à
deux usages distincts — capturer les pages sources, et photographier les scènes du moteur.
`ffmpeg` et `ffprobe` restent internes au moteur, jamais appelés ailleurs.

**Flux de génération.** `videos_generer` ou `POST /api/videos/generer` → `services/videos.ts`
inscrit une tâche et rend `{tacheId, etat:'en_attente'}` (FR7, FR40) → `planificateur/file.ts` la
prend, seule à la fois (NFR5) → `capture/parcours.ts` visite les URL ordonnées et écrit dans
`donnees/captures/` → `moteur/` compose, photographie, monte → `donnees/rendus/<id>.mp4` → la vidéo
entre en librairie après vérification des bornes de cadrage et de lisibilité (FR12) → journal et
audit.

**Flux de publication.** Échéance atteinte → `services/publications.ts` → si Instagram,
`hebergement/` dépose le fichier et rend une URL, sinon le connecteur téléverse directement →
publication → retrait du fichier chez l'hébergeur → état `reussi` ou `echoue`, visible dans regie
seulement.

**Flux d'aperçu.** L'éditeur enregistre une scène → l'îlot recharge
`/apercu/:scenarioId/:index` → `routes/apercu.ts` appelle les fonctions de composition du moteur et
rend le HTML brut → l'`iframe` l'affiche aux dimensions de la zone sûre. Aucun rendu parallèle :
l'aperçu et la vidéo finale sortent du même code, ce qui interdit par construction l'anti-motif
« reconstituer la mise en page côté interface ».

### Motifs d'organisation des fichiers

**Configuration** : à la racine, jamais dispersée ; un seul `.env`, décrit par `.env.exemple`.

**Sources** : organisées par couche, pas par fonctionnalité — décision de l'étape 5, appliquée ici
sans exception.

**Tests** : unitaires colocalisés (`videos.ts` ⇒ `videos.test.ts`) ; `tests/` n'accueille que ce qui
traverse les couches, c'est-à-dire la parité et la dérive.

**Fichiers produits** : captures, rendus, journaux et base vivent tous sous `donnees/` et nulle part
ailleurs. `maquette/` est une pièce de référence, jamais importée par `src/`.

### Intégration au flux de développement

**Serveur de développement.** `pnpm dev` lance `src/serveur.ts` : Astro en mode développement à
l'intérieur de Fastify, MCP et planificateur compris. Un seul port, un seul processus — ce qui
tourne en développement est ce qui tourne en production.

**Construction.** `pnpm build` produit l'entrée Astro `dist/server/entry.mjs` ; `src/moteur/*.mjs`
est copié tel quel ; `pnpm start` démarre le tout. Les migrations en attente s'appliquent au
démarrage (NFR35).

**Installation.** Cloner, `pnpm install`, remplir `.env`, `pnpm start` — les quatre étapes de
NFR34, inchangées. Le dossier `donnees/` se crée au premier démarrage. Sauvegarder, c'est copier ce
dossier.

**Intégration continue.** `.github/workflows/ci.yml` installe Chromium et ffmpeg, puis enchaîne
types, linter, `vitest`, parité MCP et dérive du moteur (NFR36, NFR32).

### Reste ouvert après cette étape

Quatre valeurs attendent encore d'être fixées, et elles le seront au cadre de validation :

- l'intervalle de rafraîchissement des îlots (proposition 5 s) ;
- la largeur minimale de l'interface (proposition 1 280 px) ;
- le fournisseur du dépôt compatible S3 pour l'hébergement externe ;
- la durée de vie du fichier déposé chez cet hébergeur — le PRD renvoyait à l'architecture un
  « délai d'expiration de l'adresse temporaire » qui n'a plus de sens côté regie depuis le choix
  d'hébergement externe, et qui se reformule ainsi.
