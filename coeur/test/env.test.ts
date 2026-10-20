import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ErreurEnvironnement, lireEnvironnement } from '../src/env.ts';

const FICHIER_ENV = fileURLToPath(new URL('../src/env.ts', import.meta.url));

/** Lance env.ts dans un processus neuf, avec exactement l'environnement donné. */
function demarrerAvec(environnement: Record<string, string>) {
  return spawnSync(process.execPath, [FICHIER_ENV], { env: environnement, encoding: 'utf8' });
}

describe('env.ts', () => {
  it('écoute sur 4321 et 127.0.0.1 quand PORT et HOTE sont absents', () => {
    const env = lireEnvironnement({});
    expect(env.PORT).toBe(4321);
    expect(env.HOTE).toBe('127.0.0.1');
    expect(env.NODE_ENV).toBe('production');
  });

  it('convertit un PORT valide en nombre', () => {
    expect(lireEnvironnement({ PORT: '8080' }).PORT).toBe(8080);
  });

  it('accepte une empreinte de commit dans REGIE_VERSION et la laisse absente sinon', () => {
    expect(lireEnvironnement({ REGIE_VERSION: '164f9e2' }).REGIE_VERSION).toBe('164f9e2');
    expect(lireEnvironnement({}).REGIE_VERSION).toBeUndefined();
    expect(lireEnvironnement({ REGIE_VERSION: '' }).REGIE_VERSION).toBeUndefined();
  });

  it('refuse un REGIE_VERSION qui n’est pas une empreinte, sans recopier la valeur', () => {
    expect(() => lireEnvironnement({ REGIE_VERSION: 'main"><script>' })).toThrow(/REGIE_VERSION : /);
    expect(() => lireEnvironnement({ REGIE_VERSION: 'main"><script>' })).not.toThrow(/script/);
  });

  it('rend un environnement figé', () => {
    expect(Object.isFrozen(lireEnvironnement({}))).toBe(true);
  });

  it.each(['abc', '0', '70000', '-1', '12.5'])('refuse PORT=%s en nommant la variable', (valeur) => {
    expect(() => lireEnvironnement({ PORT: valeur })).toThrow(ErreurEnvironnement);
    try {
      lireEnvironnement({ PORT: valeur });
    } catch (erreur) {
      const message = (erreur as Error).message;
      expect(message).toContain('PORT : ');
      expect(message).not.toContain(valeur);
    }
  });

  it('refuse un NODE_ENV inconnu sans recopier la valeur', () => {
    expect(() => lireEnvironnement({ NODE_ENV: 'valeur-inconnue' })).toThrow(/NODE_ENV : /);
    expect(() => lireEnvironnement({ NODE_ENV: 'valeur-inconnue' })).not.toThrow(/valeur-inconnue/);
  });

  it('arrête le processus avec le code 1 sur PORT=abc, sans écrire la valeur', () => {
    const resultat = demarrerAvec({ PORT: 'abc-valeur-a-taire' });
    expect(resultat.status).toBe(1);
    expect(resultat.stderr).toContain('PORT : ');
    expect(resultat.stderr + resultat.stdout).not.toContain('abc-valeur-a-taire');
  });

  it('démarre sans erreur quand l’environnement est vide', () => {
    const resultat = demarrerAvec({});
    expect(resultat.status).toBe(0);
    expect(resultat.stderr).toBe('');
  });
});
