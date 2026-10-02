import { existsSync } from 'node:fs';
import { Writable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { construireServeur } from '../src/serveur.ts';

const ENTREE = fileURLToPath(new URL('../dist/server/entry.mjs', import.meta.url));

describe('serveur du cœur', () => {
  let app: Awaited<ReturnType<typeof construireServeur>>;

  beforeAll(async () => {
    if (!existsSync(ENTREE)) {
      throw new Error('coeur/dist absent : lance `npm run build` avant les tests.');
    }
    app = await construireServeur();
    await app.ready();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('sert la page d’accueil d’Astro sur GET /', async () => {
    const reponse = await app.inject({ method: 'GET', url: '/' });
    expect(reponse.statusCode).toBe(200);
    expect(reponse.headers['content-type']).toMatch(/^text\/html/);
    expect(reponse.body).toContain('regie — ton studio de vidéos verticales');
  });

  it('sert un fichier statique de dist/client par @fastify/static', async () => {
    const reponse = await app.inject({ method: 'GET', url: '/favicon.svg' });
    expect(reponse.statusCode).toBe(200);
    expect(reponse.headers['content-type']).toMatch(/^image\/svg\+xml/);
    expect(reponse.body).toContain('<svg');
  });

  it('répond 404 à une route inconnue (aucune route attrape-tout)', async () => {
    const reponse = await app.inject({ method: 'GET', url: '/api/v1/inexistant' });
    expect(reponse.statusCode).toBe(404);
  });

  it('ne journalise pas l’adresse IP du client', async () => {
    const lignes: string[] = [];
    const journal = new Writable({
      write(morceau, _encodage, suite) {
        lignes.push(String(morceau));
        suite();
      },
    });
    const autre = await construireServeur({ journal });
    try {
      await autre.inject({ method: 'GET', url: '/favicon.svg', remoteAddress: '203.0.113.7' });
    } finally {
      await autre.close();
    }
    const requetes = lignes.filter((ligne) => ligne.includes('"req"'));
    expect(requetes.length).toBeGreaterThan(0);
    expect(requetes[0]).toContain('"url":"/favicon.svg"');
    expect(lignes.join('')).not.toContain('203.0.113.7');
  });
});
