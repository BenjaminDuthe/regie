// regie — `npm run dev` : construit et lance le profil « cpu » de deploiement/compose.dev.yaml.
// Choisit `podman compose` si podman est installé, sinon `docker compose`.

import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const RACINE = fileURLToPath(new URL('..', import.meta.url));
const MOTEUR = spawnSync('podman', ['--version']).status === 0 ? 'podman' : 'docker';

process.stdout.write(`regie : ${MOTEUR} compose, profil cpu → http://localhost:4321/\n`);
const resultat = spawnSync(
  MOTEUR,
  ['compose', '--file', 'deploiement/compose.dev.yaml', '--profile', 'cpu', 'up', '--build', ...process.argv.slice(2)],
  { cwd: RACINE, stdio: 'inherit' },
);
if (resultat.error !== undefined) {
  process.stderr.write(`regie : ni podman ni docker n'est utilisable (${resultat.error.message}).\n`);
  process.exitCode = 1;
} else {
  process.exitCode = resultat.status ?? 1;
}
