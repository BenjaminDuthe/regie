// Histoires 7.4 et 7.5 : programmer, déplacer, annuler, confirmer une publication. Heure de Paris -> échéance UTC, départ dans la
// minute, retard, changement d'heure, montage modifié. Le déroulé contre la base (planificateur réel) est dans
// postgres.integration.test.ts. 7.5 : résultat, rejeu d'un échec, historique, audit, filtre par réseau. Tout appel à Meta vise un faux serveur local (127.0.0.1).
import { createHash, randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { EntreeJournalMontage } from '@regie/contrats';
import { decider } from '../src/services/planificateur.ts';
import { heureParisDe, heureParisVersInstant } from '../src/services/horaires.ts';
import { ConnecteurInstagram } from '../src/publication/connecteur-instagram.ts';
import { gestionnairePublication } from '../src/publication/echeance.ts';
import { executantReseau } from '../src/publication/executant-reseau.ts';
import { construireServeur } from '../src/serveur.ts';
import { creerMontageDuJeu } from '../src/services/film-jeu.ts';
import type { TravailInterne } from '../src/infra/echeances.ts';
import { creerServicesDeTest, type BancDeTest } from './faux-auth.ts';
import { demarrerFauxMeta, type FauxMeta } from './faux-reseaux.ts';

const ORIGINE = 'http://127.0.0.1:4321';
const WEBM = Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), Buffer.from('film-factice')]);
const journal: EntreeJournalMontage[] = [
  { t: 0, genre: 'film_debut' },
  { t: 100, genre: 'narration', cible: 'Bienvenue sur la page.' },
  { t: 2000, genre: 'clic', x: 800, y: 200 },
  { t: 7000, genre: 'film_fin' },
];
const MAINTENANT = Date.parse('2026-10-21T10:00:00Z'); // 12:00 à Paris (heure d'été)

describe('heure de Paris et changements d’heure', () => {
  it('convertit l’heure de Paris en instant UTC, en été comme en hiver, et la restitue à l’identique', () => {
    for (const [quand, utc] of [
      ['2026-10-21T14:30', '2026-10-21T12:30:00.000Z'],
      ['2026-10-24T09:00', '2026-10-24T07:00:00.000Z'], // veille du passage à l'heure d'hiver : UTC+2
      ['2026-10-25T09:00', '2026-10-25T08:00:00.000Z'], // lendemain du passage : UTC+1
      ['2027-03-28T03:30', '2027-03-28T01:30:00.000Z'], // juste après le saut de printemps
      ['2027-03-27T09:00', '2027-03-27T08:00:00.000Z'], // veille du saut : UTC+1
      ['2027-03-29T09:00', '2027-03-29T07:00:00.000Z'], // lendemain du saut : UTC+2
    ] as const) {
      const instant = heureParisVersInstant(quand);
      expect(instant?.toISOString()).toBe(utc);
      expect(heureParisDe(instant!)).toBe(quand);
    }
  });

  it('refuse une heure qui n’existe pas (saut de printemps), un jour inexistant ou une forme invalide ; prend la première occurrence d’une heure répétée', () => {
    expect(heureParisVersInstant('2027-03-28T02:30')).toBeUndefined();
    expect(heureParisVersInstant('2027-02-30T10:00')).toBeUndefined();
    expect(heureParisVersInstant('2026-13-01T10:00')).toBeUndefined();
    expect(heureParisVersInstant('2026-10-21 14:30')).toBeUndefined();
    expect(heureParisVersInstant('demain')).toBeUndefined();
    // 02:30 le 25 octobre 2026 existe deux fois : on prend la première (heure d'été, 00:30Z).
    expect(heureParisVersInstant('2026-10-25T02:30')?.toISOString()).toBe('2026-10-25T00:30:00.000Z');
  });
});

