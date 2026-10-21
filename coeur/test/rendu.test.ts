// Histoire 4.6 : flux de fichiers, montage, tâche de rendu (faux lanceur), actions et lecture par adresse signée.
import { createHash, randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { EntreeJournalMontage } from '@regie/contrats';
import { signerAdresse } from '../src/auth/adresses-signees.ts';
import { evaluerMontage } from '../src/domaine/montage.ts';
import type { Tache } from '../src/infra/file.ts';
import { construireServeur } from '../src/serveur.ts';
import { FILM_MAX_OCTETS, Reassembleur, estMp4, estWav, estWebm, lignesFichier } from '../src/services/flux-fichiers.ts';
import { creerMontageDuJeu } from '../src/services/film-jeu.ts';
import { lirePlage } from '../src/services/lecture-fichier.ts';
import { creerExecutantRendu, type DemandeRendu, type LanceurRendu } from '../src/services/rendu.ts';
import { ErreurTache } from '../src/services/travailleur.ts';
import { creerServicesDeTest, type BancDeTest } from './faux-auth.ts';

const ORIGINE = 'http://127.0.0.1:4321';
const WEBM = Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), Buffer.from('film-factice')]);
const MP4 = Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from('ftypisom'), Buffer.alloc(40, 7)]);
const journal: EntreeJournalMontage[] = [
  { t: 0, genre: 'film_debut' },
  { t: 100, genre: 'narration', cible: 'Bienvenue sur la page.' },
  { t: 2000, genre: 'clic', x: 800, y: 200 },
  { t: 6000, genre: 'film_fin' },
];

