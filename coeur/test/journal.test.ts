// Histoire 1.13 : consultation du journal d'audit (périmètres, filtres, heure de Paris, chaîne vérifiée).
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { COOKIE_SESSION } from '../src/auth/cookies.ts';
import { chainer, type LigneAudit } from '../src/infra/audit.ts';
import { construireServeur } from '../src/serveur.ts';
import { consulterJournal, debutDeJourParis, formaterParis, LIMITE_LIGNES } from '../src/services/journal.ts';
import { creerServicesDeTest, type BancDeTest } from './faux-auth.ts';

const ORIGINE = 'http://127.0.0.1:4321';
const MARQUE = crypto.randomUUID();

function fabriquer(entrees: readonly [string, string, string, string, string][]): LigneAudit[] {
  const lignes: LigneAudit[] = [];
  for (const [quand, acteur, action, objet, origine] of entrees) lignes.push(chainer(MARQUE, { acteur, action, objet, details: { origine } }, lignes.at(-1)?.hache, new Date(quand)));
  return lignes;
}

describe('heure de Paris', () => {
  it('minuit à Paris : UTC+2 en été, UTC+1 en hiver, y compris les jours de changement d’heure', () => {
    expect(debutDeJourParis('2026-07-14')!.toISOString()).toBe('2026-07-13T22:00:00.000Z');
    expect(debutDeJourParis('2026-01-15')!.toISOString()).toBe('2026-01-14T23:00:00.000Z');
    expect(debutDeJourParis('2026-03-29')!.toISOString()).toBe('2026-03-28T23:00:00.000Z');
    expect(debutDeJourParis('2026-10-25')!.toISOString()).toBe('2026-10-24T22:00:00.000Z');
    expect(debutDeJourParis('2026-02-30')).toBeUndefined();
    expect(debutDeJourParis('hier')).toBeUndefined();
  });
  it('affiche l’heure de Paris', () => {
    expect(formaterParis('2026-07-14T22:30:00.000Z')).toContain('00:30:00');
  });
});

describe('périmètres et filtres', () => {
  const lignes = fabriquer([
    ['2026-10-20T10:00:00Z', 'moi', 'jeton_creer', 'jeton:j1', 'interface'],
    ['2026-10-20T23:30:00Z', 'autre', 'jeton_creer', 'jeton:secret-de-lautre', 'api'],
    ['2026-10-21T08:00:00Z', 'moi', 'connexion_revoquer', 'connexion:c1', 'mcp'],
    ['2026-10-21T09:00:00Z', 'autre', 'espace_change', 'espace:e-moi', 'interface'],
    ['2026-10-21T09:30:00Z', 'autre', 'espace_change', 'espace:e-autre', 'interface'],
  ]);
  const moi = { sub: 'moi', espaceIds: ['e-moi'], estAdmin: false };
  const admin = { sub: 'admin', espaceIds: [], estAdmin: true };

  it('« mes actions » : seulement les miennes, du plus récent au plus ancien', () => {
    const v = consulterJournal(lignes, moi, { perimetre: 'moi' });
    expect(v.lignes.map((l) => l.action)).toEqual(['connexion_revoquer', 'jeton_creer']);
    expect(v.chaineRompueA).toBeUndefined();
    expect(v.verifiees).toBe(5);
  });
  it('« mon espace » ajoute ce qui touche à mon espace, pas celui des autres', () => {
    const v = consulterJournal(lignes, moi, { perimetre: 'espace' });
    expect(v.lignes.map((l) => l.objet)).toEqual(['espace:e-moi', 'connexion:c1', 'jeton:j1']);
  });
  it('« instance » est refusée à qui n’est pas administrateur ; l’administrateur ne voit que le genre des objets des autres', () => {
    expect(consulterJournal(lignes, moi, { perimetre: 'instance' }).lignes).toEqual([]);
    const v = consulterJournal(lignes, admin, { perimetre: 'instance' });
    expect(v.total).toBe(5);
    expect(JSON.stringify(v.lignes)).not.toContain('secret-de-lautre');
    expect(v.lignes.map((l) => l.objet)).toEqual(['espace', 'espace', 'connexion', 'jeton', 'jeton']);
  });
  it('filtre par origine et par début d’objet', () => {
    expect(consulterJournal(lignes, admin, { perimetre: 'instance', origine: 'mcp' }).lignes.map((l) => l.action)).toEqual(['connexion_revoquer']);
    expect(consulterJournal(lignes, moi, { perimetre: 'moi', objet: 'jeton' }).lignes.map((l) => l.action)).toEqual(['jeton_creer']);
  });
  it('filtre par période en jours de Paris : 23h30 UTC le 20 est déjà le 21 à Paris', () => {
    const jour21 = consulterJournal(lignes, admin, { perimetre: 'instance', du: '2026-10-21', au: '2026-10-21' });
    expect(jour21.total).toBe(4);
    const jour20 = consulterJournal(lignes, admin, { perimetre: 'instance', du: '2026-10-20', au: '2026-10-20' });
    expect(jour20.total).toBe(1);
  });
  it('montre une chaîne rompue, à la bonne ligne', () => {
    const rompue = lignes.filter((_, i) => i !== 1);
    const v = consulterJournal(rompue, admin, { perimetre: 'instance' });
    expect(v.chaineRompueA).toBe(1);
  });
  it('coupe l’affichage sans couper la vérification', () => {
    const beaucoup = fabriquer(Array.from({ length: LIMITE_LIGNES + 5 }, (_, i) => ['2026-10-21T08:00:00Z', 'moi', 'a', `o:${i}`, 'api'] as [string, string, string, string, string]));
    const v = consulterJournal(beaucoup, moi, { perimetre: 'moi' });
    expect(v.lignes).toHaveLength(LIMITE_LIGNES);
    expect(v.total).toBe(LIMITE_LIGNES + 5);
    expect(v.verifiees).toBe(LIMITE_LIGNES + 5);
  });
});

