---
stepsCompleted: ['step-01-init', 'step-02-context', 'step-03-starter']
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
