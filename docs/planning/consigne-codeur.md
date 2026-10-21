# Consigne commune aux codeurs d'histoires (V1)

Tu codes **une seule histoire** de regie, dans le worktree courant (branche `claude/epopee-0-infra`). Personne ne répondra à tes questions : décide seul, au plus simple qui satisfait les critères, et trace tes choix.

## Avant de coder

1. Lis la table « Ordre de la V1 » de `docs/planning/epics.md` (ligne de ton histoire : l'ajustement du 2026-10-18 prime sur la spécification détaillée), puis la section `### Story X.Y` de ton histoire.
2. Lis ce qui existe déjà : `git log --oneline -15`, `coeur/src/` (env.ts, infra/, pages/, composants/), `coeur/migrations/`, `coeur/test/`, `outils/ci/`, `deploiement/`. Réutilise ; ne duplique pas.
3. Consulte l'architecture dans `docs/planning/architecture/` seulement pour ce que ton histoire touche.

## Règles du projet (non négociables)

- Tout en français : identifiants métier, commentaires, textes visibles (dans `coeur/src/chaines.json`), messages de commit. Vouvoiement absent : l'interface tutoie ou reste impersonnelle comme l'existant.
- Seul `coeur/src/env.ts` lit l'environnement (schéma zod). Aucun secret dans le dépôt, ni en clair dans les logs (masquage pino existant).
- Toute nouvelle table : migration SQL numérotée suivante dans `coeur/migrations/` (ne modifie jamais une migration existante), `ENABLE` + `FORCE ROW LEVEL SECURITY`, politique `TO regie_coeur` par `marque_id = nullif(current_setting('app.marque_id', true), '')::uuid` (USING et WITH CHECK identiques), GRANT minimal. **Aucune variable de session qui élargit la RLS.** Accès via `dansTransactionMarque`.
- Dépendance nouvelle : version exacte épinglée, licence compatible AGPL ajoutée à `deploiement/licences-tiers.json` ; tout appel sortant déclaré dans `deploiement/sorties-autorisees.json`. Préfère la bibliothèque standard de Node.
- CSP stricte (`coeur/astro.config.mjs`) : aucun script ni style tiers, aucune ressource externe.
- Tests vitest dans `coeur/test/` (ou à côté de l'outil) : un cas positif et au moins un négatif par critère. Ce qui exige PostgreSQL va dans un test `*.integration.test.ts` ignoré sans `REGIE_TEST_POSTGRES` (voir l'existant) ; lance `npm run test:postgres` pour le vérifier.
- Ce qui dépend d'un service externe absent (Authentik, Meta, Claude, GPU, LXC) : code derrière une interface, testé contre un faux local ; rien n'appelle Internet pendant les tests.
- Ne touche ni à l'infrastructure (ssh, Proxmox), ni à `main`, ni au remote. **Ne pousse pas.**

## Pour finir

1. `npm run ci` doit être vert (et `npm run test:postgres` si tu as touché la base).
2. Dans `docs/planning/epics.md`, table « Ordre de la V1 », passe la colonne de ton histoire à `**faite** (AAAA-MM-JJ) : <résumé d'une ligne> ; reportés : <ce qui manque et pourquoi>`.
3. Un commit local unique : `feat(<zone>): <résumé> (histoire X.Y)`, terminé par `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. Jamais `--no-verify`.
4. Si un critère est impossible sans décision humaine (produit, accès, jeton tiers), n'invente pas : code le reste, et ajoute une entrée à `docs/planning/ARBITRAGES.md` (histoire, question, options, recommandation).
5. Réponds en 10 lignes maximum : commit, ce qui est fait, ce qui est reporté, arbitrages ouverts.
