import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomInt } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { RACINE_DEPOT } from './commun.mjs';
import { scannerSecrets } from './scanner-secrets.mjs';

const temporaires = [];

/** Clé factice au format d'un identifiant d'accès AWS, fabriquée à l'exécution. */
function cleFactice() {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let suite = '';
  for (let i = 0; i < 16; i += 1) suite += alphabet[randomInt(alphabet.length)];
  return ['AK', 'IA', suite].join('');
}

function depotGit() {
  const racine = mkdtempSync(join(tmpdir(), 'regie-secrets-test-'));
  temporaires.push(racine);
  spawnSync('git', ['init', '--quiet'], { cwd: racine });
  copyFileSync(join(RACINE_DEPOT, '.gitleaks.toml'), join(racine, '.gitleaks.toml'));
  return racine;
}

afterEach(() => {
  for (const racine of temporaires.splice(0)) rmSync(racine, { recursive: true, force: true });
});

describe('scanner-secrets', () => {
  it('passe sur le dépôt', () => {
    expect(scannerSecrets()).toEqual([]);
  }, 60_000);

  it('échoue sur une clé factice type AWS en nommant fichier et règle, sans la valeur', () => {
    const racine = depotGit();
    const cle = cleFactice();
    writeFileSync(join(racine, 'reglages.ts'), `export const cle = '${cle}';\n`);
    const fautes = scannerSecrets(racine);
    expect(fautes).toHaveLength(1);
    expect(fautes[0]).toMatch(/reglages\.ts:1 — règle « aws-access-token »/);
    expect(fautes[0]).not.toContain(cle);
  });

  it('trouve une clé factice restée dans l’historique, même supprimée de l’arbre', () => {
    const racine = depotGit();
    const cle = cleFactice();
    const commettre = (message) =>
      spawnSync('git', ['-c', 'user.name=test', '-c', 'user.email=test@exemple.invalid', '-c', 'commit.gpgsign=false', 'commit', '--quiet', '-m', message], { cwd: racine });
    writeFileSync(join(racine, 'ancien.ts'), `export const cle = '${cle}';\n`);
    spawnSync('git', ['add', 'ancien.ts'], { cwd: racine });
    expect(commettre('ajoute').status).toBe(0);
    unlinkSync(join(racine, 'ancien.ts'));
    spawnSync('git', ['rm', '--quiet', '--cached', 'ancien.ts'], { cwd: racine });
    expect(commettre('retire').status).toBe(0);
    const fautes = scannerSecrets(racine);
    expect(fautes).toHaveLength(1);
    expect(fautes[0]).toMatch(/ancien\.ts:1 — règle « aws-access-token » \(commit [0-9a-f]{8}\)/);
    expect(fautes[0]).not.toContain(cle);
  });

  it('respecte .gitignore pour l’arbre de travail', () => {
    const racine = depotGit();
    writeFileSync(join(racine, '.gitignore'), '.env\n');
    writeFileSync(join(racine, '.env'), `CLE=${cleFactice()}\n`);
    expect(scannerSecrets(racine)).toEqual([]);
  });
});
