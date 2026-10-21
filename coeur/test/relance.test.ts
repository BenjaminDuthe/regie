// Histoire 2.6 : prévenue dans l'interface, relance d'une étape en échec, historique des tentatives.
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { COOKIE_SESSION } from '../src/auth/cookies.ts';
import { construireServeur } from '../src/serveur.ts';
import { verifierJournal } from '../src/services/gestionnaires.ts';
import { creerServicesDeTest, type BancDeTest } from './faux-auth.ts';

const ORIGINE = 'http://127.0.0.1:4321';
type App = Awaited<ReturnType<typeof construireServeur>>;

describe('notifications et relance', () => {
  let app: App;
  let banc: BancDeTest;
  let marqueId: string;
  let utilisateurA: string;
  let utilisateurB: string;
  let jetonA: string;
  let jetonB: string;
  let jetonLecture: string;
  let cookieA: string;
  let cookieB: string;

  const appeler = (jeton: string, chemin: string, corps: unknown = {}) =>
    app.inject({ method: 'POST', url: `/api/v1/${chemin}`, headers: { authorization: `Bearer ${jeton}`, 'content-type': 'application/json' }, payload: JSON.stringify(corps) });
  const envoyer = (cookie: string, corps: Record<string, string>, entetes: Record<string, string> = { origin: ORIGINE }) =>
    app.inject({ method: 'POST', url: '/taches', headers: { cookie, 'content-type': 'application/x-www-form-urlencoded', ...entetes }, payload: new URLSearchParams(corps).toString() });

  /** Prend les tâches dans l'ordre jusqu'à la bonne, termine les autres. */
  async function prendreCelle(id: string, service: string): Promise<void> {
    for (let i = 0; i < 50; i++) {
      const prise = await banc.file.prendre(marqueId, service);
      if (prise === undefined) throw new Error('tâche introuvable dans la file');
      if (prise.id === id) return;
      await banc.file.terminer(marqueId, prise.id, service, {});
    }
  }
  async function echouer(utilisateurId: string, type = 'reseau', cause = 'ECHEC', action = 'relancer') {
    const t = await banc.file.enfiler(marqueId, utilisateurId, type, {});
    await prendreCelle(t.id, 'svc');
    await banc.file.echouer(marqueId, t.id, 'svc', cause, action, false);
    return t;
  }

  beforeAll(async () => {
    if (!existsSync(fileURLToPath(new URL('../dist/server/entry.mjs', import.meta.url)))) throw new Error('coeur/dist absent : lance `npm run build` avant les tests.');
    banc = creerServicesDeTest(undefined, { urlPublique: ORIGINE, admin: { sub: 'sub-a', email: undefined } });
    marqueId = await banc.marques.creer();
    const a = await banc.espaces.assurer(marqueId, 'sub-a', undefined, 'Établia');
    const b = await banc.espaces.assurer(marqueId, 'sub-b', undefined, 'Établia');
    utilisateurA = a.utilisateurId;
    utilisateurB = b.utilisateurId;
    const jeton = async (sub: string, utilisateurId: string, espaceIds: string[], portees: ('lecture' | 'ecriture')[]) =>
      (await banc.jetons.creer({ marqueId, utilisateurId, sub, nom: 'test', portees, espaceIds, dureeJours: 30 })).clair;
    jetonA = await jeton('sub-a', utilisateurA, [a.espaces[0]!.id], ['lecture', 'ecriture']);
    jetonB = await jeton('sub-b', utilisateurB, [b.espaces[0]!.id], ['lecture', 'ecriture']);
    jetonLecture = await jeton('sub-a', utilisateurA, [a.espaces[0]!.id], ['lecture']);
    const ouvrir = async (sub: string, espaceActifId: string) => `${COOKIE_SESSION}=${await banc.sessions.creer({ marqueId, sub, email: undefined, authentifieLe: new Date(), espaceActifId })}`;
    cookieA = await ouvrir('sub-a', a.espaces[0]!.id);
    cookieB = await ouvrir('sub-b', b.espaces[0]!.id);
    app = await construireServeur({ services: banc.services });
  });
  afterAll(async () => app?.close());

  it('une étape en échec crée une notification qui nomme l’étape, la cause et l’action ; une seule fois', async () => {
    const t = await echouer(utilisateurA, 'rendu', 'RESULTAT_INCONNU', 'verifier');
    const r = await appeler(jetonA, 'notification/lister');
    expect(r.statusCode).toBe(200);
    const n = r.json().donnees.notifications.find((x: { tacheId: string }) => x.tacheId === t.id);
    expect(n).toMatchObject({ genre: 'etape_echouee', etape: 'rendu', cause: 'RESULTAT_INCONNU', action: 'verifier', acquitteeLe: null });
    // Le même événement rejoué ne crée rien de plus.
    await banc.notifications.surEchec((await banc.file.lire(marqueId, utilisateurA, t.id))!);
    expect((await banc.notifications.lister(marqueId, utilisateurA, 50)).filter((x) => x.tacheId === t.id)).toHaveLength(1);
  });

  it('une tâche qui n’échoue pas, ou qui sera retentée, ne notifie pas ; regie ne la relance jamais seul', async () => {
    const avant = (await banc.notifications.lister(marqueId, utilisateurA, 50)).length;
    const t = await banc.file.enfiler(marqueId, utilisateurA, 'essai', {});
    await prendreCelle(t.id, 'svc');
    expect(await banc.file.echouer(marqueId, t.id, 'svc', 'ECHEC', 'relancer', true)).toBe('prete');
    expect((await banc.notifications.lister(marqueId, utilisateurA, 50)).length).toBe(avant);
    // Une tâche échouée le reste : aucune reprise sans action de la personne.
    const e = await echouer(utilisateurA);
    expect(await banc.file.prendre(marqueId, 'svc')).not.toMatchObject({ id: e.id });
    expect((await banc.file.lire(marqueId, utilisateurA, e.id))!.etat).toBe('echouee');
  });

  it('chacune ne voit que ses notifications ; on n’acquitte pas celle d’un autre (404)', async () => {
    const t = await echouer(utilisateurB);
    const deB = (await appeler(jetonB, 'notification/lister')).json().donnees.notifications.find((x: { tacheId: string }) => x.tacheId === t.id);
    expect(deB).toBeDefined();
    const deA = (await appeler(jetonA, 'notification/lister')).json().donnees.notifications;
    expect(deA.some((x: { tacheId: string }) => x.tacheId === t.id)).toBe(false);
    const refus = await appeler(jetonA, 'notification/acquitter', { id: deB.id });
    expect(refus.statusCode).toBe(404);
    expect(refus.json().erreur.code).toBe('NOTIFICATION_INTROUVABLE');
    expect((await appeler(jetonB, 'notification/acquitter', { id: deB.id })).statusCode).toBe(200);
    // Déjà acquittée : plus rien à acquitter.
    expect((await appeler(jetonB, 'notification/acquitter', { id: deB.id })).statusCode).toBe(404);
    expect((await appeler(jetonB, 'notification/acquitter', { id: 'x' })).statusCode).toBe(400);
  });

  it('tache.relancer remet l’étape en file sans renvoi, garde l’historique, et suit les mêmes règles que l’interface', async () => {
    const t = await echouer(utilisateurA, 'rendu', 'ECHEC', 'relancer');
    const r = await appeler(jetonA, 'tache/relancer', { id: t.id });
    expect(r.statusCode).toBe(200);
    expect(r.json().donnees.tache).toMatchObject({ id: t.id, etat: 'prete', cause: null });
    expect(r.json().donnees.tache.tentatives.map((x: { issue: string }) => x.issue)).toEqual(['echouee']);
    expect(banc.audit.lignes.at(-1)).toMatchObject({ acteur: 'sub-a', action: 'tache_relancer', objet: `tache:${t.id}`, details: { origine: 'api' } });
    // Une tâche relancée repart : la prise suivante la reprend, avec sa deuxième tentative dans l'historique.
    await prendreCelle(t.id, 'svc');
    const lue = await appeler(jetonA, 'tache/lire', { id: t.id });
    expect(lue.json().donnees.tache.tentatives).toHaveLength(2);
    // Elle n’est plus échouée : une deuxième relance est refusée (409).
    const encore = await appeler(jetonA, 'tache/relancer', { id: t.id });
    expect(encore.statusCode).toBe(409);
    expect(encore.json().erreur.code).toBe('TACHE_NON_RELANCABLE');
  });

  it('refuse de relancer la tâche d’un autre (404), une tâche non échouée (409), sans portée d’écriture (403) ou sans jeton (401)', async () => {
    const d = await echouer(utilisateurB);
    const volee = await appeler(jetonA, 'tache/relancer', { id: d.id });
    expect(volee.statusCode).toBe(404);
    expect(volee.json().erreur.code).toBe('TACHE_INTROUVABLE');
    expect((await banc.file.lire(marqueId, utilisateurB, d.id))!.etat).toBe('echouee');
    const enAttente = await banc.file.enfiler(marqueId, utilisateurA, 'essai', {});
    expect((await appeler(jetonA, 'tache/relancer', { id: enAttente.id })).statusCode).toBe(409);
    const e = await echouer(utilisateurA);
    expect((await appeler(jetonLecture, 'tache/relancer', { id: e.id })).statusCode).toBe(403);
    expect((await banc.file.lire(marqueId, utilisateurA, e.id))!.etat).toBe('echouee');
    expect((await app.inject({ method: 'POST', url: '/api/v1/tache/relancer' })).statusCode).toBe(401);
    expect((await appeler(jetonA, 'tache/relancer', { id: 'x' })).statusCode).toBe(400);
  });

  it('la page /taches montre la notification, l’historique et « Relancer » ; le formulaire relance et acquitte', async () => {
    const t = await echouer(utilisateurA, 'capture', 'ECHEC', 'relancer');
    const page = await app.inject({ method: 'GET', url: '/taches', headers: { cookie: cookieA } });
    expect(page.statusCode).toBe(200);
    expect(page.body).toContain('L’étape « Capture » a échoué.');
    expect(page.body).toContain('Relancer');
    expect(page.body).toContain(`value="${t.id}"`);
    // Pas pour une autre personne.
    const autre = await app.inject({ method: 'GET', url: '/taches', headers: { cookie: cookieB } });
    expect(autre.body).not.toContain(`value="${t.id}"`);
    // Sans Origin de regie, le formulaire est refusé.
    expect((await envoyer(cookieA, { geste: 'relancer', id: t.id }, {})).statusCode).toBe(403);
    expect((await banc.file.lire(marqueId, utilisateurA, t.id))!.etat).toBe('echouee');
    // Un autre ne peut pas relancer cette tâche par la page.
    const pirate = await envoyer(cookieB, { geste: 'relancer', id: t.id });
    expect(pirate.body).toContain('role="alert"');
    expect((await banc.file.lire(marqueId, utilisateurA, t.id))!.etat).toBe('echouee');
    const ok = await envoyer(cookieA, { geste: 'relancer', id: t.id });
    expect(ok.statusCode).toBe(303);
    expect((await banc.file.lire(marqueId, utilisateurA, t.id))!.etat).toBe('prete');
    expect(banc.audit.lignes.at(-1)).toMatchObject({ action: 'tache_relancer', details: { origine: 'interface' } });
    const n = (await banc.notifications.lister(marqueId, utilisateurA, 50)).find((x) => x.tacheId === t.id)!;
    expect((await envoyer(cookieA, { geste: 'acquitter', id: n.id })).statusCode).toBe(303);
    const apres = await app.inject({ method: 'GET', url: '/taches', headers: { cookie: cookieA } });
    expect(apres.body).not.toContain(`value="${n.id}"`);
  });

  it('un journal rompu prévient l’administrateur seul, une fois par jour', async () => {
    const journal = { info: () => undefined, warn: () => undefined, error: () => undefined } as never;
    const lignes = [
      { marqueId, hache: 'a', precedent: '', acteur: 'x', action: 'y', objet: 'z', details: {}, creeLe: new Date() },
    ];
    const audit = { lire: async () => lignes, ajouter: async () => undefined } as never;
    const alerte = { notifications: banc.notifications, adminSub: 'sub-a', maintenant: () => Date.parse('2026-10-21T02:00:00Z') };
    await expect(verifierJournal(audit, journal, marqueId, alerte)).rejects.toMatchObject({ cause_: 'CHAINE_ROMPUE' });
    await expect(verifierJournal(audit, journal, marqueId, alerte)).rejects.toMatchObject({ cause_: 'CHAINE_ROMPUE' });
    const admin = (await banc.notifications.lister(marqueId, utilisateurA, 100)).filter((x) => x.genre === 'chaine_rompue');
    expect(admin).toHaveLength(1);
    expect((await banc.notifications.lister(marqueId, utilisateurB, 100)).some((x) => x.genre === 'chaine_rompue')).toBe(false);
    // Sans administrateur déclaré, personne n'est prévenu (et le travail échoue quand même).
    await expect(verifierJournal(audit, journal, marqueId, { ...alerte, adminSub: undefined })).rejects.toMatchObject({ cause_: 'CHAINE_ROMPUE' });
  });
});
