import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { FILM_MAX_OCTETS, FILM_MORCEAU_OCTETS, diffuserFilm, type LireFilm } from '../src/film.ts';
import { SCRIPT_CURSEUR, piloteDePlaywright, type PageJeu } from '../src/pilote-playwright.ts';

const lecture = (donnees: Buffer): LireFilm =>
  async function* (_chemin, morceau) {
    for (let i = 0; i < donnees.length; i += morceau) yield donnees.subarray(i, i + morceau);
  };

describe('diffuserFilm', () => {
  it('diffuse par morceaux numérotés puis une ligne de fin avec la taille et l’empreinte', async () => {
    const film = Buffer.alloc(FILM_MORCEAU_OCTETS * 2 + 10, 7);
    const lignes: string[] = [];
    expect(await diffuserFilm('/x', (l) => lignes.push(l), lecture(film))).toBe(film.length);
    expect(lignes).toHaveLength(4);
    const recu = Buffer.concat(lignes.slice(0, 3).map((l, i) => {
      const m = JSON.parse(l) as { film: { n: number; d: string } };
      expect(m.film.n).toBe(i);
      return Buffer.from(m.film.d, 'base64');
    }));
    expect(recu.equals(film)).toBe(true);
    expect(JSON.parse(lignes[3]!)).toEqual({ film: { fin: true, octets: film.length, sha256: createHash('sha256').update(film).digest('hex') } });
  });
  it('ne diffuse pas de ligne de fin pour un film trop gros', async () => {
    const lignes: string[] = [];
    async function* enorme(): AsyncGenerator<Buffer> {
      const bloc = Buffer.alloc(32 * 1024 * 1024);
      for (let i = 0; i < 5; i++) yield bloc;
    }
    expect(await diffuserFilm('/x', (l) => lignes.push(l), () => enorme())).toBeUndefined();
    expect(lignes.some((l) => l.includes('"fin"'))).toBe(false);
    expect(FILM_MAX_OCTETS).toBeLessThan(5 * 32 * 1024 * 1024);
  });
});

describe('curseur du film', () => {
  it('est injecté dans la page avant toute autre chose, sans balise de style ni ressource externe', async () => {
    const scripts: string[] = [];
    const page = {
      route: async () => undefined,
      addInitScript: async (s: string) => void scripts.push(s),
    } as unknown as PageJeu;
    await piloteDePlaywright(page, { hotes: [], tailleFichier: async () => 0 });
    expect(scripts).toEqual([SCRIPT_CURSEUR]);
    expect(SCRIPT_CURSEUR).not.toMatch(/setAttribute|<style|http/);
    expect(SCRIPT_CURSEUR).toContain('mousemove');
  });
});
