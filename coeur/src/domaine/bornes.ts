// regie — les bornes des gardes (histoire 2.7, FR-28, NFR-27). Lues dans deploiement/bornes.json, le seul endroit
// où vivent les seuils ; ce module les valide et les rend. Module pur : aucune dépendance au navigateur ni à FFmpeg.

import { z } from 'zod';
import fichier from '../../../deploiement/bornes.json' with { type: 'json' };

/** Les réseaux pour lesquels on prépare une légende (histoire 3.7) ; leurs bornes vivent dans bornes.json. */
export const RESEAUX = ['instagram', 'facebook', 'tiktok'] as const;
export type Reseau = (typeof RESEAUX)[number];

const bornesLegende = z.object({ hashtagsMax: z.number().int().positive(), legendeMaxCaracteres: z.number().int().positive() }).strict();
export type BornesLegende = Readonly<z.infer<typeof bornesLegende>>;

/** Ce que le réseau accepte d'une vidéo : durée (secondes) et poids (octets) (histoire 7.6). */
const bornesVideo = z.object({ dureeMinS: z.number().positive(), dureeMaxS: z.number().positive(), tailleMaxOctets: z.number().int().positive() }).strict();
export type BornesVideo = Readonly<z.infer<typeof bornesVideo>>;

const rectangle = z.object({ x: z.number(), y: z.number(), largeur: z.number().positive(), hauteur: z.number().positive() }).strict();

export const schemaBornes = z
  .object({
    $commentaire: z.string().optional(),
    version: z.number().int().positive(),
    toile: z.object({ largeur: z.number().int().positive(), hauteur: z.number().int().positive() }).strict(),
    /** Rapport de contraste minimal (WCAG) entre un texte et son fond. */
    contrasteMin: z.number().min(1),
    /** Taille minimale du texte, en pixels sur `hauteurReferencePx` de haut. */
    texteMinPx: z.number().positive(),
    hauteurReferencePx: z.number().positive(),
    zoneSure: rectangle,
    defauts: bornesLegende,
    /** Bornes de la légende et des hashtags, réseau par réseau (histoire 3.7). */
    reseaux: z.object({ instagram: bornesLegende, facebook: bornesLegende, tiktok: bornesLegende }).strict(),
    /** Bornes de la vidéo, par réseau ouvert à la publication (histoire 7.6). */
    publication: z.object({ instagram: bornesVideo }).strict(),
  })
  .strict();

export type Bornes = Readonly<Omit<z.infer<typeof schemaBornes>, '$commentaire'>>;
export type Rectangle = Readonly<z.infer<typeof rectangle>>;

/** Valide un contenu de bornes ; la zone sûre doit tenir dans la toile. */
export function lireBornes(brut: unknown): Bornes {
  const { $commentaire: _commentaire, ...bornes } = schemaBornes.parse(brut);
  const z = bornes.zoneSure;
  if (z.x < 0 || z.y < 0 || z.x + z.largeur > bornes.toile.largeur || z.y + z.hauteur > bornes.toile.hauteur) {
    throw new Error('bornes : la zone sûre sort de la toile');
  }
  for (const [reseau, v] of Object.entries(bornes.publication)) {
    if (v.dureeMinS > v.dureeMaxS) throw new Error(`bornes : la durée minimale de ${reseau} dépasse sa durée maximale`);
  }
  return Object.freeze(bornes);
}

export const BORNES: Bornes = lireBornes(fichier);

/** Une borne dépassée : son nom (clé de `bornes.json`), ce que la vidéo vaut et la limite. */
export type BorneDepassee = Readonly<{ borne: 'dureeMinS' | 'dureeMaxS' | 'tailleMaxOctets'; valeur: number; limite: number }>;

/**
 * Les bornes du réseau que la vidéo dépasse, dans l'ordre : durée trop courte, durée trop longue, poids. Vide si elle
 * convient. La publication est refusée AVANT l'envoi à la première borne dépassée, en la nommant (histoire 7.6, FR-42).
 */
export function bornesVideoDepassees(reseau: keyof Bornes['publication'], video: Readonly<{ dureeS: number; tailleOctets: number }>, bornes: Bornes = BORNES): BorneDepassee[] {
  const b = bornes.publication[reseau];
  const depassees: BorneDepassee[] = [];
  if (video.dureeS < b.dureeMinS) depassees.push({ borne: 'dureeMinS', valeur: video.dureeS, limite: b.dureeMinS });
  if (video.dureeS > b.dureeMaxS) depassees.push({ borne: 'dureeMaxS', valeur: video.dureeS, limite: b.dureeMaxS });
  if (video.tailleOctets > b.tailleMaxOctets) depassees.push({ borne: 'tailleMaxOctets', valeur: video.tailleOctets, limite: b.tailleMaxOctets });
  return depassees;
}
