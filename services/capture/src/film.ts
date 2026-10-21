// regie — sortie du film du jeu d'un script (histoire 4.6). Le conteneur n'a ni volume ni disque partagé : le film
// repart sur la sortie standard, par morceaux, en lignes `{"film":{"n":0,"d":"<base64>"}}`, puis une ligne de fin qui
// donne la taille et l'empreinte SHA-256. Le cœur reconstitue le fichier et contrôle tout (taille, empreinte, format).

import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';

export const FILM_MORCEAU_OCTETS = 48 * 1024;
/** Au-delà, le film n'est pas diffusé : le cœur le refuserait de toute façon. */
export const FILM_MAX_OCTETS = 150 * 1024 * 1024;

export type LireFilm = (chemin: string, morceau: number) => AsyncIterable<Buffer | string>;
const lectureReelle: LireFilm = (chemin, morceau) => createReadStream(chemin, { highWaterMark: morceau });

/** Écrit le film ligne par ligne ; rend le nombre d'octets diffusés, ou `undefined` si le film dépasse la limite. */
export async function diffuserFilm(chemin: string, ecrire: (ligne: string) => void, lire: LireFilm = lectureReelle): Promise<number | undefined> {
  const empreinte = createHash('sha256');
  let total = 0;
  let n = 0;
  for await (const brut of lire(chemin, FILM_MORCEAU_OCTETS)) {
    const m = typeof brut === 'string' ? Buffer.from(brut) : brut;
    total += m.length;
    if (total > FILM_MAX_OCTETS) return undefined;
    empreinte.update(m);
    ecrire(JSON.stringify({ film: { n, d: m.toString('base64') } }));
    n += 1;
  }
  ecrire(JSON.stringify({ film: { fin: true, octets: total, sha256: empreinte.digest('hex') } }));
  return total;
}
