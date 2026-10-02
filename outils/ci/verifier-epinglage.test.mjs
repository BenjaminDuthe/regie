import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { RACINE_DEPOT } from './commun.mjs';
import { verifierEpinglage } from './verifier-epinglage.mjs';

const temporaires = [];

/** Copie les manifestes du dépôt dans un dossier temporaire, pour y glisser une faute. */
function copieDesManifestes() {
  const racine = mkdtempSync(join(tmpdir(), 'regie-epinglage-'));
  temporaires.push(racine);
  for (const fichier of [
    '.node-version',
    'package.json',
    'package-lock.json',
    'pyproject.toml',
    'requirements.lock',
    'deploiement/versions.json',
    'coeur/package.json',
    'paquets/contrats/package.json',
  ]) {
    cpSync(join(RACINE_DEPOT, fichier), join(racine, fichier), { recursive: true });
  }
  return racine;
}

function modifier(racine, fichier, remplacer) {
  const chemin = join(racine, fichier);
  writeFileSync(chemin, remplacer(readFileSync(chemin, 'utf8')));
}

afterEach(() => {
  for (const racine of temporaires.splice(0)) rmSync(racine, { recursive: true, force: true });
});

describe('verifier-epinglage', () => {
  it('passe sur le dépôt', () => {
    expect(verifierEpinglage()).toEqual([]);
  });

  it('passe sur la copie intacte des manifestes', () => {
    expect(verifierEpinglage(copieDesManifestes())).toEqual([]);
  });

  it.each(['^4.6.5', '~4.6.5', '4.7.0-rc.1', '4.7.0-beta.2', 'latest'])(
    'échoue sur "zod": "%s" en nommant le manifeste et le paquet',
    (version) => {
      const racine = copieDesManifestes();
      modifier(racine, 'coeur/package.json', (texte) => texte.replace('"zod": "4.6.5"', `"zod": "${version}"`));
      const fautes = verifierEpinglage(racine);
      expect(fautes.some((faute) => faute.startsWith('coeur/package.json : « zod »'))).toBe(true);
    },
  );

  it('échoue sur une version exacte qui contredit versions.json', () => {
    const racine = copieDesManifestes();
    modifier(racine, 'coeur/package.json', (texte) => texte.replace('"fastify": "5.12.5"', '"fastify": "5.12.4"'));
    expect(verifierEpinglage(racine)).toContainEqual(expect.stringMatching(/^coeur\/package\.json : « fastify » en 5\.12\.4/));
  });

  it('échoue sur un engines.node et un .node-version divergents', () => {
    const racine = copieDesManifestes();
    modifier(racine, 'package.json', (texte) => texte.replace('>=26.5.0 <27', '>=24'));
    writeFileSync(join(racine, '.node-version'), '24.0.0\n');
    const fautes = verifierEpinglage(racine);
    expect(fautes).toContainEqual(expect.stringMatching(/^package\.json : engines\.node/));
    expect(fautes).toContainEqual(expect.stringMatching(/^\.node-version/));
  });

  it('échoue sur une dépendance Python non épinglée', () => {
    const racine = copieDesManifestes();
    modifier(racine, 'pyproject.toml', (texte) => texte.replace('"pydantic==2.13.5"', '"pydantic>=2.13"'));
    expect(verifierEpinglage(racine)).toContainEqual(expect.stringMatching(/^pyproject\.toml : « pydantic>=2\.13 »/));
  });

  it('échoue sur une requires-python trop large', () => {
    const racine = copieDesManifestes();
    modifier(racine, 'pyproject.toml', (texte) => texte.replace('"==3.14.*"', '">=3.12"'));
    expect(verifierEpinglage(racine)).toContainEqual(expect.stringMatching(/^pyproject\.toml : requires-python/));
  });

  it('échoue sur un verrou Python sans empreinte', () => {
    const racine = copieDesManifestes();
    modifier(racine, 'requirements.lock', (texte) => texte.replace(/genson==1\.4\.0 \\\n(\s+--hash=sha256:[0-9a-f]+ \\?\n?)+/, 'genson==1.4.0\n'));
    expect(verifierEpinglage(racine)).toContainEqual(expect.stringMatching(/^requirements\.lock : « genson » n'a pas d'empreinte/));
  });

  it('échoue sur une image de conteneur sans empreinte', () => {
    const racine = copieDesManifestes();
    mkdirSync(join(racine, 'deploiement/images'), { recursive: true });
    writeFileSync(join(racine, 'deploiement/images/x.Containerfile'), 'FROM docker.io/library/node:26\n');
    expect(verifierEpinglage(racine)).toContainEqual(expect.stringMatching(/^deploiement\/images\/x\.Containerfile:1 : image/));
  });
  it('échoue quand package-lock.json verrouille une autre version que le manifeste', () => {
    const racine = copieDesManifestes();
    modifier(racine, 'package-lock.json', (texte) => {
      const verrou = JSON.parse(texte);
      verrou.packages['node_modules/fastify'].version = '5.12.4';
      return JSON.stringify(verrou, null, 2);
    });
    expect(verifierEpinglage(racine)).toContainEqual(
      expect.stringMatching(/^coeur\/package\.json : « fastify » en 5\.12\.5, package-lock\.json verrouille 5\.12\.4/),
    );
  });

  it('échoue quand requirements.lock contredit le pyproject', () => {
    const racine = copieDesManifestes();
    modifier(racine, 'requirements.lock', (texte) => texte.replace('pydantic==2.13.5', 'pydantic==2.13.4'));
    expect(verifierEpinglage(racine)).toContainEqual(
      expect.stringMatching(/^requirements\.lock : « pydantic » verrouillé en 2\.13\.4/),
    );
  });

  it.each(['.forgejo/workflows/x.yaml', 'deploiement/compose.x.yaml'])(
    'échoue sur une image sans empreinte dans %s',
    (fichier) => {
      const racine = copieDesManifestes();
      mkdirSync(join(racine, fichier, '..'), { recursive: true });
      writeFileSync(join(racine, fichier), 'services:\n  a:\n    image: node:26\n');
      expect(verifierEpinglage(racine)).toContainEqual(`${fichier}:3 : image « node:26 » non épinglée par empreinte (@sha256:…)`);
    },
  );

  it('lit tout le tableau dependencies malgré une dépendance avec extras', () => {
    const racine = copieDesManifestes();
    modifier(racine, 'pyproject.toml', (texte) =>
      texte.replace('"pydantic==2.13.5",', '"pydantic[email]==2.13.5",\n  "rich>=13",'),
    );
    const fautes = verifierEpinglage(racine);
    expect(fautes).toContainEqual(expect.stringMatching(/^pyproject\.toml : « rich>=13 »/));
    expect(fautes.some((faute) => faute.includes('pydantic'))).toBe(false);
  });
});
