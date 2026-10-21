import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { analyserLicences, licenceLibre, produireRecapitulatif, verifierLicences } from './verifier-licences.mjs';

const temporaires = [];

/** Faux dépôt : verrou npm { nom: licence }, verrou pip (texte), déclarations, fichiers en plus. */
function depot({ npm = { ok: 'MIT' }, pip = '', declarations = {}, fichiers = {}, recapitulatif = true } = {}) {
  const racine = mkdtempSync(join(tmpdir(), 'regie-licences-'));
  temporaires.push(racine);
  const packages = { '': { name: 'regie' }, coeur: { name: '@regie/coeur' }, 'node_modules/@regie/coeur': { resolved: 'coeur', link: true } };
  for (const [nom, licence] of Object.entries(npm)) packages[`node_modules/${nom}`] = { version: '1.0.0', ...(licence ? { license: licence } : {}) };
  const contenus = {
    'package-lock.json': JSON.stringify({ lockfileVersion: 3, packages }),
    'requirements.lock': pip,
    'deploiement/licences-tiers.json': JSON.stringify({ pip: {}, polices: [], modeles: [], musiques: [], images: [], ...declarations }),
    ...fichiers,
  };
  for (const [chemin, contenu] of Object.entries(contenus)) {
    mkdirSync(dirname(join(racine, chemin)), { recursive: true });
    writeFileSync(join(racine, chemin), contenu);
  }
  if (recapitulatif) writeFileSync(join(racine, 'LICENCES-TIERS.md'), produireRecapitulatif(analyserLicences(racine)));
  return racine;
}

afterEach(() => {
  for (const racine of temporaires.splice(0)) rmSync(racine, { recursive: true, force: true });
});

describe('licenceLibre', () => {
  it.each(['MIT', 'Apache-2.0', '(MIT OR GPL-3.0-only)', 'MIT AND BSD-3-Clause', 'GPL-2.0-only WITH Classpath-exception-2.0', 'AGPL-3.0-only'])(
    'accepte %s',
    (licence) => expect(licenceLibre(licence)).toBe(true),
  );

  it.each([undefined, '', 'UNLICENSED', 'SEE LICENSE IN LICENSE.txt', 'CC-BY-NC-4.0', 'MIT AND Proprietary', '(MIT OR', 'BUSL-1.1', 'SSPL-1.0'])(
    'refuse %s',
    (licence) => expect(licenceLibre(licence)).toBe(false),
  );

  it('accepte une alternative libre dans un OR et refuse un AND dont un terme est fermé', () => {
    expect(licenceLibre('Proprietary OR MIT')).toBe(true);
    expect(licenceLibre('MIT AND CC-BY-NC-4.0')).toBe(false);
  });
});

describe('verifier-licences', () => {
  it('passe sur le dépôt, récapitulatif à jour', () => {
    expect(verifierLicences()).toEqual([]);
  });

  it('accepte un dépôt aux licences libres', () => {
    expect(verifierLicences(depot())).toEqual([]);
  });

  it('ignore les paquets du dépôt (liens de workspace)', () => {
    const analyse = analyserLicences(depot());
    expect(analyse.npm.map((p) => p.nom)).toEqual(['ok']);
  });

  it('échoue sur une dépendance npm sans licence libre, en la nommant', () => {
    const fautes = verifierLicences(depot({ npm: { ok: 'MIT', ferme: 'CC-BY-NC-4.0' } }));
    expect(fautes).toHaveLength(1);
    expect(fautes[0]).toContain('« ferme@1.0.0 »');
    expect(fautes[0]).toContain('CC-BY-NC-4.0');
  });

  it('échoue sur une dépendance npm sans licence déclarée', () => {
    const fautes = verifierLicences(depot({ npm: { muet: '' } }));
    expect(fautes[0]).toContain('« muet@1.0.0 »');
    expect(fautes[0]).toContain('aucune licence déclarée');
  });

  it('échoue sur un paquet pip non déclaré ou sous licence fermée', () => {
    const pip = 'libre==1.0 \\\n    --hash=sha256:aa\nferme==2.0 \\\n    --hash=sha256:bb\ninconnu==3.0 \\\n    --hash=sha256:cc\n';
    const fautes = verifierLicences(depot({ pip, declarations: { pip: { libre: 'MIT', ferme: 'Proprietary' } } }));
    expect(fautes).toHaveLength(2);
    expect(fautes.join('\n')).toMatch(/pip : « ferme==2\.0 » sous « Proprietary »/);
    expect(fautes.join('\n')).toMatch(/pip : « inconnu==3\.0 » sans licence déclarée/);
  });

  it('normalise les noms pip (PEP 503)', () => {
    const racine = depot({ pip: 'Typing_Extensions==4.0 \\\n', declarations: { pip: { 'typing-extensions': 'PSF-2.0' } } });
    expect(verifierLicences(racine)).toEqual([]);
  });

  it('échoue sur une police versionnée sans déclaration', () => {
    const fautes = verifierLicences(depot({ fichiers: { 'coeur/public/polices/x.woff2': 'x' } }));
    expect(fautes).toHaveLength(1);
    expect(fautes[0]).toContain('coeur/public/polices/x.woff2');
  });

  it('accepte une police déclarée avec licence libre et source', () => {
    const racine = depot({
      fichiers: { 'coeur/public/polices/x.woff2': 'x' },
      declarations: { polices: [{ nom: 'X', fichier: 'coeur/public/polices/x.woff2', licence: 'OFL-1.1', source: 'https://exemple.test/x' }] },
    });
    expect(verifierLicences(racine)).toEqual([]);
  });

  it.each([
    ['modeles', { nom: 'M', licence: 'Llama-2-Community', source: 'https://exemple.test/m' }, 'sous « Llama-2-Community »'],
    ['musiques', { nom: 'Z', licence: 'libre de droits' }, 'sans source vérifiable'],
    ['musiques', { nom: 'Y', licence: 'CC-BY-NC-4.0', source: 'https://exemple.test/y' }, 'sous « CC-BY-NC-4.0 »'],
    ['images', { nom: 'W', licence: 'Proprietary', source: 'https://exemple.test/w' }, 'sous « Proprietary »'],
    ['images', { nom: 'V', licence: 'MIT' }, 'sans source vérifiable'],
  ])('échoue sur un composant de « %s » refusé', (liste, element, cause) => {
    const fautes = verifierLicences(depot({ declarations: { [liste]: [element] } }));
    expect(fautes.join('\n')).toContain(cause);
  });

  it('échoue si modeles.lock existe sans modèle déclaré', () => {
    const fautes = verifierLicences(depot({ fichiers: { 'deploiement/modeles.lock': '{}' } }));
    expect(fautes[0]).toContain('modeles.lock');
  });

  it('échoue si LICENCES-TIERS.md est absent ou périmé', () => {
    expect(verifierLicences(depot({ recapitulatif: false }))[0]).toContain('absent');
    const racine = depot();
    writeFileSync(join(racine, 'package-lock.json'), readFileSync(join(racine, 'package-lock.json'), 'utf8').replace('"ok"', '"autre"').replace('node_modules/ok', 'node_modules/autre'));
    expect(verifierLicences(racine)[0]).toContain('périmé');
  });
});
