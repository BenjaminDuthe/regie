// Histoire 4.7 : voix de synthèse locale (faux moteur), modeles.lock, WAV contrôlé, texte de voix modifiable, sous-titres.
import { createHash, randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { EntreeJournalMontage } from '@regie/contrats';
import type { Tache } from '../src/infra/file.ts';
import { argumentsPodman } from '../src/services/capture.ts';
import { creerMontageDuJeu } from '../src/services/film-jeu.ts';
import { creerExecutantVoix, dureeWav, ErreurModeles, lireModelesLock, modeleDeVoix, MoteurVoixConteneur } from '../src/services/voix.ts';
import { ErreurTache } from '../src/services/travailleur.ts';
import { construireServeur } from '../src/serveur.ts';
import { creerServicesDeTest, type BancDeTest } from './faux-auth.ts';
import { FauxMoteurVoix, MS_PAR_CARACTERE, wavSilence } from './faux-voix.ts';
import { lignesFichier } from '../src/services/flux-fichiers.ts';

const WEBM = Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), Buffer.from('film-factice')]);
const journal: EntreeJournalMontage[] = [
  { t: 0, genre: 'film_debut' },
  { t: 100, genre: 'narration', cible: 'Bienvenue sur la page.' },
  { t: 2000, genre: 'clic', x: 800, y: 200 },
  { t: 6000, genre: 'film_fin' },
];
const SHA = 'a'.repeat(64);
const lock = (m: object) => JSON.stringify({ modeles: [{ nom: 'fr_FR-gilles-low', type: 'voix', fichier: 'fr_FR-gilles-low.onnx', version: '1.0.0', licence: 'CC0-1.0', source: 'https://exemple.test/voix', sha256: SHA, ...m }] });

describe('modeles.lock', () => {
  it('donne le fichier et l’empreinte de la voix retenue', () => {
    expect(modeleDeVoix(lireModelesLock(lock({})), 'fr_FR-gilles-low')).toEqual({ fichier: 'fr_FR-gilles-low.onnx', sha256: SHA });
  });
  it('refuse une empreinte manquante, un fichier illisible, un champ inconnu et un doublon', () => {
    expect(() => lireModelesLock(lock({ sha256: null }))).toThrow(ErreurModeles);
    expect(() => lireModelesLock('pas du json')).toThrow(ErreurModeles);
    expect(() => lireModelesLock(lock({ extra: 1 }))).toThrow(ErreurModeles);
    expect(() => lireModelesLock(lock({ fichier: '../x.onnx' }))).toThrow(ErreurModeles);
    const un = JSON.parse(lock({})).modeles[0];
    expect(() => lireModelesLock(JSON.stringify({ modeles: [un, un] }))).toThrow(ErreurModeles);
  });
  it('refuse une voix absente du lock', () => {
    expect(() => modeleDeVoix(lireModelesLock(lock({})), 'autre')).toThrow(ErreurModeles);
  });
  it('le lock du dépôt nomme la voix libre CC0 et laisse l’empreinte à mesurer (donc refusée tant qu’elle manque)', async () => {
    const { readFile } = await import('node:fs/promises');
    const texte = await readFile(fileURLToPath(new URL('../../deploiement/modeles.lock', import.meta.url)), 'utf8');
    const brut = JSON.parse(texte) as { modeles: { nom: string; licence: string; sha256: string | null }[] };
    expect(brut.modeles[0]).toMatchObject({ nom: 'fr_FR-gilles-low', licence: 'CC0-1.0' });
    if (brut.modeles[0]!.sha256 === null) expect(() => lireModelesLock(texte)).toThrow(ErreurModeles);
  });
});

