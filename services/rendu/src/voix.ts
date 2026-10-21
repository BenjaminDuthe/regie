// regie — exécutant de voix (histoire 4.7, FR-27, NFR-26) : synthèse vocale LOCALE avec Piper, dans le conteneur de rendu
// (sans réseau, sans volume en écriture). Une ligne JSON sur l'entrée standard donne le modèle de voix (fichier du
// volume `/modeles` monté en lecture seule, empreinte SHA-256 attendue) et le texte ; le WAV revient en lignes
// `{"film":...}` puis une ligne de résultat. Le modèle n'est utilisé que si son empreinte est celle de `modeles.lock` :
// aucun modèle non vérifié ne tourne (NFR-30). Piper est lancé avec un tableau d'arguments, jamais par un interpréteur.

import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { ErreurPaquet } from './paquet.ts';

const MORCEAU = 48 * 1024;
export const TEXTE_MAX = 2000;
export const MODELE_MAX_OCTETS = 200 * 1024 * 1024;
const FICHIER_MODELE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,100}\.onnx$/;

export type ReglagesVoix = Readonly<{ piper: string; modeles: string }>;
/** Dans l'image : Piper du système et volume des modèles. Les tests passent leurs propres chemins. */
export const REGLAGES_VOIX_IMAGE: ReglagesVoix = Object.freeze({ piper: 'piper', modeles: '/modeles' });

export type DemandeVoix = Readonly<{ modele: Readonly<{ fichier: string; sha256: string }>; texte: string }>;

/** Le nom du modèle ne peut pas sortir de `/modeles` ; le texte est borné et sans caractère de commande. */
export function validerDemandeVoix(brut: unknown): DemandeVoix {
  const d = brut as Record<string, unknown> | null;
  if (typeof d !== 'object' || d === null) throw new ErreurPaquet('DEMANDE_INVALIDE');
  const { modele, texte } = d;
  const m = modele as Record<string, unknown> | null;
  if (typeof m !== 'object' || m === null) throw new ErreurPaquet('DEMANDE_INVALIDE');
  const { fichier, sha256 } = m;
  if (typeof fichier !== 'string' || !FICHIER_MODELE.test(fichier)) throw new ErreurPaquet('MODELE_INVALIDE');
  if (typeof sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(sha256)) throw new ErreurPaquet('MODELE_INVALIDE');
  // eslint-disable-next-line no-control-regex
  if (typeof texte !== 'string' || texte.trim() === '' || texte.length > TEXTE_MAX || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(texte)) throw new ErreurPaquet('TEXTE_INVALIDE');
  return { modele: { fichier, sha256 }, texte };
}

function ecrire(ligne: string): void {
  process.stdout.write(`${ligne}\n`);
}

function lancerPiper(piper: string, dossier: string, modele: string, texte: string): Promise<number> {
  return new Promise((resoudre) => {
    const p = spawn(piper, ['--model', modele, '--output_file', join(dossier, 'voix.wav')], { cwd: dossier, stdio: ['pipe', 'ignore', 'ignore'], env: { PATH: '/usr/bin:/bin:/usr/local/bin' } });
    p.stdin.on('error', () => undefined);
    p.on('error', () => resoudre(-1));
    p.on('close', (code) => resoudre(code ?? -1));
    p.stdin.end(texte);
  });
}

export async function dire(lignes: AsyncIterable<string>, reglages: ReglagesVoix = REGLAGES_VOIX_IMAGE): Promise<void> {
  const dossier = await mkdtemp(join(tmpdir(), 'voix-'));
  try {
    let demande: DemandeVoix | undefined;
    for await (const ligne of lignes) {
      if (ligne.trim() === '') continue;
      if (demande !== undefined) throw new ErreurPaquet('DEMANDE_INVALIDE');
      demande = validerDemandeVoix(JSON.parse(ligne));
    }
    if (demande === undefined) throw new ErreurPaquet('DEMANDE_INVALIDE');
    const chemin = join(reglages.modeles, demande.modele.fichier);
    const octetsModele = await readFile(chemin).catch(() => undefined);
    if (octetsModele === undefined) throw new ErreurPaquet('MODELE_ABSENT');
    if (octetsModele.length > MODELE_MAX_OCTETS || createHash('sha256').update(octetsModele).digest('hex') !== demande.modele.sha256) throw new ErreurPaquet('MODELE_EMPREINTE');
    const code = await lancerPiper(reglages.piper, dossier, chemin, demande.texte);
    if (code !== 0) {
      ecrire(JSON.stringify({ ok: false, cause: 'PIPER_ECHEC' }));
      return;
    }
    const wav = await readFile(join(dossier, 'voix.wav'));
    const empreinte = createHash('sha256');
    for (let i = 0, n = 0; i < wav.length; i += MORCEAU, n += 1) {
      const m = wav.subarray(i, i + MORCEAU);
      empreinte.update(m);
      ecrire(JSON.stringify({ film: { n, d: m.toString('base64') } }));
    }
    ecrire(JSON.stringify({ film: { fin: true, octets: wav.length, sha256: empreinte.digest('hex') } }));
    ecrire(JSON.stringify({ ok: true, octets: wav.length }));
  } catch (erreur) {
    ecrire(JSON.stringify({ ok: false, cause: erreur instanceof ErreurPaquet ? erreur.message : 'VOIX_ECHEC' }));
  } finally {
    await rm(dossier, { recursive: true, force: true });
  }
}

export async function principal(): Promise<void> {
  await dire(createInterface({ input: process.stdin, crlfDelay: Infinity }));
}
