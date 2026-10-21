// regie — les bornes des gardes (histoire 2.7, FR-28, NFR-27). Lues dans deploiement/bornes.json, le seul endroit
// où vivent les seuils ; ce module les valide et les rend. Module pur : aucune dépendance au navigateur ni à FFmpeg.

import { z } from 'zod';
import fichier from '../../../deploiement/bornes.json' with { type: 'json' };

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
    defauts: z.object({ hashtagsMax: z.number().int().positive(), legendeMaxCaracteres: z.number().int().positive() }).strict(),
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
  return Object.freeze(bornes);
}

export const BORNES: Bornes = lireBornes(fichier);