describe('dureeWav', () => {
  it('mesure la durée d’un WAV PCM', () => {
    expect(dureeWav(wavSilence(1500))).toBe(1500);
  });
  it('refuse ce qui n’est pas un WAV cohérent', () => {
    expect(dureeWav(Buffer.from('pas un wav du tout'))).toBeUndefined();
    const sansData = wavSilence(100).subarray(0, 36);
    expect(dureeWav(sansData)).toBeUndefined();
    const vitesseNulle = wavSilence(100);
    vitesseNulle.writeUInt32LE(0, 28);
    expect(dureeWav(vitesseNulle)).toBeUndefined();
  });
  it('borne la taille annoncée par ce que le fichier contient', () => {
    const b = wavSilence(1000);
    b.writeUInt32LE(0xffffffff, 40);
    expect(dureeWav(b)).toBe(1000);
  });
});

describe('arguments du conteneur de voix', () => {
  const base = { socket: '/run/p.sock', image: 'localhost/regie-rendu:local', reseau: 'none' };
  it('monte les modèles en lecture seule et passe la commande après l’image, sans réseau', () => {
    const a = argumentsPodman({ ...base, commande: ['voix'], modeles: '/srv/modeles' }, 'regie-voix-1', 60);
    expect(a.slice(-2)).toEqual(['localhost/regie-rendu:local', 'voix']);
    expect(a[a.indexOf('--volume') + 1]).toBe('/srv/modeles:/modeles:ro,nosuid,nodev,noexec');
    expect(a[a.indexOf('--network') + 1]).toBe('none');
  });
  it('sans modèles, aucun volume', () => {
    expect(argumentsPodman(base, 'x', 60)).not.toContain('--volume');
  });
});

describe('MoteurVoixConteneur', () => {
  const wav = wavSilence(500);
  const lanceurQui = (sortie: (entree: string) => string) => ({ lancer: async (d: { entree: string; surLigne?: (l: string) => void }) => {
    const texte = sortie(d.entree);
    for (const l of texte.split('\n')) d.surLigne?.(l);
    return texte.split('\n').filter((l) => !l.startsWith('{"film":')).join('\n');
  } });
  const flux = (octets: Buffer) => lignesFichier('x', octets).map((l) => l.replace('{"fichier":{"nom":"x",', '{"film":{'));
  const signal = new AbortController().signal;

  it('envoie le modèle et le texte, rend le WAV reçu', async () => {
    let vue = '';
    const moteur = new MoteurVoixConteneur(lanceurQui((e) => { vue = e; return [...flux(wav), JSON.stringify({ ok: true, octets: wav.length })].join('\n'); }) as never, { fichier: 'm.onnx', sha256: SHA });
    expect((await moteur.dire({ nom: 'n', texte: 'Bonjour', delaiMs: 1000, signal })).equals(wav)).toBe(true);
    expect(JSON.parse(vue)).toEqual({ modele: { fichier: 'm.onnx', sha256: SHA }, texte: 'Bonjour' });
  });
  it('refuse un échec annoncé, un flux incomplet ou une taille qui ne correspond pas', async () => {
    const m = (s: string) => new MoteurVoixConteneur(lanceurQui(() => s) as never, { fichier: 'm.onnx', sha256: SHA });
    await expect(m('{"ok":false,"cause":"MODELE_EMPREINTE"}').dire({ nom: 'n', texte: 't', delaiMs: 1, signal })).rejects.toThrow('MODELE_EMPREINTE');
    await expect(m(`{"ok":true,"octets":${wav.length}}`).dire({ nom: 'n', texte: 't', delaiMs: 1, signal })).rejects.toThrow('FLUX_INCOMPLET');
    await expect(m([...flux(wav), `{"ok":true,"octets":${wav.length + 1}}`].join('\n')).dire({ nom: 'n', texte: 't', delaiMs: 1, signal })).rejects.toThrow('FLUX_INCOMPLET');
    await expect(m('n’importe quoi').dire({ nom: 'n', texte: 't', delaiMs: 1, signal })).rejects.toThrow('RESULTAT_ILLISIBLE');
  });
});

