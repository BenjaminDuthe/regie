import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { verifierEnv } from './verifier-env.mjs';

const temporaires = [];

/** Fabrique un faux dépôt à partir d'un dictionnaire { chemin: contenu }. */
function depot(fichiers) {
  const racine = mkdtempSync(join(tmpdir(), 'regie-env-'));
  temporaires.push(racine);
  for (const [chemin, contenu] of Object.entries(fichiers)) {
    mkdirSync(dirname(join(racine, chemin)), { recursive: true });
    writeFileSync(join(racine, chemin), contenu);
  }
  return racine;
}

afterEach(() => {
  for (const racine of temporaires.splice(0)) rmSync(racine, { recursive: true, force: true });
});

describe('verifier-env', () => {
  it('passe sur le dépôt', () => {
    expect(verifierEnv()).toEqual([]);
  });

  it('accepte la lecture dans coeur/src/env.ts', () => {
    expect(verifierEnv(depot({ 'coeur/src/env.ts': 'const port = process.env.PORT;\n' }))).toEqual([]);
  });

  it('échoue sur process.env dans coeur/src/app.ts en nommant fichier et ligne', () => {
    const racine = depot({ 'coeur/src/app.ts': "import x from 'y';\n\nconst x = process.env.X;\n" });
    const fautes = verifierEnv(racine);
    expect(fautes).toHaveLength(1);
    expect(fautes[0]).toMatch(/^coeur\/src\/app\.ts:3 /);
  });

  it.each([
    ['paquets/contrats/src/a.ts', 'const a = import.meta.env.MODE;'],
    ['coeur/src/pages/index.astro', 'const b = process["env"].B;'],
    ['services/transcription/main.py', 'import os\nc = os.environ["C"]'],
    ['services/voix/main.py', 'import os\nd = os.getenv("D")'],
    ['services/langage/main.py', 'from os import getenv'],
    ['coeur/src/a.ts', "import { env } from 'node:process';"],
    ['coeur/src/b.ts', "import * as p from 'process';"],
    ['coeur/src/c.cjs', "const p = require('node:process');"],
    ['coeur/src/d.ts', 'const { argv, env } = process;'],
    ['services/e/main.py', 'import os as systeme'],
    ['coeur/src/f.tsx', 'const f = process.env.F;'],
    ['coeur/src/g.jsx', 'const g = process.env.G;'],
  ])('échoue sur un lecteur interdit dans %s', (chemin, contenu) => {
    const fautes = verifierEnv(depot({ [chemin]: contenu }));
    expect(fautes).toHaveLength(1);
    expect(fautes[0].startsWith(`${chemin}:`)).toBe(true);
  });

  it('ignore node_modules et dist', () => {
    const racine = depot({
      'coeur/node_modules/x/index.js': 'process.env.X',
      'coeur/dist/server/entry.mjs': 'process.env.X',
    });
    expect(verifierEnv(racine)).toEqual([]);
  });
});
