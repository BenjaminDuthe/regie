// regie — point d'entrée unique de la CI : `npm run ci`.
// Forgejo Actions lance exactement cette commande. Chaque suite est bloquante :
// toutes tournent, puis la commande échoue si l'une d'elles a échoué.

import { spawnSync } from 'node:child_process';
import { RACINE_DEPOT } from './commun.mjs';

const SUITES = [
  ['lecteur d’environnement', 'node', ['outils/ci/verifier-env.mjs']],
  ['épinglage des dépendances', 'node', ['outils/ci/verifier-epinglage.mjs']],
  ['scan de secrets', 'node', ['outils/ci/scanner-secrets.mjs']],
  ['types Astro (astro check)', 'npm', ['run', 'check', '--workspace', 'coeur']],
  ['types TypeScript (tsc -b)', 'npm', ['exec', '--no', '--', 'tsc', '-b']],
  ['construction (astro build)', 'npm', ['run', 'build']],
  ['tests (vitest)', 'npm', ['exec', '--no', '--', 'vitest', 'run']],
];

const echecs = [];
for (const [nom, commande, arguments_] of SUITES) {
  process.stdout.write(`\n── ${nom} ──\n`);
  const resultat = spawnSync(commande, arguments_, { cwd: RACINE_DEPOT, stdio: 'inherit' });
  if (resultat.status !== 0) echecs.push(nom);
}

process.stdout.write('\n');
if (echecs.length > 0) {
  process.stderr.write(`✘ CI en échec : ${echecs.join(', ')}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(`✔ CI au vert : ${SUITES.length} suites passées\n`);
}
