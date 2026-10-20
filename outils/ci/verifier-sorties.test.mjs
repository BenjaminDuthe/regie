import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { verifierSorties } from './verifier-sorties.mjs';

const temporaires = [];

const LISTE = {
  conteneurs: { coeur: 'SMTP', publication: 'réseaux sociaux' },
  hotes: [{ hote: 'github.com', raison: 'lien source', fichiers: ['coeur/src/source.ts'] }],
  espacesDeNoms: ['www.w3.org'],
  fichiersReseau: ['services/publication/src/envoi.ts'],
};

/** Faux dépôt : liste autorisée (modifiable) et fichiers { chemin: contenu }. */
function depot(fichiers = {}, liste = LISTE) {
  const racine = mkdtempSync(join(tmpdir(), 'regie-sorties-'));
  temporaires.push(racine);
  const contenus = { 'deploiement/sorties-autorisees.json': JSON.stringify(liste), ...fichiers };
  for (const [chemin, contenu] of Object.entries(contenus)) {
    mkdirSync(dirname(join(racine, chemin)), { recursive: true });
    writeFileSync(join(racine, chemin), contenu);
  }
  return racine;
}

afterEach(() => {
  for (const racine of temporaires.splice(0)) rmSync(racine, { recursive: true, force: true });
});

describe('verifier-sorties : code', () => {
  it('passe sur le dépôt', () => {
    expect(verifierSorties()).toEqual([]);
  });

  it('accepte un hôte déclaré dans son fichier, un espace de noms et un hôte local', () => {
    const racine = depot({
      'coeur/src/source.ts': "export const D = 'https://github.com/x/regie';",
      'coeur/src/logo.astro': '<svg xmlns="http://www.w3.org/2000/svg"></svg>',
      'coeur/src/dev.ts': "const u = 'http://localhost:4321';",
    });
    expect(verifierSorties(racine)).toEqual([]);
  });

  it.each([
    ['fetch()', 'coeur/src/a.ts', "const r = await fetch('/api');"],
    ['XMLHttpRequest', 'coeur/src/b.ts', 'const x = new XMLHttpRequest();'],
    ['WebSocket', 'coeur/src/c.ts', 'const w = new WebSocket(u);'],
    ['module réseau de Node', 'coeur/src/d.ts', "import { request } from 'node:https';"],
    ['client HTTP tiers', 'coeur/src/e.ts', "import axios from 'axios';"],
    ['module réseau de Python', 'services/voix/main.py', 'import requests'],
    ['module réseau de Python', 'services/voix/autre.py', 'from urllib.request import urlopen'],
  ])('échoue sur « %s » hors de la liste, fichier et ligne nommés', (nom, chemin, contenu) => {
    const fautes = verifierSorties(depot({ [chemin]: `\n${contenu}\n` }));
    expect(fautes).toHaveLength(1);
    expect(fautes[0].startsWith(`${chemin}:2 `)).toBe(true);
    expect(fautes[0]).toContain(nom);
  });

  it('accepte un appel dans un fichier déclaré dans « fichiersReseau »', () => {
    expect(verifierSorties(depot({ 'services/publication/src/envoi.ts': 'await fetch(adresse);' }))).toEqual([]);
  });

  it('ignore les tests et ne confond pas les méthodes nommées fetch', () => {
    const racine = depot({
      'coeur/test/a.test.ts': "await fetch('https://tiers.test');",
      'coeur/src/b.ts': 'const r = depot.fetch(1); const s = prefetch(2);',
    });
    expect(verifierSorties(racine)).toEqual([]);
  });

  it('échoue sur un hôte absent de la liste', () => {
    const fautes = verifierSorties(depot({ 'coeur/src/f.ts': "const u = 'https://mesure.example/collecte';" }));
    expect(fautes).toHaveLength(1);
    expect(fautes[0]).toContain('« mesure.example »');
  });

  it('échoue sur un hôte déclaré mais utilisé dans un autre fichier', () => {
    const fautes = verifierSorties(depot({ 'coeur/src/g.ts': "const u = 'https://github.com/x';" }));
    expect(fautes[0]).toContain('autres fichiers');
  });

  it('échoue si la liste autorisée est absente ou illisible', () => {
    const racine = mkdtempSync(join(tmpdir(), 'regie-sorties-'));
    temporaires.push(racine);
    expect(verifierSorties(racine)[0]).toContain('absent');
    expect(verifierSorties(depot({ 'deploiement/sorties-autorisees.json': '{' }))[0]).toContain('JSON invalide');
  });
});

describe('verifier-sorties : pages construites', () => {
  it('accepte une page qui ne charge que son propre domaine', () => {
    const racine = depot({
      'coeur/dist/client/index.html':
        '<html><head><link rel="stylesheet" href="/a.css"><script src="/a.js"></script></head><body><a href="https://exemple.test">lien</a></body></html>',
      'coeur/dist/client/a.css': 'body{background:url(/x.png)}',
    });
    expect(verifierSorties(racine)).toEqual([]);
  });

  it.each([
    ['<script src="https://cdn.example/x.js"></script>', 'script'],
    ['<link rel="stylesheet" href="//fonts.example/css">', 'link'],
    ['<img src="https://pixel.example/p.gif">', 'img'],
    ['<link rel="preconnect" href="https://fonts.example">', 'link'],
  ])('échoue sur une ressource tierce en HTML : %s', (html, balise) => {
    const fautes = verifierSorties(depot({ 'coeur/dist/client/index.html': `<html>${html}</html>` }));
    expect(fautes).toHaveLength(1);
    expect(fautes[0]).toContain(`<${balise}>`);
  });

  it.each([
    ['coeur/dist/client/a.css', '@import "https://fonts.example/css";', '@import externe'],
    ['coeur/dist/client/b.css', 'a{background:url(https://img.example/x.png)}', 'url() externe'],
    ['coeur/dist/client/c.js', 'fetch("https://api.example/x")', 'fetch() ou import() externe'],
  ])('échoue sur une ressource tierce dans %s', (chemin, contenu, cause) => {
    const fautes = verifierSorties(depot({ [chemin]: contenu }));
    expect(fautes).toHaveLength(1);
    expect(fautes[0]).toContain(cause);
  });
});

describe('verifier-sorties : unités Quadlet', () => {
  const reseau = (interne) => `[Network]\nInternal=${interne}\n`;

  it('accepte un conteneur autorisé à sortir et un conteneur sur réseau interne', () => {
    const racine = depot({
      'deploiement/quadlet/coeur.container': '[Container]\nImage=x\n',
      'deploiement/quadlet/interne.network': reseau('true'),
      'deploiement/quadlet/voix.container': '[Container]\nNetwork=interne.network\n',
    });
    expect(verifierSorties(racine)).toEqual([]);
  });

  it('échoue sur un conteneur sans réseau interne', () => {
    const fautes = verifierSorties(depot({ 'deploiement/quadlet/voix.container': '[Container]\nImage=x\n' }));
    expect(fautes).toHaveLength(1);
    expect(fautes[0]).toContain('« voix »');
  });

  it('échoue sur un conteneur dont le réseau n’est pas interne', () => {
    const racine = depot({
      'deploiement/quadlet/ouvert.network': reseau('false'),
      'deploiement/quadlet/rendu.container': '[Container]\nNetwork=ouvert.network\n',
    });
    const fautes = verifierSorties(racine);
    expect(fautes).toHaveLength(1);
    expect(fautes[0]).toContain('sans « Internal=true »');
  });
});
