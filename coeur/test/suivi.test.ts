// Histoire 2.5 : suivi des tâches — estimation, actions tache.*, flux en direct, page /taches.
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { COOKIE_SESSION } from '../src/auth/cookies.ts';
import { idUtilisateur } from '../src/infra/espaces.ts';
import { dureeAttendue, estimer, mediane, type TacheEnAttente } from '../src/services/estimation.ts';
import { heureEnClair } from '../src/services/horaires.ts';
import { construireServeur } from '../src/serveur.ts';
import { creerServicesDeTest, type BancDeTest } from './faux-auth.ts';

const ORIGINE = 'http://127.0.0.1:4321';
type App = Awaited<ReturnType<typeof construireServeur>>;

const attente = (id: string, type: string, o: Partial<Omit<TacheEnAttente, 'creeLe'>> & { creeLe?: number } = {}): TacheEnAttente => ({
  id, type, classe: 'lot', etat: 'prete', disponibleLe: new Date(0), demarreeLe: undefined, ...o, creeLe: new Date(o.creeLe ?? 0),
});

describe('estimation de la file', () => {
  const t0 = new Date('2026-10-21T10:00:00Z');

  it('rejoue l’ordre de prise : interactif avant lot, puis le plus ancien ; une tâche en cours passe devant', () => {
    const e = estimer(
      [
        attente('lot', 'essai', { creeLe: 1 }),
        attente('inter', 'capture', { classe: 'interactive', creeLe: 2 }),
        attente('cours', 'montage', { etat: 'en_cours', demarreeLe: new Date(t0.getTime() - 100_000), classe: 'interactive' }),
      ],
      { montage: [300], capture: [60], essai: [10] },
      t0,
    );
    expect(e.get('cours')).toMatchObject({ position: 0 });
    expect(e.get('cours')!.finLe.getTime()).toBe(t0.getTime() + 200_000);
    expect(e.get('inter')).toMatchObject({ position: 1 });
    expect(e.get('inter')!.finLe.getTime()).toBe(t0.getTime() + 260_000);
    expect(e.get('lot')).toMatchObject({ position: 2 });
    expect(e.get('lot')!.finLe.getTime()).toBe(t0.getTime() + 270_000);
  });

  it('attend la disponibilité d’une tâche reportée (reprise après échec) au lieu de la compter tout de suite', () => {
    const e = estimer([attente('r', 'essai', { disponibleLe: new Date(t0.getTime() + 60_000) })], { essai: [10] }, t0);
    expect(e.get('r')!.finLe.getTime()).toBe(t0.getTime() + 70_000);
  });

  it('prend la médiane des 50 dernières durées réelles, sinon la durée typique du type', () => {
    expect(mediane([])).toBeUndefined();
    expect(mediane([1, 9, 5])).toBe(5);
    expect(mediane([1, 3])).toBe(2);
    expect(dureeAttendue('capture', { capture: [10, 20, 30] })).toBe(20);
    expect(dureeAttendue('capture', {})).toBe(60);
    expect(dureeAttendue('type-inconnu', {})).toBe(60);
    // Au-delà de 50 valeurs, seules les 50 plus récentes (en tête) comptent.
    expect(dureeAttendue('capture', { capture: [...Array(50).fill(10), ...Array(50).fill(1000)] })).toBe(10);
  });

  it('une tâche en retard sur sa durée attendue est supposée finir bientôt, jamais dans le passé', () => {
    const e = estimer([attente('c', 'montage', { etat: 'en_cours', demarreeLe: new Date(t0.getTime() - 900_000) })], { montage: [300] }, t0);
    expect(e.get('c')!.finLe.getTime()).toBeGreaterThan(t0.getTime());
  });

  it('jeu de recettes synthétique : au moins 80 % des estimations à moins de 30 % d’erreur', () => {
    // Générateur déterministe ; durées réelles = durée de référence × (0,8 à 1,2).
    let graine = 42;
    const alea = () => ((graine = (graine * 1664525 + 1013904223) >>> 0) / 2 ** 32);
    const types = ['capture', 'montage', 'rendu', 'transcription', 'essai'] as const;
    const base: Record<string, number> = { capture: 60, montage: 300, rendu: 240, transcription: 180, essai: 5 };
    const tire = (type: string) => base[type]! * (0.8 + 0.4 * alea());
    let bons = 0;
    const total = 200;
    for (let i = 0; i < total; i += 1) {
      const historique: Record<string, number[]> = {};
      for (const type of types) historique[type] = Array.from({ length: 10 }, () => tire(type));
      const n = 2 + Math.floor(alea() * 5);
      const file = Array.from({ length: n }, (_, k) => attente(`t${k}`, types[Math.floor(alea() * types.length)]!, { creeLe: k, classe: 'interactive' }));
      const estimees = estimer(file, historique, t0);
      const derniere = file.at(-1)!;
      const reel = file.reduce((somme, t) => somme + tire(t.type), 0) * 1000;
      const estime = estimees.get(derniere.id)!.finLe.getTime() - t0.getTime();
      if (Math.abs(estime - reel) / reel <= 0.3) bons += 1;
    }
    expect(bons / total).toBeGreaterThanOrEqual(0.8);
  });
});

