// Histoire 4.11 : rejouer ma démo à chaque mise en production (jeton limité au script, rejeu, montage_remplace, échec).
import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { COOKIE_SESSION } from '../src/auth/cookies.ts';
import type { Application, Applications } from '../src/infra/applications.ts';
import type { Tache } from '../src/infra/file.ts';
import type { Script, Scripts } from '../src/infra/scripts.ts';
import { construireServeur } from '../src/serveur.ts';
import type { LanceurCapture } from '../src/services/capture.ts';
import { lignesFichier } from '../src/services/flux-fichiers.ts';
import { creerExecutantJeuScript } from '../src/services/jeu-script.ts';
import { JournauxJeu } from '../src/services/journaux-jeu.ts';
import { creerServicesDeTest, type BancDeTest } from './faux-auth.ts';

const ORIGINE = 'http://127.0.0.1:4321';
const WEBM = Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), Buffer.from('film-factice')]);

describe('rejeu à chaque mise en production', () => {
  let banc: BancDeTest;
  let app: Awaited<ReturnType<typeof construireServeur>>;
  let marqueId: string;
  let espaceA: string;
  let utilisateurA: string;
  let jetonA: string;
  let jetonB: string;
  let cookieA: string;
  let cookieVieux: string;
  let applicationId: string;
  let scriptId: string;
  let autreScriptId: string;

  const appeler = (jeton: string, chemin: string, corps: unknown = {}) =>
    app.inject({ method: 'POST', url: `/api/v1/${chemin}`, headers: { authorization: `Bearer ${jeton}`, 'content-type': 'application/json' }, payload: JSON.stringify(corps) });
  const poster = (corps: Record<string, string>, cookie = cookieA) =>
    app.inject({ method: 'POST', url: `/scripts?id=${corps['id']}`, headers: { cookie, origin: ORIGINE, 'content-type': 'application/x-www-form-urlencoded' }, payload: new URLSearchParams(corps).toString() });
  const extraireJeton = (html: string) => /regie_pat_[0-9a-f]{32}_[A-Za-z0-9_-]{43}/.exec(html)?.[0];
  const creerScript = async (nom: string) =>
    (await appeler(jetonA, 'script/creer', { applicationId, nom, etapes: [{ verbe: 'aller', url: 'https://demo.etablia.fr/' }, { verbe: 'cliquer', cible: 'Nouvelle recette' }] })).json().donnees.script.id as string;

  beforeAll(async () => {
    if (!existsSync(fileURLToPath(new URL('../dist/server/entry.mjs', import.meta.url)))) throw new Error('coeur/dist absent : lance `npm run build` avant les tests.');
    banc = creerServicesDeTest(undefined, { urlPublique: ORIGINE });
    marqueId = await banc.marques.creer();
    const a = await banc.espaces.assurer(marqueId, 'sub-a', undefined, 'Établia');
    const b = await banc.espaces.assurer(marqueId, 'sub-b', undefined, 'Autre');
    espaceA = a.espaces[0]!.id;
    utilisateurA = a.utilisateurId;
    const jeton = async (sub: string, utilisateurId: string, espaceIds: string[]) => (await banc.jetons.creer({ marqueId, utilisateurId, sub, nom: 't', portees: ['lecture', 'ecriture'], espaceIds, dureeJours: 30 })).clair;
    jetonA = await jeton('sub-a', a.utilisateurId, [espaceA]);
    jetonB = await jeton('sub-b', b.utilisateurId, [b.espaces[0]!.id]);
    const session = async (sub: string, authentifieLe: Date) => `${COOKIE_SESSION}=${await banc.sessions.creer({ marqueId, sub, email: undefined, authentifieLe, espaceActifId: espaceA })}`;
    cookieA = await session('sub-a', new Date());
    cookieVieux = await session('sub-a', new Date(Date.now() - 3_600_000));
    app = await construireServeur({ services: banc.services });
    await app.listen({ host: '127.0.0.1', port: 0 });
    applicationId = (await appeler(jetonA, 'application/declarer', { espaceId: espaceA, nom: 'Démo', accueil: 'https://demo.etablia.fr/', hotes: ['demo.etablia.fr'] })).json().donnees.application.id;
    scriptId = await creerScript('Parcours');
    autreScriptId = await creerScript('Autre parcours');
  });
  afterAll(async () => app?.close());

  it('l’interrupteur est un role="switch" ; l’activer montre un jeton une seule fois, avec copie et avertissement', async () => {
    const avant = await app.inject({ method: 'GET', url: `/scripts?id=${scriptId}`, headers: { cookie: cookieA } });
    expect(avant.body).toMatch(/role="switch"[^>]*aria-checked="false"|aria-checked="false"[^>]*role="switch"/);
    expect(avant.body).toContain('Rejouer à chaque mise en production');
    const r = await poster({ geste: 'rejeu_activer', id: scriptId });
    expect(r.statusCode).toBe(200);
    expect(extraireJeton(r.body)).toBeDefined();
    expect(r.body).toContain('id="copier-rejeu"');
    expect(r.body).toContain('ne s’affichera plus');
    const apres = await app.inject({ method: 'GET', url: `/scripts?id=${scriptId}`, headers: { cookie: cookieA } });
    expect(apres.body).toMatch(/aria-checked="true"/);
    expect(extraireJeton(apres.body)).toBeUndefined();
    // Au plus un an, limité à ce script et à son espace, aucune valeur gardée en clair.
    const ligne = banc.jetons.lignes.find((l) => l.scriptId === scriptId)!;
    expect(ligne.expireLe.getTime() - ligne.creeLe.getTime()).toBeLessThanOrEqual(365 * 86_400_000);
    expect(ligne.espaceIds).toEqual([espaceA]);
    expect(JSON.stringify(banc.audit.lignes)).not.toContain('regie_pat_');
  });

  it('refuse d’activer sans connexion récente (retour par Authentik) et crée alors zéro jeton', async () => {
    const avant = banc.jetons.lignes.length;
    const r = await poster({ geste: 'rejeu_activer', id: autreScriptId }, cookieVieux);
    expect(r.statusCode).toBe(303);
    expect(r.headers.location).toContain('/connexion');
    expect(banc.jetons.lignes.length).toBe(avant);
  });

  it('un appel authentifié de rejeu enfile un jeu lié au script, marqué rejeu', async () => {
    const jeton = extraireJeton((await poster({ geste: 'rejeu_activer', id: scriptId })).body)!;
    const r = await appeler(jeton, 'script/rejouer', { id: scriptId });
    expect(r.statusCode).toBe(200);
    const tache = banc.file.taches.find((t) => t.id === r.json().donnees.tacheId)!;
    expect(tache).toMatchObject({ type: 'jeu_script', utilisateurId: utilisateurA, entree: { scriptId, rejeu: true } });
    expect(banc.audit.lignes.some((l) => l.action === 'script_rejouer' && l.objet === `script:${scriptId}`)).toBe(true);
  });

  it('un jeton de rejeu ne fait rien d’autre : autre action, autre script, création de jeton, lecture', async () => {
    const jeton = extraireJeton((await poster({ geste: 'rejeu_activer', id: scriptId })).body)!;
    for (const [chemin, corps] of [['script/jouer', { id: scriptId }], ['script/lire', { id: scriptId }], ['script/lister', {}], ['jeton/lister', {}], ['rejeu/desactiver', { id: scriptId }], ['espace/lister', {}]] as const) {
      const r = await appeler(jeton, chemin, corps);
      expect(r.statusCode, chemin).toBe(403);
      expect(r.json().erreur.code).toBe('JETON_REJEU_LIMITE');
    }
    const autre = await appeler(jeton, 'script/rejouer', { id: autreScriptId });
    expect(autre.statusCode).toBe(403);
    expect(autre.json().erreur.code).toBe('JETON_REJEU_LIMITE');
    expect((await appeler(jeton, 'script/rejouer', {})).statusCode).toBe(400);
  });

  it('activer à nouveau remplace l’ancien jeton ; désactiver le révoque tout de suite', async () => {
    const ancien = extraireJeton((await poster({ geste: 'rejeu_activer', id: scriptId })).body)!;
    const nouveau = extraireJeton((await poster({ geste: 'rejeu_activer', id: scriptId })).body)!;
    expect((await appeler(ancien, 'script/rejouer', { id: scriptId })).statusCode).toBe(401);
    expect((await appeler(nouveau, 'script/rejouer', { id: scriptId })).statusCode).toBe(200);
    const r = await poster({ geste: 'rejeu_desactiver', id: scriptId });
    expect(r.statusCode).toBe(303);
    expect((await appeler(nouveau, 'script/rejouer', { id: scriptId })).statusCode).toBe(401);
    const etat = await appeler(jetonA, 'rejeu/etat', { id: scriptId });
    expect(etat.json().donnees).toMatchObject({ scriptId, actif: false, expireLe: null });
  });

  it('cloisonnement : le script d’une autre personne n’existe pas pour moi, rien n’est créé', async () => {
    expect((await appeler(jetonB, 'rejeu/etat', { id: scriptId })).statusCode).toBe(404);
    expect((await appeler(jetonB, 'rejeu/desactiver', { id: scriptId })).statusCode).toBe(404);
    // Activer reste réservé à l’interface : ni API ni MCP.
    expect((await appeler(jetonA, 'rejeu/activer', { id: scriptId })).statusCode).toBe(404);
  });

  it('un jeton de rejeu ne vit pas plus d’un an, un jeton personnel pas plus de 90 jours', async () => {
    const base = { marqueId, utilisateurId: utilisateurA, sub: 'sub-a', nom: 't', portees: ['ecriture'] as const, espaceIds: [espaceA] };
    await expect(banc.jetons.creer({ ...base, dureeJours: 366, scriptId })).rejects.toThrow();
    await expect(banc.jetons.creer({ ...base, dureeJours: 91 })).rejects.toThrow();
    await expect(banc.jetons.creer({ ...base, dureeJours: 365, scriptId })).resolves.toBeDefined();
  });
});

