// Histoire 7.3 : publier maintenant, jamais deux fois. Tout appel à Meta vise un faux serveur local (127.0.0.1).
import { createHash, randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { EntreeJournalMontage } from '@regie/contrats';
import { signerAdresse } from '../src/auth/adresses-signees.ts';
import { ConnecteurInstagram } from '../src/publication/connecteur-instagram.ts';
import { DUREE_ADRESSE_PUBLICATION_S, executantReseau } from '../src/publication/executant-reseau.ts';
import { construireServeur } from '../src/serveur.ts';
import { creerMontageDuJeu } from '../src/services/film-jeu.ts';
import { creerServicesDeTest, type BancDeTest } from './faux-auth.ts';
import { demarrerFauxMeta, type FauxMeta } from './faux-reseaux.ts';

const ORIGINE = 'http://127.0.0.1:4321';
const WEBM = Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), Buffer.from('film-factice')]);
const JETON_META = 'jeton-long-instagram';
const journal: EntreeJournalMontage[] = [
  { t: 0, genre: 'film_debut' },
  { t: 100, genre: 'narration', cible: 'Bienvenue sur la page.' },
  { t: 2000, genre: 'clic', x: 800, y: 200 },
  { t: 7000, genre: 'film_fin' },
];

describe('publier maintenant', () => {
  let meta: FauxMeta;
  let banc: BancDeTest;
  let app: Awaited<ReturnType<typeof construireServeur>>;
  let marqueId: string;
  let utilisateurA: string;
  let espaceA: string;
  let jetonA: string;
  let jetonId: string;
  let compteId: string;
  let montageId: string;
  let fichierRenduId: string;
  const cheminPublier = () => `/v23.0/${meta.reglages.compteExterne}/media_publish`;

  const appeler = (corps: unknown, chemin = 'publication/publier', jeton = jetonA) =>
    app.inject({ method: 'POST', url: `/api/v1/${chemin}`, headers: { authorization: `Bearer ${jeton}`, 'content-type': 'application/json' }, payload: JSON.stringify(corps) });
  const publier = () => appeler({ montageId, compteId });
  const envois = () => meta.requetes.filter((r) => r.chemin === cheminPublier()).length;
  const aide = { signal: new AbortController().signal, pointDeNonRetour: async () => undefined };
  const lancer = async (tacheId: string) => {
    const tache = banc.file.taches.find((t) => t.id === tacheId)!;
    return executantReseau(banc.services, { attenteLiaisonMs: 1 }).executer(tache, aide);
  };

  async function nouveauMontage(avecRendu: boolean) {
    const film = { octets: WEBM, sha256: createHash('sha256').update(WEBM).digest('hex') };
    const r = await creerMontageDuJeu({ montages: banc.montages, stockage: banc.stockage, gabarits: banc.gabarits, file: banc.file }, { marqueId, utilisateurId: utilisateurA }, { id: randomUUID(), espaceId: espaceA, nom: 'Parcours' }, film, WEBM.length, journal, 7000);
    if (!('montageId' in r)) throw new Error(`montage refusé : ${r.refus}`);
    const m = banc.montages.montages.find((x) => x.id === r.montageId)!;
    let fichierId = randomUUID();
    if (avecRendu) {
      banc.montages.fichiers.push({ id: fichierId, espaceId: m.espaceId, genre: 'rendu', mime: 'video/mp4', octets: 5, sha256: 'a'.repeat(64), dureeMs: 7000, montageId: m.id, sceneId: null, creeLe: new Date(), purgeLe: null });
      await banc.stockage.ecrire(marqueId, fichierId, Buffer.from('rendu'));
      banc.montages.rendus.push({ id: randomUUID(), espaceId: m.espaceId, montageId: m.id, genre: 'complet', etat: 'pret', tacheId: null, fichierId, violations: [], cause: null, creeLe: new Date(), termineLe: null });
    } else fichierId = randomUUID();
    return { id: m.id, fichierId };
  }

  beforeAll(async () => {
    if (!existsSync(fileURLToPath(new URL('../dist/server/entry.mjs', import.meta.url)))) throw new Error('coeur/dist absent : lance `npm run build` avant les tests.');
    meta = await demarrerFauxMeta();
    banc = creerServicesDeTest(undefined, { urlPublique: ORIGINE, connecteurs: { instagram: new ConnecteurInstagram({ adresses: meta.adresses, pauseMs: 0, delaiMs: 2000 }) } });
    marqueId = await banc.marques.creer();
    const a = await banc.espaces.assurer(marqueId, 'sub-a', undefined, 'Établia');
    utilisateurA = a.utilisateurId;
    espaceA = a.espaces[0]!.id;
    const pat = await banc.jetons.creer({ marqueId, utilisateurId: utilisateurA, sub: 'sub-a', nom: 't', portees: ['lecture', 'ecriture'], espaceIds: [espaceA], dureeJours: 30 });
    jetonA = pat.clair;
    jetonId = pat.jeton.id;
    const compte = await banc.comptesReseau.connecter({ marqueId, utilisateurId: utilisateurA, espaceId: espaceA, reseau: 'instagram', compteExterne: meta.reglages.compteExterne, nom: 'compte_de_demo', jeton: JETON_META, expireLe: new Date(Date.now() + 50 * 86_400_000) }, new Date());
    compteId = compte!.id;
    const m = await nouveauMontage(true);
    montageId = m.id;
    fichierRenduId = m.fichierId;
    app = await construireServeur({ services: banc.services });
    await app.ready();
  });
  afterAll(async () => {
    await app?.close();
    await meta?.fermer();
  });
  beforeEach(() => {
    banc.publications.lignes.length = 0;
    banc.publications.historique.length = 0;
    banc.montages.publiees.clear();
    banc.file.taches.length = 0;
    banc.notifications.lignes.length = 0;
    banc.audit.lignes.length = 0;
    meta.requetes.length = 0;
    meta.reglages.statutsForces = {};
    meta.reglages.couper.clear();
    meta.reglages.quota = { utilise: 3, total: 100 };
    meta.reglages.etatsTraitement = ['FINISHED'];
  });

  it('refuse sans compte connecté, sans rendu prêt, hors bornes ou quota atteint, et ne met rien en file', async () => {
    const autre = await nouveauMontage(false);
    expect((await appeler({ montageId: autre.id, compteId })).json()).toMatchObject({ erreur: { code: 'PUBLICATION_RENDU_ABSENT' } });

    const fichier = banc.montages.fichiers.find((f) => f.id === fichierRenduId)! as { dureeMs: number | null };
    fichier.dureeMs = 1000;
    const court = await publier();
    fichier.dureeMs = 7000;
    expect(court.statusCode).toBe(422);
    expect(court.json()).toMatchObject({ erreur: { code: 'PUBLICATION_BORNE' } });

    meta.reglages.quota = { utilise: 100, total: 100 };
    const plein = await publier();
    expect(plein.statusCode).toBe(409);
    expect(plein.json()).toMatchObject({ erreur: { code: 'PUBLICATION_QUOTA' } });

    const inconnu = await appeler({ montageId, compteId: randomUUID() });
    expect(inconnu.statusCode).toBe(404);
    expect(banc.file.taches.filter((t) => t.type === 'reseau')).toHaveLength(0);
    expect(banc.publications.lignes).toHaveLength(0);
  });

  it('refuse un compte déconnecté', async () => {
    const compte = await banc.comptesReseau.connecter({ marqueId, utilisateurId: utilisateurA, espaceId: espaceA, reseau: 'instagram', compteExterne: '999', nom: 'x', jeton: JETON_META, expireLe: new Date(Date.now() + 86_400_000) }, new Date());
    await banc.comptesReseau.deconnecter(marqueId, utilisateurA, compte!.id);
    const r = await appeler({ montageId, compteId: compte!.id });
    expect(r.statusCode).toBe(409);
    expect(r.json()).toMatchObject({ erreur: { code: 'PUBLICATION_COMPTE_DECONNECTE' } });
  });

  it('met la publication en file, fige montage et rendu, et ne rend ni jeton ni clé d’idempotence', async () => {
    const r = await publier();
    expect(r.statusCode).toBe(200);
    const p = r.json().donnees.publication;
    expect(p).toMatchObject({ etat: 'en_file', montageId, compteId, reseau: 'instagram' });
    expect(p.renduId).toBe(banc.montages.rendus.find((x) => x.montageId === montageId && x.genre === 'complet' && x.etat === 'pret')!.id);
    expect(banc.file.taches.filter((t) => t.type === 'reseau')).toHaveLength(1);
    expect(JSON.stringify(r.json())).not.toContain(JETON_META);
    expect(JSON.stringify(r.json())).not.toContain('cleIdempotence');
    expect(envois()).toBe(0);
  });

  it('une seule publication par compte et par vidéo', async () => {
    expect((await publier()).statusCode).toBe(200);
    const deux = await publier();
    expect(deux.statusCode).toBe(409);
    expect(deux.json()).toMatchObject({ erreur: { code: 'PUBLICATION_EXISTANTE' } });
    expect(banc.file.taches.filter((t) => t.type === 'reseau')).toHaveLength(1);
  });

  it('envoie une fois : publiée avec identifiant et lien, audit de la tentative sans jeton, adresse signée de moins d’une heure', async () => {
    const p = (await publier()).json().donnees.publication;
    const r = await lancer(p.tacheId);
    expect(r).toMatchObject({ etat: 'publiee', idExterne: 'media-9001' });
    expect(envois()).toBe(1);

    const lue = (await appeler({ id: p.id }, 'publication/lire')).json().donnees;
    expect(lue.publication).toMatchObject({ etat: 'publiee', idExterne: 'media-9001', lien: 'https://www.instagram.com/reel/ABC123/' });
    expect(lue.tentatives).toHaveLength(1);

    const creation = meta.requetes.find((q) => q.chemin.endsWith('/media') && q.methode === 'POST')!;
    const adresse = new URL(creation.corps.get('video_url')!);
    expect(adresse.pathname).toBe(`/v/publication/${marqueId}/${utilisateurA}/${fichierRenduId}`);
    const expiration = Number(adresse.searchParams.get('e'));
    expect(expiration - Math.floor(Date.now() / 1000)).toBeLessThanOrEqual(DUREE_ADRESSE_PUBLICATION_S + 2);
    expect(DUREE_ADRESSE_PUBLICATION_S).toBeLessThan(3600);

    const audit = banc.audit.lignes.filter((l) => l.action === 'publication_tentative');
    expect(audit).toHaveLength(1);
    expect(audit[0]!.details).toMatchObject({ origine: 'api', pat: jetonId });
    expect(JSON.stringify(banc.audit.lignes)).not.toContain(JETON_META);
    expect(JSON.stringify(banc.audit.lignes)).not.toContain(jetonA);
    expect(banc.notifications.lignes.map((n) => n.genre)).toEqual(['publication_publiee']);
  });

  it('une tâche rejouée ne publie jamais deux fois', async () => {
    const p = (await publier()).json().donnees.publication;
    await lancer(p.tacheId);
    const encore = await lancer(p.tacheId);
    expect(encore).toMatchObject({ etat: 'publiee' });
    expect(envois()).toBe(1);
    // Une seconde tâche pour la même publication ne passe pas non plus le compare-and-set.
    const autre = await banc.file.enfiler(marqueId, utilisateurA, 'reseau', { publicationId: p.id, origine: 'api', pat: null, sub: 'sub-a' });
    expect(await lancer(autre.id)).toMatchObject({ etat: 'ignoree' });
    expect(envois()).toBe(1);
  });

  it('une publication restée en cours d’envoi n’est jamais renvoyée', async () => {
    const p = (await publier()).json().donnees.publication;
    const ligne = banc.publications.lignes.find((l) => l.id === p.id)!;
    ligne.etat = 'envoi_en_cours';
    expect(await lancer(p.tacheId)).toMatchObject({ etat: 'ignoree' });
    expect(envois()).toBe(0);
    expect(meta.requetes.filter((q) => q.chemin.endsWith('/media'))).toHaveLength(0);
  });

  it('une coupure après envoi donne un état incertain, avec cause et action, sans renvoi ni rejeu possible', async () => {
    meta.reglages.couper.add(cheminPublier());
    const p = (await publier()).json().donnees.publication;
    const r = await lancer(p.tacheId);
    expect(r).toMatchObject({ etat: 'incertaine', cause: 'RESEAU_INJOIGNABLE' });
    const lue = (await appeler({ id: p.id }, 'publication/lire')).json().donnees.publication;
    expect(lue).toMatchObject({ etat: 'incertaine', cause: 'RESEAU_INJOIGNABLE', action: 'verifier' });
    expect(banc.notifications.lignes.map((n) => n.genre)).toEqual(['publication_incertaine']);
    meta.reglages.couper.clear();
    expect(await lancer(p.tacheId)).toMatchObject({ etat: 'ignoree' });
    expect(envois()).toBe(1);
    // Une vidéo d'état incertain est peut-être en ligne : elle ne se supprime pas.
    const suppression = await appeler({ id: montageId, confirmer: true }, 'montage/supprimer');
    expect(suppression.statusCode).toBe(409);
    expect(suppression.json()).toMatchObject({ erreur: { code: 'VIDEO_PUBLIEE' } });
  });

  it('un refus sûr du réseau donne un échec rejouable avec la cause', async () => {
    meta.reglages.statutsForces[`/v23.0/${meta.reglages.compteExterne}/media`] = 400;
    const p = (await publier()).json().donnees.publication;
    const r = (await lancer(p.tacheId)) as { etat: string };
    expect(r.etat).toBe('en_echec');
    const lue = (await appeler({ id: p.id }, 'publication/lire')).json().donnees.publication;
    expect(lue).toMatchObject({ etat: 'en_echec', action: 'rejouer' });
    expect(lue.cause).toMatch(/^[A-Z_]+$/);
    expect(banc.notifications.lignes.map((n) => n.genre)).toEqual(['publication_echec']);
  });

  it('refuse d’envoyer si le compte a été déconnecté entre-temps, sans appeler le réseau', async () => {
    const p = (await publier()).json().donnees.publication;
    await banc.comptesReseau.deconnecter(marqueId, utilisateurA, compteId);
    const r = await lancer(p.tacheId);
    expect(r).toMatchObject({ etat: 'en_echec', cause: 'PUBLICATION_COMPTE_DECONNECTE' });
    expect(meta.requetes.filter((q) => q.chemin.endsWith('/media'))).toHaveLength(0);
    // Reconnecte le compte pour les tests suivants.
    await banc.comptesReseau.connecter({ marqueId, utilisateurId: utilisateurA, espaceId: espaceA, reseau: 'instagram', compteExterne: meta.reglages.compteExterne, nom: 'compte_de_demo', jeton: JETON_META, expireLe: new Date(Date.now() + 50 * 86_400_000) }, new Date());
  });

  it('l’adresse /v/publication ne sert la vidéo que pendant l’envoi, et seulement si elle est signée', async () => {
    const p = (await publier()).json().donnees.publication;
    const chemin = `/v/publication/${marqueId}/${utilisateurA}/${fichierRenduId}`;
    const signee = signerAdresse(banc.services.cleAdresses, chemin, { maintenant: Date.now(), dureeS: 600 });
    expect((await app.inject({ method: 'GET', url: signee })).statusCode).toBe(404);
    banc.publications.lignes.find((l) => l.id === p.id)!.etat = 'envoi_en_cours';
    const ok = await app.inject({ method: 'GET', url: signee });
    expect(ok.statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: chemin })).statusCode).toBe(403);
    expect((await app.inject({ method: 'GET', url: `${signee}0` })).statusCode).toBeGreaterThanOrEqual(400);
  });

  it('la vidéo publiée ne se supprime pas ; sans publication en ligne elle se supprime', async () => {
    const p = (await publier()).json().donnees.publication;
    await lancer(p.tacheId);
    const refus = await appeler({ id: montageId, confirmer: true }, 'montage/supprimer');
    expect(refus.statusCode).toBe(409);
    expect(refus.json()).toMatchObject({ erreur: { code: 'VIDEO_PUBLIEE' } });
    const jetable = await nouveauMontage(true);
    const ok = await appeler({ id: jetable.id, confirmer: true }, 'montage/supprimer');
    expect(ok.statusCode).toBe(200);
  });

  it('liste les publications d’une vidéo et filtre par réseau et état', async () => {
    await publier();
    const tout = (await appeler({ montageId }, 'publication/lister')).json().donnees.publications;
    expect(tout).toHaveLength(1);
    expect(tout[0].reseauNom).toBe('Instagram');
    expect((await appeler({ reseau: 'instagram', etat: 'publiee' }, 'publication/lister')).json().donnees.publications).toHaveLength(0);
    expect((await appeler({ reseau: 'inconnu' }, 'publication/lister')).statusCode).toBe(400);
  });

  it('ne laisse jamais le jeton Meta dans une réponse, un journal ou une notification', async () => {
    meta.reglages.couper.add(cheminPublier());
    const p = (await publier()).json().donnees.publication;
    await lancer(p.tacheId);
    const tout = JSON.stringify([banc.notifications.lignes, banc.audit.lignes, banc.publications.lignes.map(({ cleIdempotence: _c, ...r }) => r), banc.publications.historique]);
    expect(tout).not.toContain(JETON_META);
  });
});
