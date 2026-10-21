// regie — lance les tests d'intégration PostgreSQL : `npm run test:postgres`.
// Démarre un PostgreSQL jetable (image épinglée de deploiement/versions.json) avec un mot de passe
// tiré au hasard à chaque lancement, passe son adresse à vitest par REGIE_TEST_POSTGRES, puis le détruit.
// Utilise podman s'il est installé, sinon docker.

import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { RACINE_DEPOT } from './ci/commun.mjs';

const versions = JSON.parse(readFileSync(new URL('../deploiement/versions.json', import.meta.url), 'utf8'));
const image = versions.images.postgres;

const moteur = ['podman', 'docker'].find((nom) => spawnSync(nom, ['--version'], { stdio: 'ignore' }).status === 0);
if (moteur === undefined) {
  process.stderr.write('✘ ni podman ni docker : impossible de lancer PostgreSQL pour les tests d’intégration.\n');
  process.exit(1);
}

function lancer(arguments_, options = {}) {
  return spawnSync(moteur, arguments_, { encoding: 'utf8', ...options });
}

const nom = `regie-test-pg-${randomBytes(4).toString('hex')}`;
const motDePasse = randomBytes(24).toString('hex');
let code = 1;
try {
  const demarrage = lancer(['run', '-d', '--rm', '--name', nom, '-e', `POSTGRES_PASSWORD=${motDePasse}`, '-p', '127.0.0.1::5432', image]);
  if (demarrage.status !== 0) throw new Error(`le conteneur ne démarre pas : ${demarrage.stderr.trim()}`);

  const port = lancer(['port', nom, '5432/tcp']).stdout.trim().split('\n')[0]?.split(':').pop();
  if (!port) throw new Error('port du conteneur introuvable');

  // Attend que PostgreSQL accepte les connexions (il redémarre une fois après son initialisation).
  let pret = false;
  for (let essai = 0; essai < 60 && !pret; essai += 1) {
    const sonde = lancer(['exec', nom, 'pg_isready', '-U', 'postgres', '-h', '127.0.0.1']);
    pret = sonde.status === 0;
    if (!pret) spawnSync('sleep', ['1']);
  }
  if (!pret) throw new Error('PostgreSQL ne répond pas après 60 s');
  spawnSync('sleep', ['2']);

  const adresse = `postgres://postgres:${motDePasse}@127.0.0.1:${port}/postgres`;
  const tests = spawnSync('npm', ['exec', '--no', '--', 'vitest', 'run', ...process.argv.slice(2)], {
    cwd: RACINE_DEPOT,
    stdio: 'inherit',
    env: { ...process.env, REGIE_TEST_POSTGRES: adresse },
  });
  code = tests.status ?? 1;
} catch (erreur) {
  process.stderr.write(`✘ ${erreur.message}\n`);
} finally {
  lancer(['rm', '-f', nom]);
}
process.exit(code);