describe('programmer une publication', () => {
  let meta: FauxMeta;
  let banc: BancDeTest;
  let app: Awaited<ReturnType<typeof construireServeur>>;
  let marqueId: string;
  let utilisateurA: string;
  let utilisateurB: string;
  let espaceA: string;
  let jetonA: string;
  let jetonIdA: string;
  let jetonB: string;
  let compteId: string;
  let montageId: string;
  const cheminPublier = () => `/v23.0/${meta.reglages.compteExterne}/media_publish`;

  const appeler = (corps: unknown, chemin: string, jeton = jetonA) =>
    app.inject({ method: 'POST', url: `/api/v1/${chemin}`, headers: { authorization: `Bearer ${jeton}`, 'content-type': 'application/json' }, payload: JSON.stringify(corps) });
  const programmer = (quand: string, m = montageId) => appeler({ montageId: m, compteId, quand }, 'publication/programmer');
  const envois = () => meta.requetes.filter((r) => r.chemin === cheminPublier()).length;
  const aide = { signal: new AbortController().signal, pointDeNonRetour: async () => undefined };
  const lancer = async (tacheId: string) => executantReseau(banc.services, { attenteLiaisonMs: 1 }).executer(banc.file.taches.find((t) => t.id === tacheId)!, aide);
  const echeancesActives = () => banc.publications.echeances.filter((e) => e.etat === 'programmee');

  /** Ce que fait le planificateur (voir postgres.integration.test.ts pour le vrai) : décider, puis exécuter le gestionnaire. */
  async function passer(maintenant: number) {
    banc.horloge.t = maintenant;
    const gestionnaire = gestionnairePublication(banc.services).publication!;
    for (const e of banc.publications.echeances.filter((x) => x.etat === 'programmee' && x.instant.getTime() <= maintenant)) {
      if (decider(e, new Date(maintenant)) === 'echouer') {
        e.etat = 'echouee';
        continue;
      }
      e.etat = 'declenchee';
      const travail: TravailInterne = { id: randomUUID(), marqueId, echeanceId: randomUUID(), type: e.type, objet: e.objet, etat: 'en_cours', tentatives: 1, cause: undefined };
      await gestionnaire(travail);
    }
  }

  async function nouveauMontage(avecRendu: boolean) {
    const film = { octets: WEBM, sha256: createHash('sha256').update(WEBM).digest('hex') };
    const r = await creerMontageDuJeu({ montages: banc.montages, stockage: banc.stockage, gabarits: banc.gabarits, file: banc.file }, { marqueId, utilisateurId: utilisateurA }, { id: randomUUID(), espaceId: espaceA, nom: 'Parcours' }, film, WEBM.length, journal, 7000);
    if (!('montageId' in r)) throw new Error(`montage refusé : ${r.refus}`);
    const m = banc.montages.montages.find((x) => x.id === r.montageId)!;
    if (avecRendu) await ajouterRendu(m.id, m.espaceId);
    return m.id;
  }
  async function ajouterRendu(id: string, espaceId: string) {
    const fichierId = randomUUID();
    banc.montages.fichiers.push({ id: fichierId, espaceId, genre: 'rendu', mime: 'video/mp4', octets: 5, sha256: 'a'.repeat(64), dureeMs: 7000, montageId: id, sceneId: null, creeLe: new Date(), purgeLe: null });
    await banc.stockage.ecrire(marqueId, fichierId, Buffer.from('rendu'));
    banc.montages.rendus.push({ id: randomUUID(), espaceId, montageId: id, genre: 'complet', etat: 'pret', tacheId: null, fichierId, violations: [], cause: null, creeLe: new Date(), termineLe: null });
  }

  beforeAll(async () => {
    if (!existsSync(fileURLToPath(new URL('../dist/server/entry.mjs', import.meta.url)))) throw new Error('coeur/dist absent : lance `npm run build` avant les tests.');
    meta = await demarrerFauxMeta();
    banc = creerServicesDeTest(undefined, { urlPublique: ORIGINE, connecteurs: { instagram: new ConnecteurInstagram({ adresses: meta.adresses, pauseMs: 0, delaiMs: 2000 }) } });
    marqueId = await banc.marques.creer();
    const a = await banc.espaces.assurer(marqueId, 'sub-a', undefined, 'Établia');
    utilisateurA = a.utilisateurId;
    espaceA = a.espaces[0]!.id;
    const b = await banc.espaces.assurer(marqueId, 'sub-b', undefined, 'Autre');
    utilisateurB = b.utilisateurId;
    const patA = await banc.jetons.creer({ marqueId, utilisateurId: utilisateurA, sub: 'sub-a', nom: 't', portees: ['lecture', 'ecriture'], espaceIds: [espaceA], dureeJours: 30 });
    jetonA = patA.clair;
    jetonIdA = patA.jeton.id;
    jetonB = (await banc.jetons.creer({ marqueId, utilisateurId: utilisateurB, sub: 'sub-b', nom: 't', portees: ['lecture', 'ecriture'], espaceIds: [b.espaces[0]!.id], dureeJours: 30 })).clair;
    const compte = await banc.comptesReseau.connecter({ marqueId, utilisateurId: utilisateurA, espaceId: espaceA, reseau: 'instagram', compteExterne: meta.reglages.compteExterne, nom: 'compte_de_demo', jeton: 'jeton-long-instagram', expireLe: new Date(MAINTENANT + 50 * 86_400_000) }, new Date(MAINTENANT));
    compteId = compte!.id;
    app = await construireServeur({ services: banc.services });
    await app.ready();
  });
  afterAll(async () => {
    await app?.close();
    await meta?.fermer();
  });
  beforeEach(async () => {
    banc.horloge.t = MAINTENANT;
    banc.publications.lignes.length = 0;
    banc.publications.historique.length = 0;
    banc.publications.echeances.length = 0;
    banc.montages.publiees.clear();
    banc.file.taches.length = 0;
    banc.notifications.lignes.length = 0;
    banc.audit.lignes.length = 0;
    meta.requetes.length = 0;
    meta.reglages.couper.clear();
    for (const k of Object.keys(meta.reglages.statutsForces)) delete meta.reglages.statutsForces[k];
    meta.reglages.quota = { utilise: 3, total: 100 };
    meta.reglages.etatsTraitement = ['FINISHED'];
    montageId = await nouveauMontage(true);
  });

  it('programme à une heure de Paris : échéance en UTC, rien ne part avant l’heure', async () => {
    const r = await programmer('2026-10-21T14:30');
    expect(r.statusCode).toBe(200);
    const p = r.json().donnees.publication;
    expect(p).toMatchObject({ etat: 'programmee', programmeePour: '2026-10-21T12:30:00.000Z', tacheId: null });
    expect(echeancesActives()).toHaveLength(1);
    expect(echeancesActives()[0]).toMatchObject({ type: 'publication', instant: new Date('2026-10-21T12:30:00.000Z') });
    expect(banc.file.taches.filter((t) => t.type === 'reseau')).toHaveLength(0);
    await passer(MAINTENANT + 60_000);
    expect(banc.file.taches.filter((t) => t.type === 'reseau')).toHaveLength(0);
    expect(envois()).toBe(0);
  });

  it('programme juste avant et juste après le changement d’heure : l’heure affichée et l’heure de départ sont justes', async () => {
    for (const [quand, utc] of [['2026-10-24T09:00', '2026-10-24T07:00:00.000Z'], ['2026-10-25T09:00', '2026-10-25T08:00:00.000Z']] as const) {
      const m = await nouveauMontage(true);
      const p = (await programmer(quand, m)).json().donnees.publication;
      expect(p.programmeePour).toBe(utc);
      expect(heureParisDe(new Date(p.programmeePour))).toBe(quand);
      // Dans la minute qui suit l'heure dite : la publication part (mise en file).
      await passer(Date.parse(utc) + 30_000);
      expect(banc.publications.lignes.find((l) => l.id === p.id)!.etat).toBe('en_file');
    }
  });

  it('refuse une heure passée, trop lointaine, inexistante ou mal écrite, et ne programme rien', async () => {
    for (const quand of ['2026-10-21T11:59', '2026-10-21T12:00', '2028-01-01T10:00', '2027-03-28T02:30', '2026-10-21 14:30', '14:30']) {
      const r = await programmer(quand);
      expect(r.statusCode, quand).toBeGreaterThanOrEqual(400);
      expect(banc.publications.lignes).toHaveLength(0);
    }
    expect((await programmer('2026-10-21T11:59')).json()).toMatchObject({ erreur: { code: 'PUBLICATION_ECHEANCE_INVALIDE' } });
    expect(echeancesActives()).toHaveLength(0);
  });

  it('refuse sans rendu prêt ; le quota n’est contrôlé qu’à l’heure dite', async () => {
    const sans = await nouveauMontage(false);
    expect((await programmer('2026-10-21T14:30', sans)).json()).toMatchObject({ erreur: { code: 'PUBLICATION_RENDU_ABSENT' } });
    meta.reglages.quota = { utilise: 100, total: 100 };
    const r = await programmer('2026-10-21T14:30');
    expect(r.statusCode).toBe(200);
    await passer(Date.parse('2026-10-21T12:30:30Z'));
    const p = r.json().donnees.publication;
    const tache = banc.file.taches.find((t) => t.type === 'reseau')!;
    expect(await lancer(tache.id)).toMatchObject({ etat: 'en_echec' });
    expect(banc.publications.lignes.find((l) => l.id === p.id)).toMatchObject({ etat: 'en_echec', cause: 'PUBLICATION_QUOTA' });
    expect(envois()).toBe(0);
  });

  it('une publication par compte et par vidéo ; l’autre utilisateur ne voit ni ne touche rien', async () => {
    const p = (await programmer('2026-10-21T14:30')).json().donnees.publication;
    expect((await programmer('2026-10-21T15:30')).json()).toMatchObject({ erreur: { code: 'PUBLICATION_EXISTANTE' } });
    for (const verbe of ['deplacer', 'annuler', 'confirmer']) {
      const r = await appeler(verbe === 'deplacer' ? { id: p.id, quand: '2026-10-22T10:00' } : { id: p.id }, `publication/${verbe}`, jetonB);
      expect(r.statusCode, verbe).toBe(404);
    }
    expect(banc.publications.lignes[0]!.etat).toBe('programmee');
  });

  it('part dans la minute qui suit l’heure dite, publie une fois, et ne repart pas si le gestionnaire est rejoué', async () => {
    const p = (await programmer('2026-10-21T14:30')).json().donnees.publication;
    const instant = Date.parse('2026-10-21T12:30:00Z');
    await passer(instant + 45_000);
    const ligne = banc.publications.lignes.find((l) => l.id === p.id)!;
    expect(ligne.etat).toBe('en_file');
    const taches = banc.file.taches.filter((t) => t.type === 'reseau');
    expect(taches).toHaveLength(1);
    expect(taches[0]!.entree).toMatchObject({ origine: 'echeance', pat: null, sub: `echeance:${utilisateurA}` });
    expect(await lancer(taches[0]!.id)).toMatchObject({ etat: 'publiee' });
    expect(envois()).toBe(1);

    // Le gestionnaire rejoué (reprise après arrêt) et la tâche rejouée ne republient pas.
    const travail: TravailInterne = { id: randomUUID(), marqueId, echeanceId: randomUUID(), type: 'publication', objet: `${p.id}:${utilisateurA}:${Math.floor(instant / 1000)}`, etat: 'en_cours', tentatives: 2, cause: undefined };
    await gestionnairePublication(banc.services).publication!(travail);
    await lancer(taches[0]!.id);
    expect(banc.file.taches.filter((t) => t.type === 'reseau')).toHaveLength(1);
    expect(envois()).toBe(1);
    const audit = banc.audit.lignes.filter((l) => l.action === 'publication_tentative');
    expect(audit).toHaveLength(1);
    expect(audit[0]!.details).toMatchObject({ origine: 'echeance' });
  });

  it('un retard de moins de 2 h est rattrapé ; au-delà l’échéance est en échec et la publication ne part jamais', async () => {
    const p1 = (await programmer('2026-10-21T14:30')).json().donnees.publication;
    const instant = Date.parse('2026-10-21T12:30:00Z');
    expect(decider({ type: 'publication', instant: new Date(instant) }, new Date(instant + 119 * 60_000))).toBe('declencher');
    expect(decider({ type: 'publication', instant: new Date(instant) }, new Date(instant + 121 * 60_000))).toBe('echouer');
    await passer(instant + 119 * 60_000); // regie était arrêtée, elle redémarre 1 h 59 après
    expect(banc.publications.lignes.find((l) => l.id === p1.id)!.etat).toBe('en_file');
    expect(banc.file.taches.filter((t) => t.type === 'reseau')).toHaveLength(1);

    banc.horloge.t = MAINTENANT;
    const m2 = await nouveauMontage(true);
    const r2 = await programmer('2026-10-21T14:40', m2);
    if (r2.statusCode !== 200) throw new Error(r2.body);
    const p2 = r2.json().donnees.publication;
    banc.file.taches.length = 0;
    await passer(Date.parse('2026-10-21T12:40:00Z') + 121 * 60_000);
    expect(banc.publications.lignes.find((l) => l.id === p2.id)!.etat).toBe('programmee'); // le réconciliateur la fait échouer (test PG)
    expect(banc.file.taches.filter((t) => t.type === 'reseau')).toHaveLength(0);
    expect(envois()).toBe(0);
    // Le balayage des échéances périmées : échec avec la cause, notification, audit, jamais d'envoi.
    const echec = await banc.publications.echouerProgrammee(marqueId, utilisateurA, p2.id, Math.floor(Date.parse('2026-10-21T12:40:00Z') / 1000), ['programmee', 'en_attente_confirmation'], 'ECHEANCE_PERIMEE', 'rejouer');
    expect(echec).toMatchObject({ etat: 'en_echec', cause: 'ECHEANCE_PERIMEE', tentatives: 1 });
    expect(await banc.publications.echouerProgrammee(marqueId, utilisateurA, p2.id, Math.floor(Date.parse('2026-10-21T12:40:00Z') / 1000), ['programmee'], 'ECHEANCE_PERIMEE', 'rejouer')).toBeUndefined();
  });

  it('déplacer met l’échéance à jour : l’ancienne heure ne déclenche plus rien', async () => {
    const p = (await programmer('2026-10-21T14:30')).json().donnees.publication;
    const r = await appeler({ id: p.id, quand: '2026-10-21T16:00' }, 'publication/deplacer');
    expect(r.json().donnees.publication.programmeePour).toBe('2026-10-21T14:00:00.000Z');
    expect(echeancesActives()).toHaveLength(1);
    expect(echeancesActives()[0]!.instant.toISOString()).toBe('2026-10-21T14:00:00.000Z');
    // L'échéance d'origine, si le planificateur la déclenchait quand même, ne fait rien : l'instant n'est plus le sien.
    const ancien: TravailInterne = { id: randomUUID(), marqueId, echeanceId: randomUUID(), type: 'publication', objet: `${p.id}:${utilisateurA}:${Math.floor(Date.parse('2026-10-21T12:30:00Z') / 1000)}`, etat: 'en_cours', tentatives: 1, cause: undefined };
    banc.horloge.t = Date.parse('2026-10-21T12:31:00Z');
    await gestionnairePublication(banc.services).publication!(ancien);
    expect(banc.publications.lignes[0]!.etat).toBe('programmee');
    expect(banc.file.taches.filter((t) => t.type === 'reseau')).toHaveLength(0);
    // Heure invalide, état incompatible.
    expect((await appeler({ id: p.id, quand: '2026-10-20T10:00' }, 'publication/deplacer')).json()).toMatchObject({ erreur: { code: 'PUBLICATION_ECHEANCE_INVALIDE' } });
    banc.publications.lignes[0]!.etat = 'publiee';
    expect((await appeler({ id: p.id, quand: '2026-10-22T10:00' }, 'publication/deplacer')).json()).toMatchObject({ erreur: { code: 'PUBLICATION_ETAT' } });
  });

  it('annuler supprime l’échéance ; une publication partie ne s’annule pas', async () => {
    const p = (await programmer('2026-10-21T14:30')).json().donnees.publication;
    const r = await appeler({ id: p.id }, 'publication/annuler');
    expect(r.json().donnees.publication.etat).toBe('annulee');
    expect(echeancesActives()).toHaveLength(0);
    await passer(Date.parse('2026-10-21T12:31:00Z'));
    expect(banc.file.taches.filter((t) => t.type === 'reseau')).toHaveLength(0);
    expect(envois()).toBe(0);
    // Annulée : on peut reprogrammer la vidéo.
    const p2 = (await programmer('2026-10-22T10:00')).json().donnees.publication;
    banc.publications.lignes.find((l) => l.id === p2.id)!.etat = 'envoi_en_cours';
    const refus = await appeler({ id: p2.id }, 'publication/annuler');
    expect(refus.statusCode).toBe(409);
    expect(refus.json()).toMatchObject({ erreur: { code: 'PUBLICATION_ETAT' } });
  });

  it('un montage modifié met la publication en attente de confirmation et prévient ; confirmer la reprogramme à la même heure', async () => {
    const p = (await programmer('2026-10-21T14:30')).json().donnees.publication;
    const base = banc.montages.montages.find((m) => m.id === montageId)!;
    const v2 = await banc.montages.creerVersion({ marqueId, utilisateurId: utilisateurA, parentId: base.id, origine: 'edition', timeline: base.timeline });
    if (v2.etat !== 'ok') throw new Error('version refusée');
    let ligne = banc.publications.lignes.find((l) => l.id === p.id)!;
    expect(ligne).toMatchObject({ etat: 'en_attente_confirmation', cause: 'MONTAGE_MODIFIE', action: 'confirmer', montageId });

    // Confirmer sans rendu prêt sur la nouvelle version : refusé, l'état ne change pas.
    const sans = await appeler({ id: p.id }, 'publication/confirmer');
    expect(sans.json()).toMatchObject({ erreur: { code: 'PUBLICATION_RENDU_ABSENT' } });
    expect(banc.publications.lignes.find((l) => l.id === p.id)!.etat).toBe('en_attente_confirmation');

    await ajouterRendu(v2.montage.id, v2.montage.espaceId);
    const ok = await appeler({ id: p.id }, 'publication/confirmer');
    expect(ok.statusCode).toBe(200);
    expect(ok.json().donnees.publication).toMatchObject({ etat: 'programmee', montageId: v2.montage.id, programmeePour: '2026-10-21T12:30:00.000Z', cause: null });
    ligne = banc.publications.lignes.find((l) => l.id === p.id)!;
    expect(ligne.renduId).toBe(banc.montages.rendus.find((r) => r.montageId === v2.montage.id && r.genre === 'complet')!.id);
    expect(echeancesActives()).toHaveLength(1);
    // Confirmer une publication qui n'attend rien : refusé.
    expect((await appeler({ id: p.id }, 'publication/confirmer')).json()).toMatchObject({ erreur: { code: 'PUBLICATION_ETAT' } });
    await passer(Date.parse('2026-10-21T12:30:20Z'));
    expect(banc.publications.lignes.find((l) => l.id === p.id)!.etat).toBe('en_file');
  });

  it('sans confirmation à l’heure dite, la publication échoue (MONTAGE_MODIFIE), prévient, et rien ne part', async () => {
    const p = (await programmer('2026-10-21T14:30')).json().donnees.publication;
    const base = banc.montages.montages.find((m) => m.id === montageId)!;
    await banc.montages.creerVersion({ marqueId, utilisateurId: utilisateurA, parentId: base.id, origine: 'edition', timeline: base.timeline });
    await passer(Date.parse('2026-10-21T12:30:20Z'));
    expect(banc.publications.lignes.find((l) => l.id === p.id)).toMatchObject({ etat: 'en_echec', cause: 'MONTAGE_MODIFIE' });
    expect(banc.file.taches.filter((t) => t.type === 'reseau')).toHaveLength(0);
    expect(envois()).toBe(0);
    expect(banc.notifications.lignes.map((n) => n.genre)).toContain('publication_echec');
    expect(banc.audit.lignes.filter((l) => l.action === 'publication_tentative')).toHaveLength(1);
    // Rejouer ne repart jamais deux fois : le gestionnaire rejoué ne fait rien.
    await passer(Date.parse('2026-10-21T12:31:00Z'));
    expect(banc.publications.lignes.find((l) => l.id === p.id)!.tentatives).toBe(1);
  });

  const publierMaintenant = async (m = montageId) => (await appeler({ montageId: m, compteId }, 'publication/publier')).json().donnees.publication;
  const lire = async (id: string, jeton = jetonA) => (await appeler({ id }, 'publication/lire', jeton)).json();
  const pathMedia = () => `/v23.0/${meta.reglages.compteExterne}/media`;

  it('7.5 rejouer un échec : nouvelle tentative publiée, historique visible, audit de chaque tentative sans jamais la valeur du jeton, une seule publication', async () => {
    meta.reglages.statutsForces[pathMedia()] = 400;
    const p = await publierMaintenant();
    expect(await lancer(p.tacheId)).toMatchObject({ etat: 'en_echec' });
    expect((await lire(p.id)).donnees.publication).toMatchObject({ etat: 'en_echec', action: 'rejouer' });
    expect(envois()).toBe(0);

    delete meta.reglages.statutsForces[pathMedia()];
    const r = await appeler({ id: p.id }, 'publication/rejouer');
    expect(r.statusCode).toBe(200);
    const rejouee = r.json().donnees.publication;
    expect(rejouee).toMatchObject({ etat: 'en_file', cause: null });
    expect(rejouee.tacheId).not.toBe(p.tacheId);
    expect(await lancer(rejouee.tacheId)).toMatchObject({ etat: 'publiee', idExterne: 'media-9001' });
    expect(envois()).toBe(1);

    const lue = (await lire(p.id)).donnees;
    expect(lue.publication).toMatchObject({ etat: 'publiee', idExterne: 'media-9001', lien: 'https://www.instagram.com/reel/ABC123/', tentatives: 2 });
    expect(lue.tentatives.map((t: { numero: number; issue: string; origine: string; pat: string }) => [t.numero, t.issue, t.origine, t.pat])).toEqual([[1, 'en_echec', 'api', jetonIdA], [2, 'publiee', 'api', jetonIdA]]);
    const audit = banc.audit.lignes.filter((l) => l.action === 'publication_tentative');
    expect(audit).toHaveLength(2);
    for (const l of audit) expect(l.details).toMatchObject({ origine: 'api', pat: jetonIdA });
    expect(JSON.stringify(banc.audit.lignes)).not.toContain(jetonA);
    expect(banc.audit.lignes.some((l) => l.action === 'publication_rejouer' || String(l.action).includes('rejouer'))).toBe(true);
    expect(banc.notifications.lignes.map((n) => n.genre)).toEqual(['publication_echec', 'publication_publiee']);
    // Le statut de la vidéo ne change pas : son rendu reste prêt.
    expect(banc.montages.rendus.find((x) => x.montageId === montageId && x.genre === 'complet')!.etat).toBe('pret');
    // Une publication publiée ne se rejoue pas : jamais deux fois.
    expect((await appeler({ id: p.id }, 'publication/rejouer')).json()).toMatchObject({ erreur: { code: 'PUBLICATION_ETAT' } });
    expect(envois()).toBe(1);
  });

  it('7.5 rejouer refuse ce qui n’est pas en échec (en file, incertaine, annulée), une autre personne, et une publication inconnue', async () => {
    const p = await publierMaintenant();
    expect((await appeler({ id: p.id }, 'publication/rejouer')).json()).toMatchObject({ erreur: { code: 'PUBLICATION_ETAT' } });
    meta.reglages.couper.add(cheminPublier());
    expect(await lancer(p.tacheId)).toMatchObject({ etat: 'incertaine' });
    expect((await appeler({ id: p.id }, 'publication/rejouer')).json()).toMatchObject({ erreur: { code: 'PUBLICATION_ETAT' } });
    expect((await appeler({ id: p.id }, 'publication/rejouer', jetonB)).statusCode).toBe(404);
    expect((await appeler({ id: randomUUID() }, 'publication/rejouer')).statusCode).toBe(404);
    expect((await appeler({ id: p.id, force: true }, 'publication/rejouer')).statusCode).toBe(400);
    expect(banc.publications.lignes.find((l) => l.id === p.id)!.etat).toBe('incertaine');
  });

  it('7.5 rejouer un échec MONTAGE_MODIFIE fige la dernière version ; un retard dépassé (ECHEANCE_PERIMEE) part maintenant', async () => {
    const p = (await programmer('2026-10-21T14:30')).json().donnees.publication;
    const base = banc.montages.montages.find((m) => m.id === montageId)!;
    const v2 = await banc.montages.creerVersion({ marqueId, utilisateurId: utilisateurA, parentId: base.id, origine: 'edition', timeline: base.timeline });
    if (v2.etat !== 'ok') throw new Error('version refusée');
    await passer(Date.parse('2026-10-21T12:30:20Z'));
    expect(banc.publications.lignes.find((l) => l.id === p.id)).toMatchObject({ etat: 'en_echec', cause: 'MONTAGE_MODIFIE' });
    // Pas de rendu sur la nouvelle version : refusé, l'échec reste tel quel.
    expect((await appeler({ id: p.id }, 'publication/rejouer')).json()).toMatchObject({ erreur: { code: 'PUBLICATION_RENDU_ABSENT' } });
    expect(banc.publications.lignes.find((l) => l.id === p.id)!.etat).toBe('en_echec');
    await ajouterRendu(v2.montage.id, v2.montage.espaceId);
    const r = (await appeler({ id: p.id }, 'publication/rejouer')).json().donnees.publication;
    expect(r).toMatchObject({ etat: 'en_file', montageId: v2.montage.id });
    expect(await lancer(r.tacheId)).toMatchObject({ etat: 'publiee' });
    expect(envois()).toBe(1);
    const tentatives = (await lire(p.id)).donnees.tentatives;
    expect(tentatives.map((t: { origine: string; issue: string }) => [t.origine, t.issue])).toEqual([['echeance', 'en_echec'], ['api', 'publiee']]);

    // Échéance périmée : l'échec porte la cause, rejouer envoie maintenant.
    const m2 = await nouveauMontage(true);
    const q = (await programmer('2026-10-21T15:00', m2)).json().donnees.publication;
    banc.publications.lignes.find((l) => l.id === q.id)!.etat = 'en_echec';
    Object.assign(banc.publications.lignes.find((l) => l.id === q.id)!, { cause: 'ECHEANCE_PERIMEE', action: 'rejouer' });
    const rq = (await appeler({ id: q.id }, 'publication/rejouer')).json().donnees.publication;
    expect(rq).toMatchObject({ etat: 'en_file', montageId: m2 });
  });

  it('7.5 la bibliothèque se filtre par réseau (publiée, en cours ou programmée ; pas annulée) et refuse un réseau inconnu', async () => {
    const autre = await nouveauMontage(true);
    const sans = await nouveauMontage(true);
    const annulee = await nouveauMontage(true);
    await publierMaintenant(montageId);
    await programmer('2026-10-22T10:00', autre);
    const a = (await programmer('2026-10-22T11:00', annulee)).json().donnees.publication;
    await appeler({ id: a.id }, 'publication/annuler');
    const serieDe = (id: string) => banc.montages.montages.find((m) => m.id === id)!.id;
    const liste = async (corps: unknown) => ((await appeler(corps, 'montage/bibliotheque')).json().donnees.videos as { montage: { id: string } }[]).map((v) => v.montage.id);
    const surInstagram = await liste({ reseau: 'instagram' });
    expect(surInstagram.sort()).toEqual([serieDe(montageId), serieDe(autre)].sort());
    expect(surInstagram).not.toContain(sans);
    expect(surInstagram).not.toContain(annulee);
    expect(await liste({ reseau: 'tiktok' })).toEqual([]);
    expect((await liste({})).length).toBeGreaterThanOrEqual(4);
    expect((await appeler({ reseau: 'myspace' }, 'montage/bibliotheque')).statusCode).toBe(400);
  });
});
