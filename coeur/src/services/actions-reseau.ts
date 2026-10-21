// regie — les actions des réseaux de publication (histoires 7.1 et 7.6, FR-39). La clé d'application d'un réseau va au
// coffre : le dépôt est réservé à l'interface (exception de parité, réauthentification récente exigée par la page) et
// aucune action ne rend jamais la clé, seulement son état. Le test de la clé et la lecture de l'état sont offerts à tous.

import { z } from 'zod';
import { RESEAUX_ACTIFS, RESEAUX_DECLARES, estReseauActif } from '../domaine/reseaux.ts';
import { RESEAUX, type Reseau } from '../domaine/bornes.ts';
import { estErreurReseau } from '../publication/connecteur.ts';
import { ErreurMetier } from './erreurs.ts';
import { definirAction, type ContexteAction } from './registre.ts';

const reseauActif = z.enum(RESEAUX).refine(estReseauActif, 'réseau pas encore ouvert');

/** Longueurs larges mais bornées : l'identifiant d'une application Meta est numérique, son secret hexadécimal. */
const idApplication = z.string().trim().regex(/^[A-Za-z0-9_.-]{3,100}$/);
const secretApplication = z.string().trim().regex(/^[\x21-\x7e]{8,200}$/);

export type VueReseau = Readonly<{ reseau: Reseau; nom: string; portees: string[]; cleDeposee: boolean; cleModifieeLe: string | null; connecteur: boolean }>;

export async function vueReseau(ctx: ContexteAction, reseau: Reseau): Promise<VueReseau> {
  const d = RESEAUX_DECLARES[reseau]!;
  const etat = await ctx.services.reseaux.etatCle(ctx.marqueId, reseau);
  return { reseau, nom: d.nom, portees: [...d.portees], cleDeposee: etat.deposee, cleModifieeLe: etat.modifieLe?.toISOString() ?? null, connecteur: ctx.services.connecteurs[reseau] !== undefined };
}

export const reseauEtat = definirAction({
  domaine: 'reseau',
  verbe: 'etat',
  description: 'Dit, pour chaque réseau de publication ouvert, si la clé de l’application est déposée et depuis quand. Ne rend jamais la clé.',
  portee: 'lecture',
  entree: z.strictObject({}),
  executer: async (ctx) => ({ reseaux: await Promise.all(RESEAUX_ACTIFS.map((r) => vueReseau(ctx, r))) }),
  objet: () => 'reseau',
});

export const reseauDeposer = definirAction({
  domaine: 'reseau',
  verbe: 'deposer',
  description: 'Dépose ou remplace la clé de l’application d’un réseau (identifiant et secret, chiffrés au coffre). Réservé à l’interface.',
  portee: 'ecriture',
  entree: z.strictObject({ reseau: reseauActif, idApplication, secret: secretApplication }),
  executer: async (ctx, entree) => {
    await ctx.services.reseaux.remplacerCle(ctx.marqueId, entree.reseau, { idApplication: entree.idApplication, secret: entree.secret });
    return { reseau: await vueReseau(ctx, entree.reseau) };
  },
  objet: (entree) => `reseau:${entree.reseau}`,
});

export const reseauTester = definirAction({
  domaine: 'reseau',
  verbe: 'tester',
  description: 'Teste auprès du réseau la clé d’application déposée. Rend `valide` et, si elle est refusée ou si le réseau ne répond pas, la cause. Ne rend jamais la clé.',
  portee: 'ecriture',
  entree: z.strictObject({ reseau: reseauActif }),
  executer: async (ctx, entree) => {
    const cle = await ctx.services.reseaux.lireCle(ctx.marqueId, entree.reseau);
    if (cle === undefined) throw new ErreurMetier('RESEAU_CLE_ABSENTE', 409, { reseau: RESEAUX_DECLARES[entree.reseau]!.nom });
    const connecteur = ctx.services.connecteurs[entree.reseau];
    if (connecteur === undefined) throw new ErreurMetier('RESEAU_CONNECTEUR_ABSENT', 409, { reseau: RESEAUX_DECLARES[entree.reseau]!.nom });
    try {
      await connecteur.tester(cle);
      return { reseau: entree.reseau, valide: true, cause: null as string | null };
    } catch (e) {
      if (!estErreurReseau(e)) throw e;
      return { reseau: entree.reseau, valide: false, cause: e.code };
    }
  },
  objet: (entree) => `reseau:${entree.reseau}`,
});

export const ACTIONS_RESEAU = [reseauEtat, reseauDeposer, reseauTester] as const;
