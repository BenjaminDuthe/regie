// regie — exécutant de rendu (histoire 4.6) : lit le paquet sur l'entrée standard, écrit les fichiers dans un dossier
// temporaire, lance FFmpeg (tableau d'arguments, jamais d'interpréteur de commandes) et renvoie le MP4 en lignes
// `{"film":...}` puis une ligne de résultat. Aucun réseau, aucune variable d'environnement utile.

import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ErreurPaquet, Reception, validerPlan, type Plan } from './paquet.ts';

const MORCEAU = 48 * 1024;
export type Reglages = Readonly<{ ffmpeg: string; polices: string }>;
/** Dans l'image de rendu : ffmpeg du système et polices installées. Les tests passent leurs propres chemins. */
export const REGLAGES_IMAGE: Reglages = Object.freeze({ ffmpeg: 'ffmpeg', polices: '/opt/polices' });

function ecrire(ligne: string): void {
  process.stdout.write(`${ligne}\n`);
}

function lancerFfmpeg(ffmpeg: string, dossier: string, plan: Plan): Promise<number> {
  return new Promise((resoudre) => {
    const p = spawn(ffmpeg, [...plan.args], { cwd: dossier, stdio: ['ignore', 'ignore', 'ignore'], env: { PATH: '/usr/bin:/bin:/usr/local/bin' } });
    p.on('error', () => resoudre(-1));
    p.on('close', (code) => resoudre(code ?? -1));
  });
}

export async function executer(lignes: AsyncIterable<string>, reglages: Reglages = REGLAGES_IMAGE): Promise<void> {
  const dossier = await mkdtemp(join(tmpdir(), 'rendu-'));
  try {
    let plan: Plan | undefined;
    const reception = new Reception();
    for await (const ligne of lignes) {
      if (ligne.trim() === '') continue;
      if (plan === undefined) plan = validerPlan(JSON.parse(ligne));
      else reception.ajouter(ligne);
    }
    if (plan === undefined || reception.enCours) throw new ErreurPaquet('PAQUET_INCOMPLET');
    const attendus = ['film.webm', ...plan.fichiersVoix];
    for (const nom of attendus) if (!reception.fichiers.has(nom)) throw new ErreurPaquet('FICHIER_ABSENT');
    for (const [nom, octets] of reception.fichiers) {
      if (!attendus.includes(nom)) throw new ErreurPaquet('FICHIER_INATTENDU');
      await writeFile(join(dossier, nom), octets);
    }
    await writeFile(join(dossier, 'graphe.txt'), plan.graphe);
    await writeFile(join(dossier, 'sous-titres.ass'), plan.ass);
    await cp(reglages.polices, join(dossier, 'polices'), { recursive: true }).catch(() => undefined);
    const code = await lancerFfmpeg(reglages.ffmpeg, dossier, plan);
    if (code !== 0) {
      ecrire(JSON.stringify({ ok: false, cause: 'FFMPEG_ECHEC' }));
      return;
    }
    const mp4 = await readFile(join(dossier, 'sortie.mp4'));
    const empreinte = createHash('sha256');
    for (let i = 0, n = 0; i < mp4.length; i += MORCEAU, n += 1) {
      const m = mp4.subarray(i, i + MORCEAU);
      empreinte.update(m);
      ecrire(JSON.stringify({ film: { n, d: m.toString('base64') } }));
    }
    ecrire(JSON.stringify({ film: { fin: true, octets: mp4.length, sha256: empreinte.digest('hex') } }));
    ecrire(JSON.stringify({ ok: true, octets: mp4.length }));
  } catch (erreur) {
    ecrire(JSON.stringify({ ok: false, cause: erreur instanceof ErreurPaquet ? erreur.message : 'RENDU_ECHEC' }));
  } finally {
    await rm(dossier, { recursive: true, force: true });
  }
}

if (import.meta.main) {
  await executer(createInterface({ input: process.stdin, crlfDelay: Infinity }));
}
