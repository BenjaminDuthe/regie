# regie

Régie de réseaux sociaux et générateur de vidéos verticales, pilotée par Claude via MCP. Logiciel libre sous licence AGPL-3.0.

Le socle du code est posé (histoire 1.1) : monorepo, cœur fastify qui sert Astro en middleware, CI bloquante. Les fonctionnalités arrivent histoire par histoire (`docs/planning/epics.md`).

## Démarrer

Prérequis : Node 26.5 (`.node-version`), et Podman ou Docker pour l'environnement de développement.

```sh
npm ci --ignore-scripts   # dépendances exactes du package-lock.json, sans script d'installation
npm run dev               # podman compose (sinon docker compose), profil cpu
```

La page d'accueil s'ouvre sur <http://localhost:4321/>.

Sans conteneur : `npm run build` puis `node coeur/src/serveur.ts` (écoute sur 127.0.0.1:4321 ; variables de `.env.example`, toutes facultatives, à exporter dans ton shell).

## Vérifier

```sh
npm run ci
```

Une seule commande, reprise telle quelle par le job `suites` de Forgejo Actions (`.forgejo/workflows/ci.yaml`) ; le job `python` y vérifie à part l'installation du verrou Python (`pip install --require-hashes`) en Python 3.14. Toutes les suites sont bloquantes :

- lecteur d'environnement : seul `coeur/src/env.ts` lit l'environnement ;
- épinglage : versions exactes et stables, conformes à `deploiement/versions.json` ;
- scan de secrets (gitleaks, historique et arbre de travail) ;
- types : `astro check` et `tsc -b` (TypeScript strict) ;
- construction d'Astro, puis tests vitest.

Le scan de secrets demande `gitleaks` (version dans `deploiement/versions.json`). Les dépendances Python communes s'installent par `pip install --require-hashes -r requirements.lock` (Python 3.14).

## Arborescence

- `coeur/` — fastify + Astro (`src/env.ts`, `facades`, `services`, `domaine`, `infra`), `migrations/`.
- `paquets/contrats/` — contrats partagés (zod versionnés).
- `services/` — services techniques (rendu, capture, publication, transcription, langage, voix).
- `deploiement/` — compose de développement, images, versions de référence, installation de Forgejo.
- `outils/` — lancement du développement et vérificateurs de la CI.
- `docs/` — planification, registre RGPD (`docs/rgpd/registre.md`).
- `maquette/` — maquette UX de référence.
- `MANDAT.md` — l'énoncé de départ et son découpage en lots.

Aucun secret n'est versionné : les clés d'API et les jetons vivent hors dépôt (variables d'environnement, coffre chiffré de l'application).
