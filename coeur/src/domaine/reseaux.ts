// regie — les réseaux de publication (histoire 7.1), lus dans deploiement/reseaux.json : portées demandées et chemin de
// retour OAuth FIXE par réseau. Module pur ; l'adresse de retour ne se construit jamais à partir d'une entrée.

import { z } from 'zod';
import fichier from '../../../deploiement/reseaux.json' with { type: 'json' };
import { RESEAUX, type Reseau } from './bornes.ts';

const reseauDeclare = z
  .object({
    nom: z.string().min(1),
    service: z.literal('publication'),
    portees: z.array(z.string().regex(/^[a-z_]+$/)).min(1),
    cheminRetour: z.string().regex(/^\/reseaux\/[a-z]+\/retour$/),
  })
  .strict();

const schema = z
  .object({
    $commentaire: z.string().optional(),
    version: z.number().int().positive(),
    reseaux: z.partialRecord(z.enum(RESEAUX), reseauDeclare),
  })
  .strict();

export type ReseauDeclare = Readonly<z.infer<typeof reseauDeclare>>;

export function lireReseaux(brut: unknown): Readonly<Partial<Record<Reseau, ReseauDeclare>>> {
  return Object.freeze(schema.parse(brut).reseaux);
}

export const RESEAUX_DECLARES = lireReseaux(fichier);

/** Les réseaux ouverts à la publication en V1. */
export const RESEAUX_ACTIFS: readonly Reseau[] = Object.freeze(RESEAUX.filter((r) => RESEAUX_DECLARES[r] !== undefined));

export const estReseauActif = (valeur: unknown): valeur is Reseau => typeof valeur === 'string' && (RESEAUX_ACTIFS as readonly string[]).includes(valeur);

/** `redirect_uri` fixe d'un réseau : l'adresse publique de regie + le chemin déclaré. `undefined` sans adresse publique. */
export function redirectUri(urlPublique: string | undefined, reseau: Reseau): string | undefined {
  const d = RESEAUX_DECLARES[reseau];
  if (urlPublique === undefined || d === undefined) return undefined;
  return new URL(d.cheminRetour, urlPublique).toString();
}
