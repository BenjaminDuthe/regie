// regie — fichiers qui voyagent par les entrées et sorties standard des conteneurs (histoires 4.6, 4.7). Les
// conteneurs n'ont ni volume ni disque partagé : un fichier passe en lignes JSON de morceaux base64
// (`{"film":{"n":0,"d":"..."}}`), puis une ligne de fin avec la taille et l'empreinte SHA-256. Le cœur reconstitue le
// fichier et contrôle tout : ordre, taille maximale, taille et empreinte annoncées, format (octets magiques).

import { createHash } from 'node:crypto';
import { z } from 'zod';
import { PREFIXE_FILM } from './capture.ts';

export const FILM_MAX_OCTETS = 150 * 1024 * 1024;
export const RENDU_MAX_OCTETS = 300 * 1024 * 1024;
export const VOIX_MAX_OCTETS = 40 * 1024 * 1024;
const MORCEAU_OCTETS = 48 * 1024;

const ligneFlux = z.strictObject({
  film: z.union([
    z.strictObject({ n: z.number().int().min(0).max(100_000), d: z.string().regex(/^[A-Za-z0-9+/]*={0,2}$/).max(100_000) }),
    z.strictObject({ fin: z.literal(true), octets: z.number().int().min(0), sha256: z.string().regex(/^[0-9a-f]{64}$/) }),
  ]),
});

export type FichierRecu = Readonly<{ octets: Buffer; sha256: string }>;

/** Reconstitue un fichier à partir de lignes de sortie. Une erreur est retenue (`erreur`), jamais levée : l'écouteur ne casse pas la capture. */
export class Reassembleur {
  readonly #max: number;
  readonly #morceaux: Buffer[] = [];
  readonly #empreinte = createHash('sha256');
  #total = 0;
  #suivant = 0;
  #fichier: FichierRecu | undefined;
  #erreur: string | undefined;

  constructor(max: number) {
    this.#max = max;
  }

  get erreur(): string | undefined {
    return this.#erreur;
  }

  /** Le fichier complet et contrôlé, ou `undefined` (rien reçu, fin absente ou erreur). */
  get fichier(): FichierRecu | undefined {
    return this.#erreur === undefined ? this.#fichier : undefined;
  }

  /** `true` si la ligne portait un morceau du fichier (même invalide) : l'appelant ne l'interprète pas autrement. */
  ajouter(ligne: string): boolean {
    if (!ligne.startsWith(PREFIXE_FILM)) return false;
    if (this.#erreur !== undefined || this.#fichier !== undefined) return true;
    let brute: unknown;
    try {
      brute = JSON.parse(ligne);
    } catch {
      this.#erreur = 'FLUX_ILLISIBLE';
      return true;
    }
    const lue = ligneFlux.safeParse(brute);
    if (!lue.success) {
      this.#erreur = 'FLUX_ILLISIBLE';
      return true;
    }
    const m = lue.data.film;
    if ('fin' in m) {
      const sha256 = this.#empreinte.digest('hex');
      if (m.octets !== this.#total || m.sha256 !== sha256) this.#erreur = 'FLUX_INCOHERENT';
      else this.#fichier = { octets: Buffer.concat(this.#morceaux), sha256 };
      return true;
    }
    if (m.n !== this.#suivant) {
      this.#erreur = 'FLUX_DESORDONNE';
      return true;
    }
    const morceau = Buffer.from(m.d, 'base64');
    this.#total += morceau.length;
    if (this.#total > this.#max) {
      this.#erreur = 'FICHIER_TROP_GROS';
      this.#morceaux.length = 0;
      return true;
    }
    this.#suivant += 1;
    this.#empreinte.update(morceau);
    this.#morceaux.push(morceau);
    return true;
  }
}

/** Les lignes qui portent un fichier vers un conteneur : `{"fichier":{"nom":...}}` (entrée du conteneur de rendu). */
export function lignesFichier(nom: string, octets: Uint8Array): string[] {
  const lignes: string[] = [];
  const empreinte = createHash('sha256');
  let n = 0;
  for (let i = 0; i < octets.length; i += MORCEAU_OCTETS) {
    const m = Buffer.from(octets.subarray(i, i + MORCEAU_OCTETS));
    empreinte.update(m);
    lignes.push(JSON.stringify({ fichier: { nom, n, d: m.toString('base64') } }));
    n += 1;
  }
  lignes.push(JSON.stringify({ fichier: { nom, fin: true, octets: octets.length, sha256: empreinte.digest('hex') } }));
  return lignes;
}

/** Octets magiques : WebM/Matroska (EBML) et MP4 (`ftyp` au 5e octet). */
export const estWebm = (b: Uint8Array): boolean => b.length > 4 && b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3;
export const estMp4 = (b: Uint8Array): boolean => b.length > 12 && b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70;
export const estWav = (b: Uint8Array): boolean => b.length > 12 && Buffer.from(b.subarray(0, 4)).toString('latin1') === 'RIFF' && Buffer.from(b.subarray(8, 12)).toString('latin1') === 'WAVE';
