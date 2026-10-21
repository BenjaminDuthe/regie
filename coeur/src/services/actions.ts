// regie — les actions de la V1 (histoire 1.11, AD-1). Une action est écrite ici une seule fois ; l'interface,
// l'API (`/api/v1/<domaine>/<verbe>`) et le MCP (`<domaine>_<verbe>`) l'appellent à l'identique.
// Les histoires suivantes ajoutent leurs actions à ACTIONS ; ce qui n'est pas offert à l'API va dans
// exceptions-parite.ts, avec sa raison.

import { z } from 'zod';
import type { Notification } from '../infra/notifications.ts';
import type { ConnexionClaude } from '../infra/oauth.ts';
import { DUREE_MAX_JETON_JOURS, PORTEES, type JetonApi } from '../infra/jetons.ts';
import { ACTIONS_APPLICATION } from './actions-application.ts';
import { ACTIONS_COMPTE } from './actions-compte.ts';
import { ACTIONS_MONTAGE } from './actions-montage.ts';
import { ACTIONS_RESEAU } from './actions-reseau.ts';
import { ACTIONS_SCRIPT } from './actions-script.ts';
import { ACTIONS_GABARIT } from './actions-gabarit.ts';
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

/**
 * Relance une étape en échec (histoire 2.6, FR-33) : la tâche repart avec ses données, sans renvoi des rushes, et son
 * historique de tentatives continue. regie ne relance jamais seul : c'est le seul chemin (interface, API, MCP).
 */
export const tacheRelancer = definirAction({
  domaine: 'tache',
  verbe: 'relancer',
  description: 'Relance une de tes étapes en échec, sans renvoyer tes rushes. Seule une tâche échouée se relance.',
  portee: 'ecriture',
  entree: z.object({ id: identifiant }).strict(),
  executer: async (ctx, entree) => {
    const tache = await ctx.services.file.lire(ctx.marqueId, ctx.utilisateurId, entree.id);
    if (tache === undefined) throw new ErreurMetier('TACHE_INTROUVABLE', 404, { id: entree.id });
    if (tache.etat !== 'echouee' || !(await ctx.services.file.relancer(ctx.marqueId, ctx.utilisateurId, entree.id))) {
      throw new ErreurMetier('TACHE_NON_RELANCABLE', 409, { id: entree.id, etat: tache.etat });
    }
    const vue = await suivreUneTache(ctx.services, ctx.marqueId, ctx.utilisateurId, entree.id);
    return { tache: vue! };
  },
  objet: (entree) => `tache:${entree.id}`,
});

const notificationVisible = (n: Notification) => ({
  id: n.id,
  genre: n.genre,
  etape: n.etape ?? null,
  tacheId: n.tacheId ?? null,
  cause: n.cause ?? null,
  action: n.action ?? null,
  creeLe: n.creeLe.toISOString(),
  acquitteeLe: n.acquitteeLe?.toISOString() ?? null,
});

/** Nombre de notifications affichées : les dernières de la personne. */
export const LIMITE_NOTIFICATIONS = 50;

export const notificationLister = definirAction({
  domaine: 'notification',
  verbe: 'lister',
  description: 'Liste tes notifications (étape en échec, journal rompu), les plus récentes d’abord, acquittées ou non.',
  portee: 'lecture',
  entree: z.object({}).strict(),
  executer: async (ctx) => ({ notifications: (await ctx.services.notifications.lister(ctx.marqueId, ctx.utilisateurId, LIMITE_NOTIFICATIONS)).map(notificationVisible) }),
  objet: () => 'notification',
});

export const notificationAcquitter = definirAction({
  domaine: 'notification',
  verbe: 'acquitter',
  description: 'Marque une de tes notifications comme vue.',
  portee: 'ecriture',
  entree: z.object({ id: identifiant }).strict(),
  executer: async (ctx, entree) => {
    if (!(await ctx.services.notifications.acquitter(ctx.marqueId, ctx.utilisateurId, entree.id))) throw new ErreurMetier('NOTIFICATION_INTROUVABLE', 404, { id: entree.id });
    return { id: entree.id, acquittee: true as const };
  },
  objet: (entree) => `notification:${entree.id}`,
});

export const ACTIONS = Object.freeze([espaceLister, jetonLister, jetonRevoquer, jetonCreer, connexionLister, connexionRevoquer, tacheLister, tacheLire, tacheRelancer, notificationLister, notificationAcquitter, ...ACTIONS_GABARIT, ...ACTIONS_APPLICATION, ...ACTIONS_COMPTE, ...ACTIONS_SCRIPT, ...ACTIONS_MONTAGE, ...ACTIONS_RESEAU]);
export const REGISTRE = new Registre(ACTIONS);
