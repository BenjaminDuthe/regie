// regie — les actions du compte de démonstration (histoire 4.3, FR-14, AD-9). Le dépôt est réservé à l'interface
// (exception de parité, réauthentification récente exigée par la page) : aucun outil MCP ni point d'API ne peut déposer,
// remplacer ni LIRE l'identifiant ou le mot de passe. L'état et le test de connexion, eux, sont offerts à tous.
// Aucune de ces actions ne rend, ne journalise ni ne laisse dans une erreur une valeur du compte.

import { z } from 'zod';
import { ErreurMetier } from './erreurs.ts';
import { applicationAccessible } from './actions-application.ts';
import { definirAction } from './registre.ts';

const identifiant = z.uuid();

export const compteDeposer = definirAction({
  domaine: 'compte',
  verbe: 'deposer',
  description: 'Dépose ou remplace le compte de démonstration d’une application (identifiant et mot de passe, chiffrés au coffre). Réservé à l’interface.',
  portee: 'ecriture',
  entree: z.strictObject({
    applicationId: identifiant,
    identifiant: z.string().trim().min(1).max(200),
    // Pas de trim : un mot de passe peut commencer ou finir par une espace.
    motDePasse: z.string().min(1).max(500),
  }),
  executer: async (ctx, entree) => {
    await applicationAccessible(ctx, entree.applicationId);
    await ctx.services.comptesDemo.remplacer(ctx.marqueId, entree.applicationId, { identifiant: entree.identifiant, motDePasse: entree.motDePasse });
    const etat = await ctx.services.comptesDemo.etat(ctx.marqueId, entree.applicationId);
    return { applicationId: entree.applicationId, depose: etat.depose, modifieLe: etat.modifieLe?.toISOString() ?? null };
  },
  objet: (entree) => `application:${entree.applicationId}`,
});

export const compteEtat = definirAction({
  domaine: 'compte',
  verbe: 'etat',
  description: 'Dit si un compte de démonstration est déposé pour une application, et depuis quand. Ne rend jamais l’identifiant ni le mot de passe.',
  portee: 'lecture',
  entree: z.strictObject({ applicationId: identifiant }),
  executer: async (ctx, entree) => {
    await applicationAccessible(ctx, entree.applicationId);
    const etat = await ctx.services.comptesDemo.etat(ctx.marqueId, entree.applicationId);
    return { applicationId: entree.applicationId, depose: etat.depose, modifieLe: etat.modifieLe?.toISOString() ?? null };
  },
  objet: (entree) => `application:${entree.applicationId}`,
});

export const compteTester = definirAction({
  domaine: 'compte',
  verbe: 'tester',
  description: 'Lance un test de connexion de l’application avec son compte de démonstration, dans la capture isolée. Rend la tâche à suivre ; le résultat est une mini capture de l’accueil connecté, ou l’étape qui a échoué.',
  portee: 'ecriture',
  entree: z.strictObject({ applicationId: identifiant }),
  executer: async (ctx, entree) => {
    await applicationAccessible(ctx, entree.applicationId);
    const etat = await ctx.services.comptesDemo.etat(ctx.marqueId, entree.applicationId);
    if (!etat.depose) throw new ErreurMetier('COMPTE_ABSENT', 409, { applicationId: entree.applicationId });
    const tache = await ctx.services.file.enfiler(ctx.marqueId, ctx.utilisateurId, 'test_connexion', { applicationId: entree.applicationId });
    return { tacheId: tache.id };
  },
  objet: (entree) => `application:${entree.applicationId}`,
});

export const ACTIONS_COMPTE = [compteDeposer, compteEtat, compteTester] as const;
