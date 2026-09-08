---
stepsCompleted: ['step-01-init', 'step-02-context']
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
