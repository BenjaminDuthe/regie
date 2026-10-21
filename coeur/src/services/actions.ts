// regie — les actions de la V1 (histoire 1.11, AD-1). Une action est écrite ici une seule fois ; l'interface,
// l'API (`/api/v1/<domaine>/<verbe>`) et le MCP (`<domaine>_<verbe>`) l'appellent à l'identique.
// Les histoires suivantes ajoutent leurs actions à ACTIONS ; ce qui n'est pas offert à l'API va dans
// exceptions-parite.ts, avec sa raison.

import { z } from 'zod';
import type { ConnexionClaude } from '../infra/oauth.ts';
import { DUREE_MAX_JETON_JOURS, PORTEES, type JetonApi } from '../infra/jetons.ts';
import { ErreurMetier } from './erreurs.ts';
import { Registre, definirAction } from './registre.ts';
import { suivreTaches, suivreUneTache } from './suivi.ts';

const identifiant = z.uuid();

const jetonVisible = (j: JetonApi) => ({
  id: j.id,
  nom: j.nom,
  portees: [...j.portees],
  espaceIds: [...j.espaceIds],
  creeLe: j.creeLe.toISOString(),
  expireLe: j.expireLe.toISOString(),
  revoqueLe: j.revoqueLe?.toISOString() ?? null,
});

export const espaceLister = definirAction({
  domaine: 'espace',
  verbe: 'lister',
  description: 'Liste tes espaces : l’espace personnel et l’espace de la marque.',
  portee: 'lecture',
  entree: z.object({}).strict(),
  executer: async (ctx) => {
    const tous = await ctx.services.espaces.lister(ctx.marqueId, ctx.sub);
    // Un jeton ne voit que les espaces qu'on lui a donnés.
    const visibles = ctx.espaceIds === undefined ? tous : tous.filter((e) => ctx.espaceIds!.includes(e.id));
    return { espaces: visibles.map((e) => ({ id: e.id, genre: e.genre, nom: e.nom })) };
  },
});

export const jetonLister = definirAction({
  domaine: 'jeton',
  verbe: 'lister',
  description: 'Liste tes jetons d’API (jamais leur valeur).',
  portee: 'lecture',
  entree: z.object({}).strict(),
  executer: async (ctx) => ({ jetons: (await ctx.services.jetons.lister(ctx.marqueId, ctx.utilisateurId)).map(jetonVisible) }),
  objet: () => 'jeton',
});

export const jetonRevoquer = definirAction({
  domaine: 'jeton',
  verbe: 'revoquer',
  description: 'Révoque un de tes jetons d’API : il cesse de fonctionner tout de suite.',
  portee: 'ecriture',
  entree: z.object({ id: identifiant }).strict(),
  executer: async (ctx, entree) => {
    if (!(await ctx.services.jetons.revoquer(ctx.marqueId, ctx.utilisateurId, entree.id))) throw new ErreurMetier('JETON_INTROUVABLE', 404, { id: entree.id });
    return { id: entree.id, revoque: true as const };
  },
  objet: (entree) => `jeton:${entree.id}`,
});

export const jetonCreer = definirAction({
  domaine: 'jeton',
  verbe: 'creer',
  description: 'Crée un jeton d’API ; sa valeur n’est rendue qu’une fois. Réservé à l’interface, après une connexion récente.',
  portee: 'ecriture',
  entree: z
    .object({
      nom: z.string().trim().min(1).max(80),
      portees: z.array(z.enum(PORTEES)).min(1).max(2),
      espaceIds: z.array(identifiant).min(1).max(10),
      dureeJours: z.number().int().min(1).max(DUREE_MAX_JETON_JOURS),
    })
    .strict(),
  executer: async (ctx, entree) => {
    const miens = await ctx.services.espaces.lister(ctx.marqueId, ctx.sub);
    const inconnu = entree.espaceIds.find((id) => !miens.some((e) => e.id === id));
    if (inconnu !== undefined) throw new ErreurMetier('ESPACE_INTROUVABLE', 404, { id: inconnu });
    const { jeton, clair } = await ctx.services.jetons.creer({
      marqueId: ctx.marqueId,
      utilisateurId: ctx.utilisateurId,
      sub: ctx.sub,
      nom: entree.nom,
      portees: [...new Set(entree.portees)],
      espaceIds: [...new Set(entree.espaceIds)],
      dureeJours: entree.dureeJours,
    });
    return { jeton: jetonVisible(jeton), clair };
  },
  objet: (_entree, sortie) => `jeton:${sortie.jeton.id}`,
});

const connexionVisible = (c: ConnexionClaude) => ({
  id: c.id,
  client: c.clientNom,
  portees: [...c.portees],
  espaceIds: [...c.espaceIds],
  creeLe: c.creeLe.toISOString(),
  expireLe: c.expireLe.toISOString(),
  revoqueLe: c.revoqueLe?.toISOString() ?? null,
});

export const connexionLister = definirAction({
  domaine: 'connexion',
  verbe: 'lister',
  description: 'Liste les connexions de Claude à tes espaces (jamais leurs jetons).',
  portee: 'lecture',
  entree: z.object({}).strict(),
  executer: async (ctx) => ({ connexions: (await ctx.services.oauth.lister(ctx.marqueId, ctx.utilisateurId)).map(connexionVisible) }),
  objet: () => 'connexion',
});

export const connexionRevoquer = definirAction({
  domaine: 'connexion',
  verbe: 'revoquer',
  description: 'Révoque une connexion de Claude : son prochain appel est refusé.',
  portee: 'ecriture',
  entree: z.object({ id: identifiant }).strict(),
  executer: async (ctx, entree) => {
    if (!(await ctx.services.oauth.revoquer(ctx.marqueId, ctx.utilisateurId, entree.id))) throw new ErreurMetier('CONNEXION_INTROUVABLE', 404, { id: entree.id });
    return { id: entree.id, revoque: true as const };
  },
  objet: (entree) => `connexion:${entree.id}`,
});

export const tacheLister = definirAction({
  domaine: 'tache',
  verbe: 'lister',
  description: 'Liste tes dernières tâches : état, étape, position dans la file, heure de fin estimée, cause et action en cas d’échec.',
  portee: 'lecture',
  entree: z.object({}).strict(),
  executer: async (ctx) => ({ taches: await suivreTaches(ctx.services, ctx.marqueId, ctx.utilisateurId) }),
  objet: () => 'tache',
});

export const tacheLire = definirAction({
  domaine: 'tache',
  verbe: 'lire',
  description: 'Lit une de tes tâches avec l’historique de ses tentatives.',
  portee: 'lecture',
  entree: z.object({ id: identifiant }).strict(),
  executer: async (ctx, entree) => {
    const tache = await suivreUneTache(ctx.services, ctx.marqueId, ctx.utilisateurId, entree.id);
    if (tache === undefined) throw new ErreurMetier('TACHE_INTROUVABLE', 404, { id: entree.id });
    return { tache };
  },
  objet: (entree) => `tache:${entree.id}`,
});

export const ACTIONS = Object.freeze([espaceLister, jetonLister, jetonRevoquer, jetonCreer, connexionLister, connexionRevoquer, tacheLister, tacheLire]);
export const REGISTRE = new Registre(ACTIONS);
