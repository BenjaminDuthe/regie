// regie — utilitaires partagés des vérificateurs de la CI.
// Aucun paquet tiers : ces scripts tournent avant toute installation.

import { readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Racine du dépôt (deux niveaux au-dessus de outils/ci). */
export const RACINE_DEPOT = fileURLToPath(new URL('../../', import.meta.url));

/** Dossiers jamais parcourus : dépendances, constructions, environnements locaux. */
export const DOSSIERS_IGNORES = new Set([
  'node_modules',
  'dist',
  '.astro',
  '.venv',
  '.git',
  '__pycache__',
  '_bmad',
  '_bmad-output',
]);

/** Chemin relatif au dépôt, toujours avec des « / ». */
export function cheminRelatif(racine, chemin) {
  return relative(racine, chemin).split(sep).join('/');
}

/** Liste récursive des fichiers sous `dossier`, hors dossiers ignorés. */
export function listerFichiers(dossier) {
  const fichiers = [];
  let entrees;
  try {
    entrees = readdirSync(dossier, { withFileTypes: true });
  } catch {
    return fichiers;
  }
  for (const entree of entrees) {
    const chemin = join(dossier, entree.name);
    if (entree.isDirectory()) {
      if (!DOSSIERS_IGNORES.has(entree.name)) fichiers.push(...listerFichiers(chemin));
    } else if (entree.isFile()) {
      fichiers.push(chemin);
    }
  }
  return fichiers;
}

/** Affiche les fautes et rend le code de sortie (0 si aucune). */
export function rapporter(nom, fautes) {
  if (fautes.length === 0) {
    process.stdout.write(`✔ ${nom} : aucune faute\n`);
    return 0;
  }
  process.stderr.write(`✘ ${nom} : ${fautes.length} faute(s)\n`);
  for (const faute of fautes) process.stderr.write(`  ${faute}\n`);
  return 1;
}