describe('tâche voix et actions', () => {
  let banc: BancDeTest;
  let marqueId: string;
  let utilisateurA: string;
  let espaceA: string;
  let jetonA: string;
  let jetonB: string;
  let app: Awaited<ReturnType<typeof construireServeur>>;
  const moteur = new FauxMoteurVoix();
  const aide = { signal: new AbortController().signal } as never;
  const tacheVoix = (montageId: string): Tache =>
    ({ id: randomUUID(), marqueId, utilisateurId: utilisateurA, type: 'voix', classe: 'lot', gpu: true, reprise: 'permise', delaiGardeS: 600, tentativesMax: 3, entree: { montageId }, etat: 'en_cours', tentatives: 1, reprises: 0, disponibleLe: new Date(), verrouPar: undefined, bailJusqua: undefined, pointDeNonRetour: false, resultat: undefined, cause: undefined, action: undefined, creeLe: new Date(), demarreeLe: undefined }) as unknown as Tache;
  const executant = () => creerExecutantVoix({ montages: banc.montages, stockage: banc.stockage, moteur, file: banc.file });
  const film = { octets: WEBM, sha256: createHash('sha256').update(WEBM).digest('hex') };
  const appeler = (jeton: string, chemin: string, corps: unknown = {}) =>
    app.inject({ method: 'POST', url: `/api/v1/${chemin}`, headers: { authorization: `Bearer ${jeton}`, 'content-type': 'application/json' }, payload: JSON.stringify(corps) });

  async function nouveauMontage(voix = true) {
    const r = await creerMontageDuJeu(
      { montages: banc.montages, stockage: banc.stockage, gabarits: banc.gabarits, file: banc.file, voix },
      { marqueId, utilisateurId: utilisateurA },
      { id: randomUUID(), espaceId: espaceA, nom: 'Parcours recette' },
      film,
      WEBM.length,
      journal,
      6000,
    );
    if (!('montageId' in r)) throw new Error(`montage refusé : ${r.refus}`);
    return r;
  }
  const tachesDeType = (type: string) => banc.file.taches.filter((t) => t.type === type);

  beforeAll(async () => {
    if (!existsSync(fileURLToPath(new URL('../dist/server/entry.mjs', import.meta.url)))) throw new Error('coeur/dist absent : lance `npm run build` avant les tests.');
    banc = creerServicesDeTest(undefined, { urlPublique: 'http://127.0.0.1:4321', voixLocale: true });
    marqueId = await banc.marques.creer();
    const a = await banc.espaces.assurer(marqueId, 'sub-a', undefined, 'Établia');
    utilisateurA = a.utilisateurId;
    espaceA = a.espaces[0]!.id;
    const b = await banc.espaces.assurer(marqueId, 'sub-b', undefined, 'Autre');
    const jeton = async (sub: string, utilisateurId: string, espaceIds: string[]) => (await banc.jetons.creer({ marqueId, utilisateurId, sub, nom: 't', portees: ['lecture', 'ecriture'], espaceIds, dureeJours: 30 })).clair;
    jetonA = await jeton('sub-a', utilisateurA, [espaceA]);
    jetonB = await jeton('sub-b', b.utilisateurId, [b.espaces[0]!.id]);
    app = await construireServeur({ services: banc.services });
  });
  afterAll(async () => app?.close());

  it('avec une voix branchée, la fin du jeu met la voix en file (le rendu vient après), sinon le rendu direct', async () => {
    const avantVoix = tachesDeType('voix').length;
    const m = await nouveauMontage(true);
    expect(tachesDeType('voix')).toHaveLength(avantVoix + 1);
    expect(banc.montages.rendus.some((r) => r.montageId === m.montageId)).toBe(false);
    const avantRendu = tachesDeType('rendu').length;
    await nouveauMontage(false);
    expect(tachesDeType('rendu')).toHaveLength(avantRendu + 1);
  });

  it('dit chaque scène qui a un texte, range des WAV contrôlés par scène, puis met le rendu allégé en file', async () => {
    const m = await nouveauMontage();
    const montage = banc.montages.montages.find((x) => x.id === m.montageId)!;
    const scenes = montage.timeline.scenes.filter((s) => s.voix.trim() !== '');
    expect(scenes.length).toBeGreaterThan(0);
    const rendusAvant = tachesDeType('rendu').length;
    await executant().executer(tacheVoix(m.montageId), aide);
    const voix = await banc.montages.listerVoix(marqueId, utilisateurA, m.montageId);
    expect(voix.map((v) => v.sceneId).sort()).toEqual(scenes.map((s) => s.id).sort());
    for (const v of voix) {
      const scene = scenes.find((s) => s.id === v.sceneId)!;
      expect(v).toMatchObject({ genre: 'voix', mime: 'audio/wav', dureeMs: scene.voix.trim().length * MS_PAR_CARACTERE });
      expect(banc.stockage.fichiers.has(`${marqueId}/${v.id}`)).toBe(true);
    }
    expect(tachesDeType('rendu')).toHaveLength(rendusAvant + 1);
    expect(banc.montages.rendus.filter((r) => r.montageId === m.montageId)).toHaveLength(1);
  });
  it('rejouée après incident, elle ne redit pas les scènes déjà dites et ne double pas le rendu', async () => {
    const m = await nouveauMontage();
    await executant().executer(tacheVoix(m.montageId), aide);
    const dites = moteur.demandes.length;
    await executant().executer(tacheVoix(m.montageId), aide);
    expect(moteur.demandes).toHaveLength(dites);
    expect(banc.montages.rendus.filter((r) => r.montageId === m.montageId)).toHaveLength(1);
  });
  it('un échec du moteur donne une erreur relançable sans rendu ; un WAV invalide est refusé sans nouvel essai', async () => {
    const m = await nouveauMontage();
    moteur.echec = true;
    const e = await executant().executer(tacheVoix(m.montageId), aide).catch((x: unknown) => x);
    moteur.echec = false;
    expect(e).toBeInstanceOf(ErreurTache);
    expect(e).toMatchObject({ reessayer: true });
    expect(banc.montages.rendus.some((r) => r.montageId === m.montageId)).toBe(false);
    for (const faux of [Buffer.from('MP3 pas du WAV'), wavSilence(130_000)]) {
      moteur.sortie = faux;
      const e2 = await executant().executer(tacheVoix(m.montageId), aide).catch((x: unknown) => x);
      moteur.sortie = undefined;
      expect(e2).toMatchObject({ message: 'VOIX_INVALIDE', reessayer: false });
    }
    expect(await banc.montages.listerVoix(marqueId, utilisateurA, m.montageId)).toHaveLength(0);
  });
  it('un montage inconnu ou une entrée invalide est refusé', async () => {
    await expect(executant().executer(tacheVoix(randomUUID()), aide)).rejects.toBeInstanceOf(ErreurTache);
    await expect(executant().executer({ ...tacheVoix(randomUUID()), entree: { montageId: 'x' } }, aide)).rejects.toBeInstanceOf(ErreurTache);
  });

  it('le texte de voix est modifiable : nouvelle version, ancienne intacte, voix puis rendu en file', async () => {
    const m = await nouveauMontage();
    const ancien = banc.montages.montages.find((x) => x.id === m.montageId)!;
    const sceneId = ancien.timeline.scenes[0]!.id;
    const avant = tachesDeType('voix').length;
    const r = await appeler(jetonA, 'montage/definirvoix', { id: m.montageId, voix: [{ sceneId, texte: '  Voici la nouvelle phrase.  ' }] });
    expect(r.statusCode).toBe(200);
    const { montage, tacheId } = r.json().donnees as { montage: { id: string; numero: number; timeline: { scenes: { id: string; voix: string }[] } }; tacheId: string };
    expect(montage.numero).toBe(2);
    expect(montage.timeline.scenes.find((s) => s.id === sceneId)!.voix).toBe('Voici la nouvelle phrase.');
    expect(ancien.timeline.scenes[0]!.voix).not.toBe('Voici la nouvelle phrase.');
    expect(tachesDeType('voix')).toHaveLength(avant + 1);
    expect(tachesDeType('voix').at(-1)!.id).toBe(tacheId);
  });
  it('refuse une scène inconnue, un texte trop long, une version périmée et un autre espace', async () => {
    const m = await nouveauMontage();
    const sceneId = banc.montages.montages.find((x) => x.id === m.montageId)!.timeline.scenes[0]!.id;
    expect((await appeler(jetonA, 'montage/definirvoix', { id: m.montageId, voix: [{ sceneId: 'zz-9', texte: 'x' }] })).statusCode).toBe(404);
    expect((await appeler(jetonA, 'montage/definirvoix', { id: m.montageId, voix: [{ sceneId, texte: 'x'.repeat(501) }] })).statusCode).toBe(400);
    expect((await appeler(jetonB, 'montage/definirvoix', { id: m.montageId, voix: [{ sceneId, texte: 'x' }] })).statusCode).toBe(404);
    expect((await appeler(jetonA, 'montage/definirvoix', { id: m.montageId, voix: [{ sceneId, texte: 'un' }] })).statusCode).toBe(200);
    const perime = await appeler(jetonA, 'montage/definirvoix', { id: m.montageId, voix: [{ sceneId, texte: 'deux' }] });
    expect(perime.statusCode).toBe(409);
    expect(perime.json().erreur.code).toBe('MONTAGE_VERSION_PERIMEE');
  });
  it('sans voix locale branchée, la modification met directement le rendu en file', async () => {
    const sans = creerServicesDeTest(undefined, { urlPublique: 'http://127.0.0.1:4321' });
    const mq = await sans.marques.creer();
    const u = await sans.espaces.assurer(mq, 'sub-s', undefined, 'S');
    const jeton = (await sans.jetons.creer({ marqueId: mq, utilisateurId: u.utilisateurId, sub: 'sub-s', nom: 't', portees: ['lecture', 'ecriture'], espaceIds: [u.espaces[0]!.id], dureeJours: 30 })).clair;
    const r = await creerMontageDuJeu({ montages: sans.montages, stockage: sans.stockage, gabarits: sans.gabarits, file: sans.file }, { marqueId: mq, utilisateurId: u.utilisateurId }, { id: randomUUID(), espaceId: u.espaces[0]!.id, nom: 'S' }, film, WEBM.length, journal, 6000);
    if (!('montageId' in r)) throw new Error('refus');
    const sceneId = sans.montages.montages[0]!.timeline.scenes[0]!.id;
    const appSans = await construireServeur({ services: sans.services });
    const rep = await appSans.inject({ method: 'POST', url: '/api/v1/montage/definirvoix', headers: { authorization: `Bearer ${jeton}`, 'content-type': 'application/json' }, payload: JSON.stringify({ id: r.montageId, voix: [{ sceneId, texte: 'Salut' }] }) });
    await appSans.close();
    expect(rep.statusCode).toBe(200);
    expect(sans.file.taches.filter((t) => t.type === 'voix')).toHaveLength(0);
    expect(sans.file.taches.filter((t) => t.type === 'rendu')).toHaveLength(2);
  });

  it('les sous-titres suivent le texte de voix, en repères et en SRT', async () => {
    const m = await nouveauMontage();
    const sceneId = banc.montages.montages.find((x) => x.id === m.montageId)!.timeline.scenes[0]!.id;
    const r = await appeler(jetonA, 'montage/soustitres', { id: m.montageId });
    expect(r.statusCode).toBe(200);
    const { reperes, srt } = r.json().donnees as { reperes: { sceneId: string; texte: string }[]; srt: string };
    expect(reperes.length).toBeGreaterThan(0);
    expect(srt).toMatch(/^1\n\d\d:\d\d:\d\d,\d{3} --> \d\d:\d\d:\d\d,\d{3}\n/);
    expect(srt).toContain('Bienvenue sur la page.');
    const v2 = (await appeler(jetonA, 'montage/definirvoix', { id: m.montageId, voix: [{ sceneId, texte: 'Texte revu.' }] })).json().donnees.montage.id as string;
    const s2 = (await appeler(jetonA, 'montage/soustitres', { id: v2 })).json().donnees.srt as string;
    expect(s2).toContain('Texte revu.');
    expect(s2).not.toContain('Bienvenue sur la page.');
    expect((await appeler(jetonB, 'montage/soustitres', { id: m.montageId })).statusCode).toBe(404);
  });
});
