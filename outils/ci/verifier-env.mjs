// regie — vérificateur du lecteur d'environnement (AR-5).
// Seul coeur/src/env.ts lit l'environnement. Toute autre lecture dans coeur/,
// paquets/ ou services/ fait échouer la CI, en nommant le fichier et la ligne.

import { readFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import { RACINE_DEPOT, cheminRelatif, listerFichiers, rapporter } from './commun.mjs';

/** Dossiers surveillés, relatifs à la racine du dépôt. */
export const DOSSIERS_SURVEILLES = ['coeur', 'paquets', 'services'];

/** Le seul fichier autorisé à lire l'environnement. */
export const LECTEUR_AUTORISE = 'coeur/src/env.ts';

const EXTENSIONS = new Set(['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs', '.astro', '.svelte', '.py']);

/** Lecteurs interdits : nom affiché et motif cherché ligne par ligne. */
const LECTEURS_INTERDITS = [
  ['process.env', /\bprocess\s*\.\s*env\b|\bprocess\s*\[\s*['"`]env['"`]\s*\]/],
  ['import depuis process', /\bimport\s+(?:\*\s*as\s+\w+|[^;]*\{[^}]*\benv\b[^}]*\})\s*from\s*['"`](?:node:)?process['"`]/],
  ['require(process)', /\brequire\s*\(\s*['"`](?:node:)?process['"`]\s*\)/],
  ['déstructuration de process', /\{[^}]*\benv\b[^}]*\}\s*=\s*(?:globalThis\s*\.\s*)?process\b/],
  ['import.meta.env', /\bimport\s*\.\s*meta\s*\.\s*env\b/],
  ['os.environ', /\bos\s*\.\s*environ\b/],
  ['os.getenv', /\bos\s*\.\s*getenv\b/],
  ['import os as …', /\bimport\s+os\s+as\s+\w+/],
  ['from os import environ/getenv', /\bfrom\s+os\s+import\b.*\b(environ|getenv)\b/],
];

/** Rend la liste des fautes, sous la forme « fichier:ligne — lecteur ». */
export function verifierEnv(racine = RACINE_DEPOT) {
  const fautes = [];
  for (const dossier of DOSSIERS_SURVEILLES) {
    for (const fichier of listerFichiers(join(racine, dossier))) {
      if (!EXTENSIONS.has(extname(fichier))) continue;
      const relatif = cheminRelatif(racine, fichier);
      if (relatif === LECTEUR_AUTORISE) continue;
      const lignes = readFileSync(fichier, 'utf8').split('\n');
      lignes.forEach((ligne, index) => {
        for (const [nom, motif] of LECTEURS_INTERDITS) {
          if (motif.test(ligne)) {
            fautes.push(`${relatif}:${index + 1} — lecture de l'environnement par « ${nom} » ; passe par ${LECTEUR_AUTORISE}`);
          }
        }
      });
    }
  }
  return fautes;
}

if (import.meta.main) {
  process.exitCode = rapporter('lecteur d’environnement', verifierEnv());
}
