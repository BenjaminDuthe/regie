// Histoire 1.11 : jetons d'API personnels, API privée /api/v1 en parité avec l'interface, page Jetons.
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { COOKIE_SESSION } from '../src/auth/cookies.ts';
import { idUtilisateur } from '../src/infra/espaces.ts';
import { composerJeton, hacherJeton, marqueDuJeton } from '../src/infra/jetons.ts';
import { construireServeur } from '../src/serveur.ts';
import { ACTIONS } from '../src/services/actions.ts';
import { EXCEPTIONS_PARITE } from '../src/services/exceptions-parite.ts';
import { actionsExposees, verifierParite } from '../src/services/parite.ts';
import { genererReference } from '../src/services/reference.ts';
import { nomAction } from '../src/services/registre.ts';
import { creerServicesDeTest, type BancDeTest } from './faux-auth.ts';

const RACINE = fileURLToPath(new URL('../../', import.meta.url));
const ORIGINE = 'http://127.0.0.1:4321';
type App = Awaited<ReturnType<typeof construireServeur>>;

describe('format des jetons', () => {
  it('compose un jeton qui redonne sa marque, et dont seul le haché SHA-256 est gardé', () => {
    const marque = crypto.randomUUID();
    const jeton = composerJeton(marque);
    expect(jeton).toMatch(/^regie_pat_[0-9a-f]{32}_[A-Za-z0-9_-]{43}$/);
    expect(marqueDuJeton(jeton)).toBe(marque);
    expect(hacherJeton(jeton)).toHaveLength(32);
    expect(composerJeton(marque)).not.toBe(jeton);
  });
  it('refuse une forme qui n’en est pas une', () => {
    expect(marqueDuJeton('regie_pat_xyz')).toBeUndefined();
    expect(marqueDuJeton(`regie_pat_${'a'.repeat(32)}_court`)).toBeUndefined();
  });
});

