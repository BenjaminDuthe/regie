import { describe, expect, it } from 'vitest';
import { LAISSEZ_PASSER_DUREE_MAX_S, signerLaissezPasser, verifierLaissezPasser } from '../src/laissez-passer.ts';

const CLE = Buffer.alloc(32, 1);
const T0 = Date.parse('2026-10-21T10:00:00Z');

describe('laissez-passer de la capture', () => {
  it('se signe et se vérifie, avec tâche, hôtes et échéance', () => {
    const jeton = signerLaissezPasser(CLE, 't1', ['demo.exemple.fr'], 600, T0);
    expect(verifierLaissezPasser(CLE, jeton, T0 + 1000)).toEqual({ ok: true, contenu: { tache: 't1', hotes: ['demo.exemple.fr'], expireLe: T0 / 1000 + 600 } });
  });
  it('refuse une autre clé, une charge modifiée, une forme tordue et un jeton expiré', () => {
    const jeton = signerLaissezPasser(CLE, 't1', ['a.exemple.fr'], 60, T0);
    expect(verifierLaissezPasser(Buffer.alloc(32, 2), jeton, T0)).toEqual({ ok: false, cause: 'SIGNATURE' });
    const [v, , s] = jeton.split('.');
    expect(verifierLaissezPasser(CLE, `${v}.${Buffer.from('{"t":"x","h":["b.exemple.fr"],"e":9999999999}').toString('base64url')}.${s}`, T0)).toEqual({ ok: false, cause: 'SIGNATURE' });
    expect(verifierLaissezPasser(CLE, 'nimporte quoi', T0)).toEqual({ ok: false, cause: 'FORME' });
    expect(verifierLaissezPasser(CLE, `${jeton}.x`, T0)).toEqual({ ok: false, cause: 'FORME' });
    expect(verifierLaissezPasser(CLE, jeton, T0 + 61_000)).toEqual({ ok: false, cause: 'EXPIRE' });
  });
  it('refuse de signer avec une clé courte ou une durée hors bornes', () => {
    expect(() => signerLaissezPasser(Buffer.alloc(8), 't', [], 60)).toThrow();
    expect(() => signerLaissezPasser(CLE, 't', [], 0)).toThrow();
    expect(() => signerLaissezPasser(CLE, 't', [], LAISSEZ_PASSER_DUREE_MAX_S + 1)).toThrow();
  });
});
