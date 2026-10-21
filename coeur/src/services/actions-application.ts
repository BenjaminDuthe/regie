// regie — les actions de l'application à filmer (histoire 4.1, FR-13, FR-17). Une seule écriture pour l'interface, l'API
// (`/api/v1/application/<verbe>`) et le MCP (`application_<verbe>`). Aucune preuve de contrôle du domaine en V1.

import { z } from 'zod';
import { validerDeclaration } from '../domaine/application.ts';
import { NomApplicationPris, type Application, type ChampsApplication } from '../infra/applications.ts';
import { ErreurMetier } from './erreurs.ts';
import { definirAction, type ContexteAction } from './registre.ts';

const identifiant = z.uuid();
const nom = z.string().trim().min(1).max(80);
const accueil = z.string().trim().min(9).max(2000);
const hotes = z.array(z.string().trim().max(300)).max(40);

export const applicationVisible = (a: Application) => ({ id: a.id, espaceId: a.espaceId, nom: a.nom, accueil: a.accueil, hotes: [...a.hotes], version: a.version, modifieLe: a.modifieLe.toISOString() });

export async function applicationAccessible(ctx: ContexteAction, id: string): Promise<Application> {
  const a = await ctx.services.applications.lire(ctx.marqueId, ctx.utilisateurId, id);
  // Un jeton ne voit que les espaces qu'on lui a donnés : pour lui, une autre application n'existe pas.
  if (a === undefined || (ctx.espaceIds !== undefined && !ctx.espaceIds.includes(a.espaceId))) throw new ErreurMetier('APPLICATION_INTROUVABLE', 404, { id });
  return a;
}

const champs = (e: { nom: string; accueil: string; hotes: string[] }): ChampsApplication => ({ nom: e.nom, ...validerDeclaration(e.accueil, e.hotes) });

export const applicationLister = definirAction({
  domaine: 'application',
  verbe: 'lister',
  description: 'Liste les applications que Claude peut filmer dans tes espaces, avec leur adresse d’accueil et la liste stricte de leurs hôtes autorisés.',
  portee: 'lecture',
  entree: z.object({ espaceId: identifiant.optional() }).strict(),
  executer: async (ctx, entree) => {
    if (entree.espaceId !== undefined && ctx.espaceIds !== undefined && !ctx.espaceIds.includes(entree.espaceId)) throw new ErreurMetier('ESPACE_INTROUVABLE', 404, { id: entree.espaceId });
    const toutes = await ctx.services.applications.lister(ctx.marqueId, ctx.utilisateurId, entree.espaceId);
    return { applications: toutes.filter((a) => ctx.espaceIds === undefined || ctx.espaceIds.includes(a.espaceId)).map(applicationVisible) };
  },
  objet: () => 'application',
});

export const applicationDeclarer = definirAction({
  domaine: 'application',
  verbe: 'declarer',
  description: 'Déclare une application à filmer : son nom, son adresse d’accueil (https) et la liste stricte des hôtes qu’elle peut joindre. Aucun joker, aucune adresse IP ; l’hôte d’accueil est ajouté s’il manque.',
  portee: 'ecriture',
  entree: z.object({ espaceId: identifiant, nom, accueil, hotes }).strict(),
  executer: async (ctx, entree) => {
    if (ctx.espaceIds !== undefined && !ctx.espaceIds.includes(entree.espaceId)) throw new ErreurMetier('ESPACE_INTROUVABLE', 404, { id: entree.espaceId });
    const c = champs(entree);
    let a: Application | undefined;
    try {
      a = await ctx.services.applications.creer({ marqueId: ctx.marqueId, utilisateurId: ctx.utilisateurId, espaceId: entree.espaceId, ...c });
    } catch (e) {
      if (e instanceof NomApplicationPris) throw new ErreurMetier('APPLICATION_NOM_PRIS', 409, { nom: entree.nom });
      throw e;
    }
    if (a === undefined) throw new ErreurMetier('ESPACE_INTROUVABLE', 404, { id: entree.espaceId });
    return { application: applicationVisible(a) };
  },
  objet: (_entree, sortie) => `application:${sortie.application.id}`,
});

export const applicationModifier = definirAction({
  domaine: 'application',
  verbe: 'modifier',
  description: 'Remplace le nom, l’adresse d’accueil et la liste d’hôtes autorisés d’une application. Les scripts existants qui visent un hôte retiré seront refusés au prochain essai.',
  portee: 'ecriture',
  entree: z.object({ id: identifiant, nom, accueil, hotes }).strict(),
  executer: async (ctx, entree) => {
    await applicationAccessible(ctx, entree.id);
    const c = champs(entree);
    let a: Application | undefined;
    try {
      a = await ctx.services.applications.remplacer(ctx.marqueId, ctx.utilisateurId, entree.id, c);
    } catch (e) {
      if (e instanceof NomApplicationPris) throw new ErreurMetier('APPLICATION_NOM_PRIS', 409, { nom: entree.nom });
      throw e;
    }
    if (a === undefined) throw new ErreurMetier('APPLICATION_INTROUVABLE', 404, { id: entree.id });
    return { application: applicationVisible(a) };
  },
  objet: (entree) => `application:${entree.id}`,
});

export const ACTIONS_APPLICATION = [applicationLister, applicationDeclarer, applicationModifier] as const;