describe('API privée /api/v1 et page Jetons', () => {
  let app: App;
  let banc: BancDeTest;
  let marqueId: string;
  let utilisateurId: string;
  let espaces: { id: string; genre: string }[];
  let cookie: string;

  const creerJeton = async (portees: ('lecture' | 'ecriture')[], options: { espaceIds?: string[]; sub?: string } = {}) =>
    (await banc.jetons.creer({ marqueId, utilisateurId: idUtilisateur(marqueId, options.sub ?? 'sub-a'), sub: options.sub ?? 'sub-a', nom: 'test', portees, espaceIds: options.espaceIds ?? espaces.map((e) => e.id), dureeJours: 30 })).clair;
  const appeler = (jeton: string | undefined, chemin: string, corps?: unknown) =>
    app.inject({ method: 'POST', url: `/api/v1/${chemin}`, headers: { ...(jeton !== undefined ? { authorization: `Bearer ${jeton}` } : {}), ...(corps !== undefined ? { 'content-type': 'application/json' } : {}) }, ...(corps !== undefined ? { payload: JSON.stringify(corps) } : {}) });

  beforeAll(async () => {
    if (!existsSync(fileURLToPath(new URL('../dist/server/entry.mjs', import.meta.url)))) throw new Error('coeur/dist absent : lance `npm run build` avant les tests.');
    banc = creerServicesDeTest(undefined, { urlPublique: ORIGINE });
    marqueId = await banc.marques.creer();
    const assure = await banc.espaces.assurer(marqueId, 'sub-a', undefined, 'Établia');
    await banc.espaces.assurer(marqueId, 'sub-b', undefined, 'Établia');
    utilisateurId = assure.utilisateurId;
    espaces = assure.espaces;
    cookie = `${COOKIE_SESSION}=${await banc.sessions.creer({ marqueId, sub: 'sub-a', email: undefined, authentifieLe: new Date(), espaceActifId: espaces[0]!.id })}`;
    app = await construireServeur({ services: banc.services });
    await app.ready();
  });
  afterAll(async () => app?.close());

  it('401 sans jeton, avec un mauvais jeton ou un jeton d’une autre forme', async () => {
    for (const jeton of [undefined, 'mauvais-jeton-quelconque', composerJeton(marqueId)]) {
      const r = await appeler(jeton, 'espace/lister');
      expect(r.statusCode).toBe(401);
      expect(r.json()).toMatchObject({ ok: false, erreur: { code: 'AUTH_JETON_REQUIS' } });
      expect(r.headers['www-authenticate']).toMatch(/^Bearer/);
    }
  });

  it('un jeton valide lit ses espaces ; l’appel est audité avec son origine, sans jamais écrire le jeton', async () => {
    const jeton = await creerJeton(['lecture']);
    const avant = banc.audit.lignes.length;
    const r = await appeler(jeton, 'espace/lister');
    expect(r.statusCode).toBe(200);
    expect(r.json().donnees.espaces.map((e: { genre: string }) => e.genre)).toEqual(['personnel', 'marque']);
    const ligne = banc.audit.lignes.at(-1)!;
    expect(banc.audit.lignes.length).toBe(avant + 1);
    expect(ligne).toMatchObject({ acteur: 'sub-a', action: 'espace_lister', details: { origine: 'api' } });
    expect(JSON.stringify(banc.audit.lignes)).not.toContain(jeton);
  });

  it('un jeton ne voit que les espaces qu’on lui a donnés', async () => {
    const jeton = await creerJeton(['lecture'], { espaceIds: [espaces[0]!.id] });
    const r = await appeler(jeton, 'espace/lister');
    expect(r.json().donnees.espaces).toHaveLength(1);
  });

  it('la portée « lecture » ne permet pas d’écrire (403, refus audité) ; « ecriture » le permet', async () => {
    const lecture = await creerJeton(['lecture']);
    const cible = await creerJeton(['lecture']);
    const id = (await banc.jetons.lister(marqueId, utilisateurId)).find((j) => j.revoqueLe === undefined)!.id;
    const refus = await appeler(lecture, 'jeton/revoquer', { id });
    expect(refus.statusCode).toBe(403);
    expect(refus.json().erreur.code).toBe('JETON_PORTEE_INSUFFISANTE');
    expect(banc.audit.lignes.at(-1)).toMatchObject({ action: 'action_refusee', objet: 'jeton.revoquer', details: { code: 'JETON_PORTEE_INSUFFISANTE' } });
    const ecriture = await creerJeton(['ecriture']);
    const ok = await appeler(ecriture, 'jeton/revoquer', { id });
    expect(ok.statusCode).toBe(200);
    expect(banc.audit.lignes.at(-1)).toMatchObject({ action: 'jeton_revoquer', objet: `jeton:${id}`, details: { origine: 'api' } });
    expect(cible).toBeTruthy();
  });

  it('un jeton révoqué cesse de marcher tout de suite ; un jeton expiré aussi', async () => {
    const jeton = await creerJeton(['ecriture']);
    expect((await appeler(jeton, 'espace/lister')).statusCode).toBe(200);
    const id = banc.jetons.lignes.find((l) => l.hache === hacherJeton(jeton).toString('hex'))!.id;
    expect((await appeler(jeton, 'jeton/revoquer', { id })).statusCode).toBe(200);
    expect((await appeler(jeton, 'espace/lister')).statusCode).toBe(401);
    const autre = await creerJeton(['lecture']);
    banc.horloge.t += 31 * 86_400_000;
    expect((await appeler(autre, 'espace/lister')).statusCode).toBe(401);
    banc.horloge.t -= 31 * 86_400_000;
  });

  it('personne ne révoque le jeton d’un autre utilisateur : 404 comme s’il n’existait pas', async () => {
    const jetonB = await creerJeton(['ecriture'], { sub: 'sub-b' });
    const idB = banc.jetons.lignes.find((l) => l.hache === hacherJeton(jetonB).toString('hex'))!.id;
    const jetonA = await creerJeton(['ecriture']);
    const r = await appeler(jetonA, 'jeton/revoquer', { id: idB });
    expect(r.statusCode).toBe(404);
    expect(r.json().erreur.code).toBe('JETON_INTROUVABLE');
    expect((await appeler(jetonB, 'espace/lister')).statusCode).toBe(200);
  });

  it('refuse un corps invalide (400), une action inconnue (404), et la création de jeton par l’API (réservée à l’interface)', async () => {
    const jeton = await creerJeton(['ecriture']);
    const invalide = await appeler(jeton, 'jeton/revoquer', { id: 'pas-un-uuid' });
    expect(invalide.statusCode).toBe(400);
    expect(invalide.json().erreur).toMatchObject({ code: 'ENTREE_INVALIDE', contexte: { champs: 'id' } });
    const casse = await app.inject({ method: 'POST', url: '/api/v1/jeton/revoquer', headers: { authorization: `Bearer ${jeton}`, 'content-type': 'application/json' }, payload: '{pas du json' });
    expect(casse.statusCode).toBe(400);
    expect((await appeler(jeton, 'video/supprimer')).statusCode).toBe(404);
    const creation = await appeler(jeton, 'jeton/creer', { nom: 'x', portees: ['lecture'], espaceIds: [espaces[0]!.id], dureeJours: 30 });
    expect(creation.statusCode).toBe(404);
  });

  describe('page /jetons', () => {
    const envoyer = (corps: Record<string, string | string[]>, entetes: Record<string, string> = {}) => {
      const params = new URLSearchParams();
      for (const [cle, valeur] of Object.entries(corps)) for (const v of [valeur].flat()) params.append(cle, v);
      return app.inject({ method: 'POST', url: '/jetons', headers: { cookie, 'content-type': 'application/x-www-form-urlencoded', ...entetes }, payload: params.toString() });
    };
    const formulaire = () => ({ action: 'creer', nom: 'Mon jeton', duree: '30', portee: 'lecture', espace: espaces[0]!.id });

    it('exige une session, et une Origin de regie pour tout envoi', async () => {
      expect((await app.inject({ method: 'GET', url: '/jetons' })).headers['location']).toContain('/connexion');
      expect((await envoyer(formulaire())).statusCode).toBe(403);
      expect((await envoyer(formulaire(), { origin: 'https://pirate.example' })).statusCode).toBe(403);
    });

    it('crée un jeton, le montre une seule fois, puis le liste sans sa valeur ; l’action est auditée', async () => {
      const r = await envoyer(formulaire(), { origin: ORIGINE });
      expect(r.statusCode).toBe(200);
      const clair = /regie_pat_[0-9a-f]{32}_[A-Za-z0-9_-]{43}/.exec(r.body)?.[0];
      expect(clair).toBeDefined();
      expect(banc.audit.lignes.at(-1)).toMatchObject({ acteur: 'sub-a', action: 'jeton_creer', details: { origine: 'interface' } });
      expect(JSON.stringify(banc.audit.lignes)).not.toContain(clair!);
      const apres = await app.inject({ method: 'GET', url: '/jetons', headers: { cookie } });
      expect(apres.statusCode).toBe(200);
      expect(apres.body).toContain('Mon jeton');
      expect(apres.body).not.toContain(clair!);
      expect((await appeler(clair, 'espace/lister')).statusCode).toBe(200);
    });

    it('renvoie vers Authentik quand la connexion date de plus de 10 minutes, sans rien créer', async () => {
      const vieux = `${COOKIE_SESSION}=${await banc.sessions.creer({ marqueId, sub: 'sub-a', email: undefined, authentifieLe: new Date(banc.horloge.t - 20 * 60_000), espaceActifId: espaces[0]!.id })}`;
      const avant = banc.jetons.lignes.length;
      const r = await envoyer(formulaire(), { origin: ORIGINE, cookie: vieux });
      expect(r.statusCode).toBe(303);
      expect(r.headers['location']).toBe('/connexion?recente=1&retour=%2Fjetons');
      expect(banc.jetons.lignes.length).toBe(avant);
    });

    it('refuse une durée de plus de 90 jours, un nom vide et l’espace d’un autre', async () => {
      const avant = banc.jetons.lignes.length;
      expect((await envoyer({ ...formulaire(), duree: '91' }, { origin: ORIGINE })).body).toContain('role="alert"');
      expect((await envoyer({ ...formulaire(), nom: '  ' }, { origin: ORIGINE })).body).toContain('role="alert"');
      expect((await envoyer({ ...formulaire(), espace: crypto.randomUUID() }, { origin: ORIGINE })).body).toContain('role="alert"');
      expect(banc.jetons.lignes.length).toBe(avant);
    });

    it('révoque un jeton depuis la page', async () => {
      const clair = await creerJeton(['lecture']);
      const id = banc.jetons.lignes.find((l) => l.hache === hacherJeton(clair).toString('hex'))!.id;
      const r = await envoyer({ action: 'revoquer', id }, { origin: ORIGINE });
      expect(r.statusCode).toBe(303);
      expect((await appeler(clair, 'espace/lister')).statusCode).toBe(401);
    });
  });
});