describe('page /journal', () => {
  let app: Awaited<ReturnType<typeof construireServeur>>;
  let banc: BancDeTest;
  let cookie: string;
  let cookieAdmin: string;
  let cookieAutre: string;
  const voir = (url: string, c: string) => app.inject({ url, headers: { cookie: c } });

  beforeAll(async () => {
    if (!existsSync(fileURLToPath(new URL('../dist/server/entry.mjs', import.meta.url)))) throw new Error('coeur/dist absent : lance `npm run build` avant les tests.');
    banc = creerServicesDeTest(undefined, { urlPublique: ORIGINE, admin: { sub: 'sub-admin', email: undefined } });
    const marqueId = await banc.marques.creer();
    const ouvrir = async (sub: string) => {
      const a = await banc.espaces.assurer(marqueId, sub, undefined, 'Établia');
      return `${COOKIE_SESSION}=${await banc.sessions.creer({ marqueId, sub, email: undefined, authentifieLe: new Date(), espaceActifId: a.espaces[0]!.id })}`;
    };
    cookie = await ouvrir('sub-a');
    cookieAutre = await ouvrir('sub-b');
    cookieAdmin = await ouvrir('sub-admin');
    await banc.audit.ajouter(marqueId, { acteur: 'sub-a', action: 'jeton_creer', objet: 'jeton:visible-par-a', details: { origine: 'interface' } });
    await banc.audit.ajouter(marqueId, { acteur: 'sub-b', action: 'jeton_creer', objet: 'jeton:cache-a-a', details: { origine: 'mcp' } });
    app = await construireServeur({ services: banc.services });
    await app.ready();
  });
  afterAll(async () => app?.close());

  it('demande la connexion', async () => {
    expect((await app.inject({ url: '/journal' })).statusCode).not.toBe(200);
  });
  it('montre à chacun ses actions et la chaîne vérifiée', async () => {
    const r = await voir('/journal', cookie);
    expect(r.statusCode).toBe(200);
    expect(r.body).toContain('visible-par-a');
    expect(r.body).not.toContain('cache-a-a');
    expect(r.body).toContain('data-chaine="ok"');
  });
  it('l’instance est proposée à l’administrateur seulement, sans le détail des objets des autres', async () => {
    expect((await voir('/journal', cookie)).body).not.toContain('Toute l’instance');
    const sansDroit = await voir('/journal?perimetre=instance', cookieAutre);
    expect(sansDroit.body).not.toContain('visible-par-a');
    const admin = await voir('/journal?perimetre=instance', cookieAdmin);
    expect(admin.body).toContain('Toute l’instance');
    expect(admin.body).not.toContain('cache-a-a');
    expect(admin.body).not.toContain('visible-par-a');
    expect(admin.body).toContain('jeton_creer');
  });
  it('filtre par origine et ignore une date invalide en le disant', async () => {
    expect((await voir('/journal?origine=mcp', cookieAutre)).body).toContain('cache-a-a');
    expect((await voir('/journal?origine=api', cookieAutre)).body).not.toContain('cache-a-a');
    expect((await voir('/journal?du=pas-une-date', cookie)).body).toContain('Une date n’est pas valide');
  });
  it('signale une chaîne rompue', async () => {
    banc.audit.lignes.splice(0, 1);
    expect((await voir('/journal', cookieAutre)).body).toContain('data-chaine="rompue"');
  });
});