describe('flux de fichiers', () => {
  const sha = (b: Buffer): string => createHash('sha256').update(b).digest('hex');
  const versFilm = (lignes: string[]): string[] => lignes.map((l) => l.replace('{"fichier":{"nom":"x",', '{"film":{'));

  it('reconstitue un fichier découpé en morceaux, avec taille et empreinte contrôlées', () => {
    const octets = Buffer.alloc(150_000, 3);
    const r = new Reassembleur(FILM_MAX_OCTETS);
    for (const l of versFilm(lignesFichier('x', octets))) expect(r.ajouter(l)).toBe(true);
    expect(r.erreur).toBeUndefined();
    expect(r.fichier?.octets.equals(octets)).toBe(true);
    expect(r.fichier?.sha256).toBe(sha(octets));
  });
  it('ignore ce qui n’est pas du film', () => {
    expect(new Reassembleur(10).ajouter('{"t":1}')).toBe(false);
  });
  it('refuse un morceau hors d’ordre, une empreinte fausse, un fichier trop gros ou une ligne illisible', () => {
    const l = versFilm(lignesFichier('x', Buffer.alloc(100_000, 1)));
    const horsOrdre = new Reassembleur(FILM_MAX_OCTETS);
    horsOrdre.ajouter(l[1]!);
    expect(horsOrdre.erreur).toBe('FLUX_DESORDONNE');
    expect(horsOrdre.fichier).toBeUndefined();
    const fausse = new Reassembleur(FILM_MAX_OCTETS);
    l.slice(0, -1).forEach((x) => fausse.ajouter(x));
    fausse.ajouter(l.at(-1)!.replace(/[0-9a-f]{64}/, '0'.repeat(64)));
    expect(fausse.erreur).toBe('FLUX_INCOHERENT');
    expect(fausse.fichier).toBeUndefined();
    const gros = new Reassembleur(1000);
    gros.ajouter(l[0]!);
    expect(gros.erreur).toBe('FICHIER_TROP_GROS');
    const illisible = new Reassembleur(1000);
    illisible.ajouter('{"film":{"n":"x"}}');
    expect(illisible.erreur).toBe('FLUX_ILLISIBLE');
    expect(illisible.fichier).toBeUndefined();
  });
  it('sans ligne de fin, rien n’est rendu (une donnée absente refuse)', () => {
    const r = new Reassembleur(FILM_MAX_OCTETS);
    r.ajouter(versFilm(lignesFichier('x', Buffer.alloc(10)))[0]!);
    expect(r.fichier).toBeUndefined();
  });
  it('reconnaît les formats par leurs octets magiques', () => {
    expect(estWebm(WEBM)).toBe(true);
    expect(estWebm(MP4)).toBe(false);
    expect(estMp4(MP4)).toBe(true);
    expect(estMp4(WEBM)).toBe(false);
    expect(estWav(Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WAVE'), Buffer.alloc(8)]))).toBe(true);
    expect(estWav(MP4)).toBe(false);
  });
});

describe('plage d’octets', () => {
  it('lit les formes valides et refuse le reste', () => {
    expect(lirePlage(undefined, 100)).toBeUndefined();
    expect(lirePlage('bytes=0-9', 100)).toEqual({ debut: 0, fin: 9 });
    expect(lirePlage('bytes=90-', 100)).toEqual({ debut: 90, fin: 99 });
    expect(lirePlage('bytes=-10', 100)).toEqual({ debut: 90, fin: 99 });
    expect(lirePlage('bytes=0-999', 100)).toEqual({ debut: 0, fin: 99 });
    for (const mauvaise of ['bytes=100-', 'bytes=5-2', 'bytes=-', 'bytes=0-1,5-6', 'octets=0-1', 'bytes=-0']) expect(lirePlage(mauvaise, 100)).toBe('invalide');
  });
});

describe('rendu : montage, tâche et lecture', () => {
  let banc: BancDeTest;
  let marqueId: string;
  let utilisateurA: string;
  let espaceA: string;
  let scriptId: string;

  const faux = (comportement: (d: DemandeRendu) => Promise<Buffer>): { lanceur: LanceurRendu; demandes: DemandeRendu[] } => {
    const demandes: DemandeRendu[] = [];
    return { demandes, lanceur: { rendre: async (d) => (demandes.push(d), comportement(d)) } };
  };
  const tacheDe = (renduId: string): Tache =>
    ({ id: randomUUID(), marqueId, utilisateurId: utilisateurA, type: 'rendu', classe: 'lot', gpu: true, reprise: 'verifier', delaiGardeS: 900, tentativesMax: 3, entree: { renduId }, etat: 'en_cours', tentatives: 1, reprises: 0, disponibleLe: new Date(), verrouPar: undefined, bailJusqua: undefined, pointDeNonRetour: false, resultat: undefined, cause: undefined, action: undefined, creeLe: new Date(), demarreeLe: undefined }) as unknown as Tache;
  const aide = { signal: new AbortController().signal } as never;
  const executant = (l: LanceurRendu) => creerExecutantRendu({ montages: banc.montages, stockage: banc.stockage, lanceur: l, avecTexte: true });
  const film = { octets: WEBM, sha256: createHash('sha256').update(WEBM).digest('hex') };

  async function nouveauMontage(contrasteFaible = false) {
    const r = await creerMontageDuJeu(
      { montages: banc.montages, stockage: banc.stockage, gabarits: banc.gabarits, file: banc.file },
      { marqueId, utilisateurId: utilisateurA },
      { id: scriptId, espaceId: espaceA, nom: 'Parcours recette' },
      film,
      WEBM.length,
      journal,
      6000,
    );
    if (!('montageId' in r)) throw new Error(`montage refusé : ${r.refus}`);
    if (contrasteFaible) {
      // Texte presque de la couleur du fond de son bandeau : la garde de contraste le refuse.
      const m = banc.montages.montages.find((x) => x.id === r.montageId)!;
      (m.gabarit.definition as { couleurs: string[] }).couleurs = ['#FFFFFF', '#FEFEFE', '#FFFFFF', '#FFFFFF'];
    }
    const rendu = banc.montages.rendus.find((x) => x.montageId === r.montageId)!;
    return { ...r, rendu };
  }

  beforeAll(async () => {
    banc = creerServicesDeTest(undefined, { urlPublique: ORIGINE });
    marqueId = await banc.marques.creer();
    const a = await banc.espaces.assurer(marqueId, 'sub-a', undefined, 'Établia');
    utilisateurA = a.utilisateurId;
    espaceA = a.espaces[0]!.id;
    scriptId = randomUUID();
  });

  it('crée le montage du jeu : film rangé, timeline tirée du journal, gabarit figé, rendu allégé en file', async () => {
    const m = await nouveauMontage();
    const montage = banc.montages.montages.find((x) => x.id === m.montageId)!;
    expect(montage.origine).toBe('jeu');
    expect(montage.gabarit.id).toBeDefined();
    expect(montage.timeline.scenes.length).toBeGreaterThan(0);
    expect(banc.stockage.fichiers.get(`${marqueId}/${montage.filmFichierId}`)?.equals(WEBM)).toBe(true);
    expect(m.rendu).toMatchObject({ genre: 'allege', etat: 'en_file', tacheId: m.tacheRenduId });
  });
  it('refuse un film qui n’est pas du WebM ou dont la taille ne correspond pas : pas de montage', async () => {
    const o = { montages: banc.montages, stockage: banc.stockage, gabarits: banc.gabarits, file: banc.file };
    const qui = { marqueId, utilisateurId: utilisateurA };
    const s = { id: scriptId, espaceId: espaceA, nom: 'x' };
    const avant = banc.montages.montages.length;
    expect(await creerMontageDuJeu(o, qui, s, { octets: MP4, sha256: 'a' }, MP4.length, journal, 6000)).toEqual({ refus: 'FILM_INVALIDE' });
    expect(await creerMontageDuJeu(o, qui, s, film, WEBM.length + 1, journal, 6000)).toEqual({ refus: 'FILM_INVALIDE' });
    expect(await creerMontageDuJeu(o, qui, s, undefined, 0, journal, 6000)).toEqual({ refus: 'FILM_INVALIDE' });
    expect(banc.montages.montages.length).toBe(avant);
  });
  it('ne crée aucun montage dans un espace que la personne ne voit pas, et nettoie le film', async () => {
    const o = { montages: banc.montages, stockage: banc.stockage, gabarits: banc.gabarits, file: banc.file };
    banc.montages.espacesVisibles = [];
    const avant = banc.stockage.fichiers.size;
    const r = await creerMontageDuJeu(o, { marqueId, utilisateurId: utilisateurA }, { id: scriptId, espaceId: espaceA, nom: 'x' }, film, WEBM.length, journal, 6000);
    banc.montages.espacesVisibles = undefined;
    expect(r).toEqual({ refus: 'MONTAGE_ECHEC' });
    expect(banc.stockage.fichiers.size).toBe(avant);
  });

  it('rend le montage : le MP4 est rangé et le rendu passe « prêt » quand les gardes sont respectées', async () => {
    const m = await nouveauMontage();
    const { lanceur, demandes } = faux(async () => MP4);
    const sortie = (await executant(lanceur).executer(tacheDe(m.rendu.id), aide)) as { etat: string };
    expect(sortie.etat).toBe('pret');
    const rendu = (await banc.montages.lireRendu(marqueId, utilisateurA, m.rendu.id))!;
    expect(rendu.etat).toBe('pret');
    expect(rendu.fichierId).not.toBeNull();
    const fichier = (await banc.montages.lireFichier(marqueId, utilisateurA, rendu.fichierId!))!;
    expect(fichier).toMatchObject({ genre: 'rendu_allege', mime: 'video/mp4', sha256: createHash('sha256').update(MP4).digest('hex') });
    expect(demandes[0]!.film.length).toBe(WEBM.length);
    expect(demandes[0]!.plan.args.at(-1)).toBe('sortie.mp4');
  });
  it('un texte sous le contraste minimal garde la vidéo visible mais « bloquée », avec la mesure fautive', async () => {
    const m = await nouveauMontage(true);
    const { lanceur } = faux(async () => MP4);
    const sortie = (await executant(lanceur).executer(tacheDe(m.rendu.id), aide)) as { etat: string };
    expect(sortie.etat).toBe('bloque');
    const rendu = (await banc.montages.lireRendu(marqueId, utilisateurA, m.rendu.id))!;
    expect(rendu.etat).toBe('bloque');
    expect(rendu.fichierId).not.toBeNull();
    expect(rendu.violations.length).toBeGreaterThan(0);
    expect(rendu.violations[0]).toMatchObject({ code: 'CONTRASTE', segment: 'sc-1', seuil: 4.5 });
    const montage = banc.montages.montages.find((x) => x.id === m.montageId)!;
    expect(evaluerMontage(montage.timeline, montage.gabarit.definition).length).toBe(rendu.violations.length);
  });
  it('rushes purgés : refus SEANCE_PURGEE sans nouvel essai, rien n’est lancé', async () => {
    const m = await nouveauMontage();
    const montage = banc.montages.montages.find((x) => x.id === m.montageId)!;
    await banc.montages.marquerPurge(marqueId, utilisateurA, montage.filmFichierId, new Date());
    const { lanceur, demandes } = faux(async () => MP4);
    await expect(executant(lanceur).executer(tacheDe(m.rendu.id), aide)).rejects.toMatchObject({ message: expect.stringContaining('SEANCE_PURGEE') });
    expect(demandes).toHaveLength(0);
    expect((await banc.montages.lireRendu(marqueId, utilisateurA, m.rendu.id))!).toMatchObject({ etat: 'echec', cause: 'SEANCE_PURGEE' });
  });
  it('un échec du conteneur ou un MP4 illisible donne un échec relançable, jamais « prêt »', async () => {
    const m = await nouveauMontage();
    const casse = faux(async () => { throw new Error('SORTIE_1'); });
    const e1 = await executant(casse.lanceur).executer(tacheDe(m.rendu.id), aide).catch((e: unknown) => e);
    expect(e1).toBeInstanceOf(ErreurTache);
    expect((await banc.montages.lireRendu(marqueId, utilisateurA, m.rendu.id))!).toMatchObject({ etat: 'echec', cause: 'RENDU_ECHEC' });
    const m2 = await nouveauMontage();
    const illisible = faux(async () => Buffer.from('pas une vidéo'));
    await expect(executant(illisible.lanceur).executer(tacheDe(m2.rendu.id), aide)).rejects.toBeInstanceOf(ErreurTache);
    expect((await banc.montages.lireRendu(marqueId, utilisateurA, m2.rendu.id))!).toMatchObject({ etat: 'echec', cause: 'RENDU_ILLISIBLE' });
  });
  it('un rendu inconnu ou une entrée invalide est refusé', async () => {
    const { lanceur } = faux(async () => MP4);
    await expect(executant(lanceur).executer(tacheDe(randomUUID()), aide)).rejects.toBeInstanceOf(ErreurTache);
    await expect(executant(lanceur).executer({ ...tacheDe(randomUUID()), entree: { renduId: 'x' } }, aide)).rejects.toBeInstanceOf(ErreurTache);
  });

  describe('actions et adresse signée', () => {
    type App = Awaited<ReturnType<typeof construireServeur>>;
    let app: App;
    let jetonA: string;
    let jetonB: string;
    let jetonAutreEspace: string;
    let utilisateurB: string;
    let renduPret: string;
    let fichierPret: string;
    let renduBloque: string;
    let renduFile: string;
    let montagePret: string;
    const appeler = (jeton: string, chemin: string, corps: unknown = {}) =>
      app.inject({ method: 'POST', url: `/api/v1/${chemin}`, headers: { authorization: `Bearer ${jeton}`, 'content-type': 'application/json' }, payload: JSON.stringify(corps) });

    beforeAll(async () => {
      if (!existsSync(fileURLToPath(new URL('../dist/server/entry.mjs', import.meta.url)))) throw new Error('coeur/dist absent : lance `npm run build` avant les tests.');
      const b = await banc.espaces.assurer(marqueId, 'sub-b', undefined, 'Autre');
      utilisateurB = b.utilisateurId;
      const jeton = async (sub: string, utilisateurId: string, espaceIds: string[]) => (await banc.jetons.creer({ marqueId, utilisateurId, sub, nom: 't', portees: ['lecture', 'ecriture'], espaceIds, dureeJours: 30 })).clair;
      jetonA = await jeton('sub-a', utilisateurA, [espaceA]);
      jetonB = await jeton('sub-b', utilisateurB, [b.espaces[0]!.id]);
      jetonAutreEspace = await jeton('sub-a', utilisateurA, ['00000000-0000-4000-8000-000000000000']);
      const pret = await nouveauMontage();
      montagePret = pret.montageId;
      await executant(faux(async () => MP4).lanceur).executer(tacheDe(pret.rendu.id), aide);
      renduPret = pret.rendu.id;
      fichierPret = (await banc.montages.lireRendu(marqueId, utilisateurA, renduPret))!.fichierId!;
      const bloque = await nouveauMontage(true);
      await executant(faux(async () => MP4).lanceur).executer(tacheDe(bloque.rendu.id), aide);
      renduBloque = bloque.rendu.id;
      renduFile = (await nouveauMontage()).rendu.id;
      app = await construireServeur({ services: banc.services });
    });
    afterAll(async () => app?.close());

    it('liste et lit les montages avec leurs rendus et versions', async () => {
      const l = await appeler(jetonA, 'montage/lister');
      expect(l.statusCode).toBe(200);
      expect(l.json().donnees.montages.length).toBeGreaterThan(0);
      const r = await appeler(jetonA, 'montage/lire', { id: montagePret });
      expect(r.statusCode).toBe(200);
      expect(r.json().donnees.rendus[0]).toMatchObject({ etat: 'pret' });
      expect(r.json().donnees.montage.gabarit).toMatchObject({ version: 1 });
    });
    it('cloisonne : un autre espace ou une autre personne ne voit ni le montage ni le rendu', async () => {
      for (const jeton of [jetonB, jetonAutreEspace]) {
        expect((await appeler(jeton, 'montage/lire', { id: montagePret })).json().erreur.code).toBe('MONTAGE_INTROUVABLE');
        expect((await appeler(jeton, 'rendu/lire', { id: renduPret })).json().erreur.code).toBe('RENDU_INTROUVABLE');
        expect((await appeler(jeton, 'rendu/adresse', { id: renduPret })).json().erreur.code).toBe('RENDU_INTROUVABLE');
      }
      expect((await appeler(jetonAutreEspace, 'montage/lister')).json().donnees.montages).toEqual([]);
    });
    it('un rendu bloqué est lisible et dit pourquoi ; un rendu en file n’a pas d’adresse', async () => {
      const r = (await appeler(jetonA, 'rendu/lire', { id: renduBloque })).json().donnees.rendu;
      expect(r.etat).toBe('bloque');
      expect(r.violations[0].phrase).toEqual(expect.any(String));
      const adresse = (await appeler(jetonA, 'rendu/adresse', { id: renduBloque })).json().donnees;
      expect(adresse.bloque).toBe(true);
      const file = await appeler(jetonA, 'rendu/adresse', { id: renduFile });
      expect(file.statusCode).toBe(409);
      expect(file.json().erreur.code).toBe('RENDU_PAS_PRET');
    });
    it('sert la vidéo par une adresse signée de moins d’une heure, avec les plages d’octets', async () => {
      const a = (await appeler(jetonA, 'rendu/adresse', { id: renduPret })).json().donnees;
      expect(a.adresse).toMatch(/^\/v\/session\//);
      expect(a.expireDansS).toBeLessThan(3600);
      const tout = await app.inject({ method: 'GET', url: a.adresse });
      expect(tout.statusCode).toBe(200);
      expect(tout.headers['content-type']).toBe('video/mp4');
      expect(tout.headers['x-content-type-options']).toBe('nosniff');
      expect(tout.rawPayload.equals(MP4)).toBe(true);
      const part = await app.inject({ method: 'GET', url: a.adresse, headers: { range: 'bytes=0-9' } });
      expect(part.statusCode).toBe(206);
      expect(part.headers['content-range']).toBe(`bytes 0-9/${MP4.length}`);
      expect(part.rawPayload.equals(MP4.subarray(0, 10))).toBe(true);
      const mauvaise = await app.inject({ method: 'GET', url: a.adresse, headers: { range: 'bytes=9999-' } });
      expect(mauvaise.statusCode).toBe(416);
    });
    it('refuse une signature fausse ou expirée', async () => {
      const a = (await appeler(jetonA, 'rendu/adresse', { id: renduPret })).json().donnees;
      expect((await app.inject({ method: 'GET', url: a.adresse.replace(/s=.{3}/, 's=AAA') })).statusCode).toBe(403);
      expect((await app.inject({ method: 'GET', url: a.adresse.split('?')[0] })).statusCode).toBe(403);
      banc.horloge.t += 3 * 3600 * 1000;
      expect((await app.inject({ method: 'GET', url: a.adresse })).statusCode).toBe(403);
      banc.horloge.t -= 3 * 3600 * 1000;
    });
    it('répond pareil pour un fichier absent, purgé, d’une autre personne ou hors liste : 404 uniforme', async () => {
      const cle = banc.services.cleAdresses;
      const lire = (chemin: string) => app.inject({ method: 'GET', url: signerAdresse(cle, chemin, { maintenant: banc.services.maintenant(), dureeS: 600 }) });
      const absent = await lire(`/v/session/${marqueId}/${utilisateurA}/${randomUUID()}`);
      // L'adresse signée pour la personne B vise un fichier de A : la RLS (réelle) le cacherait ; ici le faux le cache par espace.
      banc.montages.espacesVisibles = [];
      const autre = await lire(`/v/session/${marqueId}/${utilisateurB}/${fichierPret}`);
      banc.montages.espacesVisibles = undefined;
      await banc.montages.marquerPurge(marqueId, utilisateurA, fichierPret, new Date());
      const purge = await lire(`/v/session/${marqueId}/${utilisateurA}/${fichierPret}`);
      const forme = await lire('/v/session/pas-un-uuid');
      for (const r of [absent, autre, purge, forme]) {
        expect(r.statusCode).toBe(404);
        expect(r.json()).toEqual({ erreur: 'introuvable' });
      }
    });
  });
});
