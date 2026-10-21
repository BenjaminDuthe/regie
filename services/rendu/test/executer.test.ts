// L'exécutant avec un faux ffmpeg (un script qui copie le film), puis, si REGIE_TEST_FFMPEG est donné, avec le vrai.
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, inject, it, vi } from 'vitest';
import { construirePlanRendu, depuisJournal, type EntreeJournalMontage, type ParametresTexte } from '@regie/contrats';
import { executer } from '../src/executer.ts';

/** Les lignes qui portent un fichier vers le conteneur (même format que le cœur, réécrit ici : ce paquet ne dépend pas du cœur). */
function lignesFichier(nom: string, octets: Uint8Array): string[] {
  const m = Buffer.from(octets);
  return [
    JSON.stringify({ fichier: { nom, n: 0, d: m.toString('base64') } }),
    JSON.stringify({ fichier: { nom, fin: true, octets: m.length, sha256: createHash('sha256').update(m).digest('hex') } }),
  ];
}

/** Reconstitue le fichier de la sortie et en contrôle taille et empreinte. */
function fichierDeSortie(sortie: string[]): Buffer {
  const morceaux: Buffer[] = [];
  let fin: { octets: number; sha256: string } | undefined;
  for (const l of sortie) {
    const j = JSON.parse(l) as { film?: { d?: string; fin?: true; octets?: number; sha256?: string } };
    if (j.film?.d !== undefined) morceaux.push(Buffer.from(j.film.d, 'base64'));
    else if (j.film?.fin === true) fin = { octets: j.film.octets!, sha256: j.film.sha256! };
  }
  const tout = Buffer.concat(morceaux);
  expect(fin).toEqual({ octets: tout.length, sha256: createHash('sha256').update(tout).digest('hex') });
  return tout;
}

declare module 'vitest' {
  interface ProvidedContext {
    ffmpegTest: string;
  }
}

const ffmpegReel = inject('ffmpegTest');

async function lancer(ffmpeg: string, lignes: string[]): Promise<string[]> {
  const sortie: string[] = [];
  const ecrit = vi.spyOn(process.stdout, 'write').mockImplementation((c: unknown) => (sortie.push(String(c)), true));
  try {
    await executer((async function* () { yield* lignes; })(), { ffmpeg, polices: '/inexistant' });
  } finally {
    ecrit.mockRestore();
  }
  return sortie.join('').split('\n').filter((l) => l !== '');
}

const dossier = mkdtempSync(join(tmpdir(), 'regie-faux-ffmpeg-'));
const faux = join(dossier, 'ffmpeg');
writeFileSync(faux, '#!/bin/sh\ncp film.webm sortie.mp4\n');
chmodSync(faux, 0o755);

const planBase = (args: string[]) => JSON.stringify({ graphe: 'x', ass: 'y', args, fichiersVoix: [], sansTexte: false });
const film = Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), Buffer.from('film')]);
const ARGS = ['-y', '-i', 'film.webm', 'sortie.mp4'];

describe('exécutant de rendu (faux ffmpeg)', () => {
  it('écrit les fichiers, lance ffmpeg et renvoie le fichier contrôlé', async () => {
    const sortie = await lancer(faux, [planBase(ARGS), ...lignesFichier('film.webm', film)]);
    expect(fichierDeSortie(sortie).equals(film)).toBe(true);
    expect(JSON.parse(sortie.at(-1)!)).toEqual({ ok: true, octets: film.length });
  });
  it('refuse un plan qui vise un autre fichier, sans lancer ffmpeg', async () => {
    const sortie = await lancer(faux, [planBase(['-y', '-i', '/etc/passwd', 'sortie.mp4'])]);
    expect(JSON.parse(sortie.at(-1)!)).toEqual({ ok: false, cause: 'PLAN_INCOHERENT' });
  });
  it('refuse un paquet sans film', async () => {
    const sortie = await lancer(faux, [planBase(ARGS)]);
    expect(JSON.parse(sortie.at(-1)!)).toEqual({ ok: false, cause: 'FICHIER_ABSENT' });
  });
  it('rapporte l’échec de ffmpeg', async () => {
    const echec = join(dossier, 'ffmpeg-echec');
    writeFileSync(echec, '#!/bin/sh\nexit 1\n');
    chmodSync(echec, 0o755);
    const sortie = await lancer(echec, [planBase(ARGS), ...lignesFichier('film.webm', film)]);
    expect(JSON.parse(sortie.at(-1)!)).toEqual({ ok: false, cause: 'FFMPEG_ECHEC' });
  });
});

const journal: EntreeJournalMontage[] = [
  { t: 0, genre: 'film_debut' },
  { t: 100, genre: 'narration', cible: 'Bienvenue.' },
  { t: 1500, genre: 'clic', x: 500, y: 300 },
  { t: 3000, genre: 'film_fin' },
];
const parametres: ParametresTexte = {
  couleurTexte: '#FFFFFF', couleurFond: '#111111', couleurPrincipale: '#1A73E8', couleurAccent: '#F4B400',
  policeTitres: 'Inter', policeSousTitres: 'Inter', tailleTitre: 72, tailleSousTitres: 60, capitalesSousTitres: false,
  zone: { x: 60, y: 200, largeur: 960, hauteur: 1400 },
};

describe.skipIf(ffmpegReel === '')('rendu avec le vrai ffmpeg', () => {
  it('produit un MP4 vertical allégé 540x960 de la durée de la timeline (sans le texte si le filtre ass manque)', async () => {
    const tmp = mkdtempSync(join(tmpdir(), 'regie-rendu-reel-'));
    const webm = join(tmp, 'film.webm');
    execFileSync(ffmpegReel, ['-y', '-f', 'lavfi', '-i', 'testsrc=size=360x640:rate=25', '-t', '3', '-c:v', 'libvpx', webm], { stdio: 'ignore' });
    const t = depuisJournal(journal, { filmDureeMs: 3000 });
    const plan = construirePlanRendu(t, parametres, { genre: 'allege', avecTexte: false });
    const sortie = await lancer(ffmpegReel, [JSON.stringify({ graphe: plan.graphe, ass: plan.ass, args: plan.args, fichiersVoix: plan.fichiersVoix, sansTexte: true }), ...lignesFichier('film.webm', readFileSync(webm))]);
    expect(JSON.parse(sortie.at(-1)!).ok).toBe(true);
    const mp4 = join(tmp, 'sortie.mp4');
    writeFileSync(mp4, fichierDeSortie(sortie));
    const sonde = execFileSync(ffmpegReel.replace(/ffmpeg$/, 'ffprobe'), ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height:format=duration', '-of', 'json', mp4]).toString();
    const j = JSON.parse(sonde) as { streams: { width: number; height: number }[]; format: { duration: string } };
    expect(j.streams[0]).toMatchObject({ width: 540, height: 960 });
    expect(Math.abs(Number(j.format.duration) * 1000 - t.scenes.reduce((a, s) => a + s.dureeMs, 0))).toBeLessThan(400);
  }, 60_000);
});