describe('heure en clair', () => {
  const maintenant = new Date('2026-10-21T10:00:00Z'); // 12 h à Paris (heure d'été jusqu'au 25 octobre)
  it('dit « vers 18 h 40 » aujourd’hui, arrondi à 5 minutes, en heure de Paris', () => {
    expect(heureEnClair(new Date('2026-10-21T16:41:00Z'), maintenant)).toBe('vers 18 h 40');
    expect(heureEnClair(new Date('2026-10-21T16:00:00Z'), maintenant)).toBe('vers 18 h');
  });
  it('ajoute « demain » ou la date quand ce n’est pas aujourd’hui', () => {
    expect(heureEnClair(new Date('2026-10-22T07:05:00Z'), maintenant)).toBe('demain vers 9 h 05');
    expect(heureEnClair(new Date('2026-10-24T07:05:00Z'), maintenant)).toBe('le 24/10 vers 9 h 05');
  });
});

describe('actions tache.*, flux en direct et page /taches', () => {
  let app: App;
  let banc: BancDeTest;
  let marqueId: string;
  let cookieA: string;
  let cookieB: string;
  let jetonA: string;
  let jetonB: string;
  let utilisateurA: string;
  let utilisateurB: string;
  let espaceA: string;

  const appeler = (jeton: string, chemin: string, corps: unknown = {}) =>
    app.inject({ method: 'POST', url: `/api/v1/${chemin}`, headers: { authorization: `Bearer ${jeton}`, 'content-type': 'application/json' }, payload: JSON.stringify(corps) });
  const jeton = async (sub: string, utilisateurId: string, espaceIds: string[]) =>
    (await banc.jetons.creer({ marqueId, utilisateurId, sub, nom: 'test', portees: ['lecture', 'ecriture'], espaceIds, dureeJours: 30 })).clair;

  beforeAll(async () => {
    if (!existsSync(fileURLToPath(new URL('../dist/server/entry.mjs', import.meta.url)))) throw new Error('coeur/dist absent : lance `npm run build` avant les tests.');
    banc = creerServicesDeTest(undefined, { urlPublique: ORIGINE });
    marqueId = await banc.marques.creer();
    const a = await banc.espaces.assurer(marqueId, 'sub-a', undefined, 'Établia');
    const b = await banc.espaces.assurer(marqueId, 'sub-b', undefined, 'Établia');
    utilisateurA = a.utilisateurId;
    utilisateurB = b.utilisateurId;
    espaceA = a.espaces[0]!.id;
    const ouvrir = async (sub: string, espaceActifId: string) => `${COOKIE_SESSION}=${await banc.sessions.creer({ marqueId, sub, email: undefined, authentifieLe: new Date(), espaceActifId })}`;
    cookieA = await ouvrir('sub-a', espaceA);
    cookieB = await ouvrir('sub-b', b.espaces[0]!.id);
    jetonA = await jeton('sub-a', utilisateurA, [espaceA]);
    jetonB = await jeton('sub-b', utilisateurB, [b.espaces[0]!.id]);
    app = await construireServeur({ services: banc.services, flux: { intervalleMs: 40, battementMs: 60, dureeMaxMs: 60_000, maxParPersonne: 2 } });
    await app.listen({ host: '127.0.0.1', port: 0 });
  });
  afterAll(async () => app?.close());

  const adresse = () => `http://127.0.0.1:${(app.server.address() as { port: number }).port}`;

  /** Lit le flux jusqu'à ce que `suffisant` soit vrai du texte reçu (ou 3 s). */
  async function lireFlux(cookie: string | undefined, suffisant: (texte: string) => boolean) {
    const controle = new AbortController();
    const r = await fetch(`${adresse()}/flux/taches`, { headers: cookie === undefined ? {} : { cookie }, signal: controle.signal });
    let texte = '';
    if (r.status === 200) {
      const lecteur = r.body!.getReader();
      const fin = Date.now() + 3000;
      try {
        while (Date.now() < fin && !suffisant(texte)) {
          const { value, done } = await lecteur.read();
          if (done) break;
          texte += new TextDecoder().decode(value);
        }
      } finally {
        controle.abort();
      }
    } else {
      await r.text();
    }
    return { statut: r.status, entetes: r.headers, texte };
  }

  it('tache.lister rend état, étape, position et fin estimée ; seulement les tâches de la personne', async () => {
    const maTache = await banc.file.enfiler(marqueId, utilisateurA, 'capture', {});
    await banc.file.enfiler(marqueId, utilisateurB, 'rendu', {});
    const r = await appeler(jetonA, 'tache/lister');
    expect(r.statusCode).toBe(200);
    const taches = r.json().donnees.taches as { id: string; etape: string; etat: string; position: number; finEstimee: string; finEstimeeEnClair: string }[];
    expect(taches.map((t) => t.id)).toEqual([maTache.id]);
    expect(taches[0]).toMatchObject({ etape: 'capture', etat: 'prete', position: 1 });
    expect(new Date(taches[0]!.finEstimee).getTime()).toBeGreaterThan(banc.horloge.t);
    expect(taches[0]!.finEstimeeEnClair).toMatch(/^vers \d{1,2} h/);
    expect(JSON.stringify(r.json())).not.toContain('entree');
    expect(banc.audit.lignes.at(-1)).toMatchObject({ acteur: 'sub-a', action: 'tache_lister', details: { origine: 'api' } });
  });

  /** Prend les tâches dans l'ordre de la file jusqu'à la bonne ; les autres sont terminées pour ne pas gêner la suite. */
  async function prendreCelle(id: string, service: string): Promise<void> {
    for (let i = 0; i < 50; i++) {
      const prise = await banc.file.prendre(marqueId, service);
      if (prise === undefined) throw new Error('tâche introuvable dans la file');
      if (prise.id === id) return;
      await banc.file.terminer(marqueId, prise.id, service, {});
    }
  }

  it('tache.lire rend l’historique ; 404 pour la tâche d’un autre, 400 pour un identifiant invalide, 401 sans jeton', async () => {
    const t = await banc.file.enfiler(marqueId, utilisateurA, 'essai', {});
    await prendreCelle(t.id, 'svc');
    const bonne = await appeler(jetonA, 'tache/lire', { id: t.id });
    expect(bonne.statusCode).toBe(200);
    expect(bonne.json().donnees.tache).toMatchObject({ tentative: expect.any(Number) });
    expect(Array.isArray(bonne.json().donnees.tache.tentatives)).toBe(true);
    const volee = await appeler(jetonB, 'tache/lire', { id: t.id });
    expect(volee.statusCode).toBe(404);
    expect(volee.json().erreur.code).toBe('TACHE_INTROUVABLE');
    expect((await appeler(jetonA, 'tache/lire', { id: 'x' })).statusCode).toBe(400);
    expect((await app.inject({ method: 'POST', url: '/api/v1/tache/lister' })).statusCode).toBe(401);
  });

  it('une tâche échouée montre sa cause et l’action conseillée', async () => {
    const t = await banc.file.enfiler(marqueId, utilisateurA, 'reseau', {});
    await prendreCelle(t.id, 'svc');
    await banc.file.echouer(marqueId, t.id, 'svc', 'RESULTAT_INCONNU', 'verifier', false);
    const r = await appeler(jetonA, 'tache/lire', { id: t.id });
    expect(r.json().donnees.tache).toMatchObject({ etat: 'echouee', cause: 'RESULTAT_INCONNU', action: 'verifier', position: null, finEstimee: null });
  });

  it('le flux exige une session (401), ne montre que mes tâches et ne renvoie que ce qui change', async () => {
    expect((await lireFlux(undefined, () => true)).statut).toBe(401);
    expect((await lireFlux('regie_session=faux', () => true)).statut).toBe(401);
    const ma = await banc.file.enfiler(marqueId, utilisateurA, 'montage', {});
    const sienne = await banc.file.enfiler(marqueId, utilisateurB, 'voix', {});
    const flux = await lireFlux(cookieA, (t) => t.includes('event: taches') && t.includes(': battement'));
    expect(flux.statut).toBe(200);
    expect(flux.entetes.get('content-type')).toContain('text/event-stream');
    expect(flux.entetes.get('cache-control')).toBe('no-store');
    expect(flux.texte).toContain(ma.id);
    expect(flux.texte).not.toContain(sienne.id);
    // Rien n'a changé pendant l'attente du battement : un seul événement « taches ».
    expect(flux.texte.match(/event: taches/g)).toHaveLength(1);
  });

  it('le flux annonce un changement d’état', async () => {
    const t = await banc.file.enfiler(marqueId, utilisateurA, 'controle', {});
    const attendu = lireFlux(cookieA, (x) => x.includes(`"id":"${t.id}","etape":"controle","etat":"annulee"`));
    setTimeout(() => void banc.file.annuler(marqueId, utilisateurA, t.id), 150);
    expect((await attendu).texte).toContain('"etat":"annulee"');
  });

  it('le flux se ferme quand la session est révoquée, sans rien envoyer de plus', async () => {
    const valeur = await banc.sessions.creer({ marqueId, sub: 'sub-a', email: undefined, authentifieLe: new Date(), espaceActifId: espaceA });
    const controle = new AbortController();
    const r = await fetch(`${adresse()}/flux/taches`, { headers: { cookie: `${COOKIE_SESSION}=${valeur}` }, signal: controle.signal });
    expect(r.status).toBe(200);
    const lecteur = r.body!.getReader();
    await lecteur.read();
    await banc.sessions.revoquer(valeur);
    const fin = Date.now() + 3000;
    let ferme = false;
    while (Date.now() < fin) {
      const { done } = await lecteur.read();
      if (done) {
        ferme = true;
        break;
      }
    }
    controle.abort();
    expect(ferme).toBe(true);
  });

  it('limite les flux ouverts par personne (429) et libère la place à la fermeture', async () => {
    const ouverts: AbortController[] = [];
    const ouvrir = async () => {
      const c = new AbortController();
      ouverts.push(c);
      const r = await fetch(`${adresse()}/flux/taches`, { headers: { cookie: cookieB }, signal: c.signal });
      if (r.status === 200) await r.body!.getReader().read();
      return r.status;
    };
    expect(await ouvrir()).toBe(200);
    expect(await ouvrir()).toBe(200);
    expect(await ouvrir()).toBe(429);
    ouverts.forEach((c) => c.abort());
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(await ouvrir()).toBe(200);
    ouverts.forEach((c) => c.abort());
  });

  it('la page /taches exige une session, liste mes tâches et n’interprète aucun texte comme du HTML', async () => {
    expect((await app.inject({ method: 'GET', url: '/taches' })).headers['location']).toContain('/connexion');
    const t = await banc.file.enfiler(marqueId, utilisateurA, 'rendu', {});
    const r = await app.inject({ method: 'GET', url: '/taches', headers: { cookie: cookieA } });
    expect(r.statusCode).toBe(200);
    expect(r.body).toContain('Rendu de la vidéo');
    expect(r.body).toContain(`data-id="${t.id}"`);
    expect(r.body).toContain('role="status"');
    // Le script est servi par regie (aucune origine tierce) et la CSP reste stricte.
    expect(r.body).not.toMatch(/<script[^>]+src="https?:\/\//);
    expect(String(r.headers['content-security-policy'] ?? '')).toMatch(/connect-src 'self'/);
    expect(String(r.headers['content-security-policy'] ?? '')).not.toMatch(/'unsafe-inline'|'unsafe-eval'|https?:/);
    const autre = await app.inject({ method: 'GET', url: '/taches', headers: { cookie: cookieB } });
    expect(autre.body).not.toContain(`data-id="${t.id}"`);
  });

  it('une tâche échouée apparaît sur la page avec sa cause et son action', async () => {
    const t = await banc.file.enfiler(marqueId, utilisateurA, 'reseau', {});
    await prendreCelle(t.id, 'svc2');
    await banc.file.echouer(marqueId, t.id, 'svc2', 'RESULTAT_INCONNU', 'verifier', false);
    const r = await app.inject({ method: 'GET', url: '/taches', headers: { cookie: cookieA } });
    expect(r.body).toContain('on ne sait pas si elle est allée au bout');
    expect(r.body).toContain('Vérifie d’abord le résultat');
  });

  it('idUtilisateur est stable : la vue de A ne dépend que de A', () => {
    expect(idUtilisateur(marqueId, 'sub-a')).toBe(utilisateurA);
  });
});