describe('jeu en rejeu : montage_remplace et échec', () => {
  const ID_SCRIPT = '11111111-1111-4111-8111-111111111111';
  const ID_APP = '22222222-2222-4222-8222-222222222222';
  const film = Buffer.concat([WEBM, Buffer.alloc(2000, 7)]);
  const lignesFilm = lignesFichier('x', film).map((l) => l.replace('{"fichier":{"nom":"x",', '{"film":{'));

  async function lancer(rejeu: boolean | undefined, sortie: 'ok' | 'echec') {
    const banc = creerServicesDeTest(undefined);
    const marqueId = await banc.marques.creer();
    const a = await banc.espaces.assurer(marqueId, 'sub-a', undefined, 'Établia');
    const espaceId = a.espaces[0]!.id;
    const application: Application = { id: ID_APP, espaceId, nom: 'Démo', accueil: 'https://demo.exemple.fr/', hotes: ['demo.exemple.fr'], version: 1, creeLe: new Date(), modifieLe: new Date() };
    const applications = { lire: async () => application } as unknown as Applications;
    const jeux: unknown[] = [];
    const scripts = {
      lire: async () => ({ id: ID_SCRIPT, espaceId, applicationId: ID_APP, nom: 'Parcours', etapes: [{ verbe: 'aller', url: 'https://demo.exemple.fr/' }, { verbe: 'cliquer', cible: 'Nouvelle recette' }], version: 1 }) as unknown as Script,
      enregistrerJeu: async (_m: string, _u: string, _i: string, jeu: unknown) => (jeux.push(jeu), true),
    } as unknown as Scripts;
    const lanceur: LanceurCapture = {
      lancer: async (d) => {
        if (sortie === 'ok') {
          for (const l of lignesFilm) d.surLigne?.(l);
          for (const e of [{ t: 0, genre: 'film_debut' }, { t: 2000, genre: 'clic', x: 800, y: 200 }, { t: 7000, genre: 'film_fin' }]) d.surLigne?.(JSON.stringify({ journal: e }));
          return `${JSON.stringify({ ok: true, dureeMs: 7000, etapes: 1, hote: 'demo.exemple.fr', video: { octets: film.length } })}\n`;
        }
        return `${JSON.stringify({ ok: false, cause: 'ETAPE_ECHEC', etape: 2 })}\n`;
      },
    };
    const executant = creerExecutantJeuScript({
      applications, scripts, passerelle: { lire: async () => undefined } as never, lanceur, journaux: new JournauxJeu(), cle: randomBytes(32), proxy: '10.89.77.2:3128',
      montage: { montages: banc.montages, stockage: banc.stockage, gabarits: banc.gabarits, file: banc.file },
      notifications: banc.notifications,
    });
    const tache = { id: 'tache-1', marqueId, utilisateurId: a.utilisateurId, type: 'jeu_script', entree: { scriptId: ID_SCRIPT, ...(rejeu === undefined ? {} : { rejeu }) } } as unknown as Tache;
    const resultat = await executant.executer(tache, { signal: new AbortController().signal, pointDeNonRetour: async () => undefined }).then((r) => r, (e: unknown) => e);
    return { banc, marqueId, utilisateurId: a.utilisateurId, resultat, jeux };
  }

  it('un rejeu réussi crée le montage et lève montage_remplace pour la personne, une seule fois', async () => {
    const r = await lancer(true, 'ok');
    expect(r.resultat).toMatchObject({ montage: { montageId: expect.any(String) } });
    expect(r.banc.montages.montages).toHaveLength(1);
    const notifs = await r.banc.notifications.lister(r.marqueId, r.utilisateurId, 10);
    expect(notifs).toHaveLength(1);
    expect(notifs[0]).toMatchObject({ genre: 'montage_remplace', etape: 'jeu_script', tacheId: 'tache-1' });
  });

  it('un jeu manuel ne lève pas montage_remplace', async () => {
    const r = await lancer(undefined, 'ok');
    expect(r.banc.montages.montages).toHaveLength(1);
    expect(await r.banc.notifications.lister(r.marqueId, r.utilisateurId, 10)).toHaveLength(0);
  });

  it('un rejeu en échec garde le numéro d’étape pour la page du script et ne remplace rien', async () => {
    const r = await lancer(true, 'echec');
    expect(r.resultat).toBeInstanceOf(Error);
    expect(r.jeux[0]).toMatchObject({ etat: 'echec', etape: 2 });
    expect(r.banc.montages.montages).toHaveLength(0);
    expect(await r.banc.notifications.lister(r.marqueId, r.utilisateurId, 10)).toHaveLength(0);
  });
});
