// Histoire 1.2 : une première page sûre, lisible et accessible.
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { COOKIE_SESSION } from '../src/auth/cookies.ts';
import { construireServeur } from '../src/serveur.ts';
import { lienSource } from '../src/source.ts';
import { creerServicesDeTest } from './faux-auth.ts';

const ENTREE = fileURLToPath(new URL('../dist/server/entry.mjs', import.meta.url));

describe('page d’accueil', () => {
  let app: Awaited<ReturnType<typeof construireServeur>>;
  let page: { csp: string; html: string };

  beforeAll(async () => {
    if (!existsSync(ENTREE)) {
      throw new Error('coeur/dist absent : lance `npm run build` avant les tests.');
    }
    const banc = creerServicesDeTest(undefined);
    const marqueId = await banc.marques.creer();
    const cookie = `${COOKIE_SESSION}=${await banc.sessions.creer({ marqueId, sub: 'sub-test', email: undefined, authentifieLe: new Date() })}`;
    app = await construireServeur({ services: banc.services });
    await app.ready();
    const reponse = await app.inject({ method: 'GET', url: '/', headers: { cookie } });
    page = { csp: String(reponse.headers['content-security-policy'] ?? ''), html: reponse.body };
  });

  afterAll(async () => {
    await app?.close();
  });

  it('envoie une CSP qui n’autorise que le même domaine', () => {
    const directives = page.csp.split(';').map((d) => d.trim());
    expect(directives).toContain("default-src 'self'");
    expect(directives).toContain("object-src 'none'");
    expect(directives).toContain("base-uri 'self'");
    expect(page.csp).not.toMatch(/'unsafe-inline'|'unsafe-eval'|https?:/);
  });

  it('ne charge aucune ressource d’un autre domaine', () => {
    const chargements = [...page.html.matchAll(/<(?:script|link|img|iframe|video|audio|source)\b[^>]*>/g)].map((m) => m[0]);
    for (const balise of chargements) {
      expect(balise).not.toMatch(/(?:src|href)="(?:https?:)?\/\//);
    }
    expect(page.html).not.toContain('@import');
    expect(page.html).not.toMatch(/url\((?:["']?)(?:https?:)?\/\//);
  });

  it('pose les jetons de couleur sur :root et un fond sur body', () => {
    for (const jeton of ['--fond:#0c0c0d', '--surface:#17171a', '--texte:#f4f3f0', '--doux:#b3b1aa', '--accent:#ff8fb1', '--rayon:14px']) {
      expect(page.html).toContain(jeton);
    }
    expect(page.html).toMatch(/body\{[^}]*background:var\(--fond\)/);
  });

  it('cache vraiment [hidden] et respecte le mouvement réduit', () => {
    expect(page.html).toContain('[hidden]{display:none!important}');
    expect(page.html).toMatch(/@media \(prefers-reduced-motion:reduce\)\{[^}]*animation-duration:\.01ms!important/);
  });

  it('montre l’en-tête commun et, en pied de page, le lien vers le code source en service', () => {
    expect(page.html).toMatch(/<html lang="fr">/);
    expect(page.html).toContain('name="viewport" content="width=device-width, initial-scale=1');
    expect(page.html).toMatch(/<header class="entete"/);
    expect(page.html).toMatch(new RegExp(`<footer class="pied"[^]*href="${lienSource(undefined)}"`));
    expect(page.html).toContain('<main');
  });
});

describe('lien vers le code source', () => {
  it('pointe sur le commit en service, ou sur main en développement', () => {
    expect(lienSource('164f9e2')).toBe('https://github.com/BenjaminDuthe/regie/tree/164f9e2');
    expect(lienSource(undefined)).toBe('https://github.com/BenjaminDuthe/regie/tree/main');
  });
});