describe('parité et référence générée', () => {
  it('toute action est exposée à l’API et au MCP, sauf les exceptions déclarées avec leur raison', () => {
    const exposees = actionsExposees(ACTIONS, EXCEPTIONS_PARITE).map(nomAction);
    expect(verifierParite(ACTIONS, EXCEPTIONS_PARITE, exposees)).toEqual([]);
    expect(exposees).not.toContain('jeton.creer');
    expect(exposees).toContain('jeton.revoquer');
  });

  it('échoue sur une action oubliée, une exception sans raison ou vers une action inconnue', () => {
    expect(verifierParite(ACTIONS, [], ['espace.lister'])).toContain('action non exposée et sans exception : jeton.lister');
    expect(verifierParite(ACTIONS, [{ action: 'jeton.creer', raison: '' }], [])).toContain('exception sans raison : jeton.creer');
    expect(verifierParite(ACTIONS, [{ action: 'jeton.fantome', raison: 'une raison assez longue' }], ACTIONS.map(nomAction))).toContain('exception pour une action inconnue : jeton.fantome');
    expect(verifierParite(ACTIONS, EXCEPTIONS_PARITE, ACTIONS.map(nomAction))).toContain("action exposée alors qu'elle est réservée à l'interface : jeton.creer");
  });

  it('docs/api/reference.md correspond au registre (sinon : npm run api:reference -w coeur)', () => {
    expect(readFileSync(`${RACINE}docs/api/reference.md`, 'utf8')).toBe(genererReference(ACTIONS, EXCEPTIONS_PARITE));
  });

  it('le CHANGELOG-API cite chaque action du registre', () => {
    const journal = readFileSync(`${RACINE}docs/api/CHANGELOG-API.md`, 'utf8');
    for (const action of ACTIONS) expect(journal, nomAction(action)).toContain(`\`${nomAction(action)}\``);
  });
});
