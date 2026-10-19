// regie — scan de secrets bloquant (NFR-14), par gitleaks et .gitleaks.toml.
// Deux passes : l'historique git (chaque commit), puis l'arbre de travail
// (fichiers suivis et non suivis, hors .gitignore). Chaque fuite nomme le fichier,
// la ligne et la règle, jamais la valeur (--redact).

import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { RACINE_DEPOT, rapporter } from './commun.mjs';

function lancerGitleaks(arguments_, cwd, config) {
  // --exit-code 2 : 0 = aucune fuite, 2 = fuites ; tout autre code (dont 1) = erreur de gitleaks.
  const resultat = spawnSync(
    'gitleaks',
    [...arguments_, '--config', config, '--no-banner', '--redact', '--exit-code', '2', '--log-level', 'error', '--report-format', 'json', '--report-path', '-'],
    { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
  );
  if (resultat.error !== undefined) {
    if (resultat.error.code === 'ENOENT') {
      throw new Error('gitleaks introuvable : installe-le (version de deploiement/versions.json), le scan de secrets est bloquant.');
    }
    throw new Error(`gitleaks n'a pas pu être lancé : ${resultat.error.message}`);
  }
  if (resultat.status !== 0 && resultat.status !== 2) {
    throw new Error(`gitleaks a échoué (code ${resultat.status}) : ${(resultat.stderr ?? '').trim()}`);
  }
  const debut = resultat.stdout.indexOf('[');
  if (debut === -1) {
    throw new Error(`gitleaks n'a pas produit de rapport JSON (code ${resultat.status}) : ${(resultat.stderr ?? '').trim()}`);
  }
  return JSON.parse(resultat.stdout.slice(debut));
}

function git(arguments_, cwd) {
  return spawnSync('git', arguments_, { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}

/** Rend la liste des fuites trouvées dans le dépôt situé à `racine`. */
export function scannerSecrets(racine = RACINE_DEPOT) {
  const config = join(racine, '.gitleaks.toml');
  const fautes = [];

  // 1. Historique : chaque commit atteignable (la CI clone tout l'historique).
  if (git(['rev-parse', '--verify', 'HEAD'], racine).status === 0) {
    for (const fuite of lancerGitleaks(['git', '.'], racine, config)) {
      fautes.push(`${fuite.File}:${fuite.StartLine} — règle « ${fuite.RuleID} » (commit ${fuite.Commit.slice(0, 8)})`);
    }
  }

  // 2. Arbre de travail : copie des fichiers que git verrait, pour respecter .gitignore.
  const liste = git(['ls-files', '--cached', '--others', '--exclude-standard', '-z'], racine);
  if (liste.error !== undefined) throw new Error(`git n'a pas pu être lancé : ${liste.error.message}`);
  if (liste.status !== 0) throw new Error(`git ls-files a échoué : ${(liste.stderr ?? '').trim()}`);
  const copie = mkdtempSync(join(tmpdir(), 'regie-secrets-'));
  try {
    for (const fichier of liste.stdout.split('\0').filter(Boolean)) {
      const cible = join(copie, fichier);
      mkdirSync(dirname(cible), { recursive: true });
      try {
        copyFileSync(join(racine, fichier), cible);
      } catch {
        // Fichier suivi mais supprimé de l'arbre de travail : rien à scanner.
      }
    }
    for (const fuite of lancerGitleaks(['dir', '.'], copie, config)) {
      fautes.push(`${fuite.File}:${fuite.StartLine} — règle « ${fuite.RuleID} »`);
    }
  } finally {
    rmSync(copie, { recursive: true, force: true });
  }
  return [...new Set(fautes)];
}

if (import.meta.main) {
  process.exitCode = rapporter('scan de secrets (gitleaks)', scannerSecrets());
}
