// regie — les actions de publication sur les réseaux (histoires 7.3 à 7.5, FR-42 à FR-44). Une seule écriture pour
// l'interface, l'API (`/api/v1/publication/<verbe>`) et le MCP. Publier fige le montage, le rendu et la légende : la
// publication qui part est celle qui a été demandée, même si la vidéo change ensuite. Aucune vue ne rend le jeton du
// compte ni la clé d'idempotence.

import { z } from 'zod';
import { RESEAUX_DECLARES } from '../domaine/reseaux.ts';
import { ETATS_PUBLICATION } from '../domaine/publication.ts';
import { RESEAUX } from '../domaine/bornes.ts';
import { legendeProposee, verifierLegende } from '../domaine/legende.ts';
import type { Publication, TentativePublication } from '../infra/publications.ts';
import { controlerAvantEnvoi } from '../publication/controles.ts';
import { ErreurMetier } from './erreurs.ts';
import { montageAccessible } from './actions-montage.ts';
import { definirAction, type ContexteAction } from './registre.ts';

const identifiant = z.uuid();

export const vuePublication = (p: Publication) => ({
  id: p.id,
  espaceId: p.espaceId,
  compteId: p.compteId,
  reseau: p.reseau,
  serieId: p.serieId,
  montageId: p.montageId,
  renduId: p.renduId,
  legende: p.legende,
  hashtags: [...p.hashtags],
  etat: p.etat,
  tacheId: p.tacheId,
  programmeePour: p.programmeePour?.toISOString() ?? null,
  idExterne: p.idExterne,
  lien: p.lien,
  cause: p.cause,
  action: p.action,
  tentatives: p.tentatives,
  creeLe: p.creeLe.toISOString(),
  publieeLe: p.publieeLe?.toISOString() ?? null,
});

export const vueTentative = (t: TentativePublication) => ({
  numero: t.numero,
  origine: t.origine,
  pat: t.pat,
  debut: t.debut.toISOString(),
  fin: t.fin?.toISOString() ?? null,
  issue: t.issue,
  cause: t.cause,
});

export async function publicationAccessible(ctx: ContexteAction, id: string): Promise<Publication> {
  const p = await ctx.services.publications.lire(ctx.marqueId, ctx.utilisateurId, id);
  if (p === undefined || (ctx.espaceIds !== undefined && !ctx.espaceIds.includes(p.espaceId))) throw new ErreurMetier('PUBLICATION_INTROUVABLE', 404, { id });
  return p;
}

/** Met la tâche d'envoi en file et la lie à la publication. Rien ne part avant que la tâche soit prise par l'exécutant. */
export async function mettreEnFile(ctx: ContexteAction, p: Publication): Promise<Publication> {
  const tache = await ctx.services.file.enfiler(ctx.marqueId, ctx.utilisateurId, 'reseau', {
    publicationId: p.id,
    origine: ctx.origine,
    pat: ctx.pat ?? null,
    sub: ctx.sub,
  });
  await ctx.services.publications.lierTache(ctx.marqueId, ctx.utilisateurId, p.id, tache.id);
  return { ...p, tacheId: tache.id };
}

/** Le rendu complet prêt d'un montage : celui que la publication fige. */
export async function renduAPublier(ctx: ContexteAction, montageId: string) {
  const rendus = (await ctx.services.montages.listerRendus(ctx.marqueId, ctx.utilisateurId, montageId)).filter((r) => r.genre === 'complet');
  const pret = rendus.find((r) => r.etat === 'pret' && r.fichierId !== null);
  if (pret === undefined) throw new ErreurMetier('PUBLICATION_RENDU_ABSENT', 409, { etat: rendus[0]?.etat ?? 'absent' });
  return pret;
}

export const publicationPublier = definirAction({
  domaine: 'publication',
  verbe: 'publier',
  description:
    'Publie maintenant une vidéo sur un compte de réseau relié (Instagram). Contrôle avant tout envoi : compte connecté, rendu complet prêt, bornes du réseau (PUBLICATION_BORNE, en nommant la borne) et quota (PUBLICATION_QUOTA). La publication fige le montage, le rendu et la légende enregistrée de la vidéo pour ce réseau (à défaut, la légende proposée). Une seule publication par compte et par vidéo (PUBLICATION_EXISTANTE). Rend la publication `en_file` : suis-la avec `publication.lire`. Un envoi n’est jamais fait deux fois ; après une coupure, l’état est `incertaine` et regie ne renvoie pas.',
  portee: 'ecriture',
  entree: z.strictObject({ montageId: identifiant, compteId: identifiant }),
  executer: async (ctx, entree) => {
    const m = await montageAccessible(ctx, entree.montageId);
    const compte = await ctx.services.comptesReseau.lire(ctx.marqueId, ctx.utilisateurId, entree.compteId);
    if (compte === undefined || (ctx.espaceIds !== undefined && !ctx.espaceIds.includes(compte.espaceId)) || compte.espaceId !== m.espaceId) throw new ErreurMetier('COMPTE_RESEAU_INTROUVABLE', 404);
    const rendu = await renduAPublier(ctx, m.id);
    const controle = await controlerAvantEnvoi(ctx.services, ctx.marqueId, ctx.utilisateurId, { compteId: compte.id, renduId: rendu.id, reseau: compte.reseau });
    if (!controle.ok) throw new ErreurMetier(controle.code, controle.code === 'PUBLICATION_BORNE' ? 422 : 409, controle.contexte);
    const lue = await ctx.services.montages.lireLegende(ctx.marqueId, ctx.utilisateurId, m.serieId, compte.reseau);
    const brute = lue === undefined ? legendeProposee(m.timeline, compte.reseau) : { legende: lue.legende, hashtags: lue.hashtags };
    const v = verifierLegende(compte.reseau, brute.legende, brute.hashtags);
    if (!v.ok) throw new ErreurMetier(v.refus.code, 422, v.refus.contexte);
    const creation = await ctx.services.publications.creer({
      marqueId: ctx.marqueId, utilisateurId: ctx.utilisateurId, espaceId: m.espaceId, compteId: compte.id, reseau: compte.reseau,
      serieId: m.serieId, montageId: m.id, renduId: rendu.id, legende: v.valeur.legende, hashtags: v.valeur.hashtags, etat: 'en_file',
    });
    if (creation.etat === 'existe') throw new ErreurMetier('PUBLICATION_EXISTANTE', 409, { id: creation.id });
    if (creation.etat === 'introuvable') throw new ErreurMetier('MONTAGE_INTROUVABLE', 404, { id: entree.montageId });
    return { publication: vuePublication(await mettreEnFile(ctx, creation.publication)) };
  },
  objet: (entree) => `montage:${entree.montageId}`,
});

export const publicationLire = definirAction({
  domaine: 'publication',
  verbe: 'lire',
  description:
    'Lit une publication : son état (`en_file`, `programmee`, `en_attente_confirmation`, `envoi_en_cours`, `publiee`, `en_echec`, `incertaine` ou `annulee`), le résultat (identifiant et lien du réseau quand elle est publiée, cause et action à faire quand elle a échoué ou qu’elle est incertaine) et l’historique de chaque tentative (numéro, origine, jeton d’API, début, fin, issue).',
  portee: 'lecture',
  entree: z.strictObject({ id: identifiant }),
  executer: async (ctx, entree) => {
    const p = await publicationAccessible(ctx, entree.id);
    const tentatives = await ctx.services.publications.tentatives(ctx.marqueId, ctx.utilisateurId, p.id);
    return { publication: vuePublication(p), tentatives: tentatives.map(vueTentative) };
  },
  objet: (entree) => `publication:${entree.id}`,
});

export const publicationLister = definirAction({
  domaine: 'publication',
  verbe: 'lister',
  description: 'Liste les publications, la plus récente d’abord (200 au plus). Filtres : `montageId` (toutes celles de la vidéo), `espaceId`, `reseau`, `etat`.',
  portee: 'lecture',
  entree: z.strictObject({ montageId: identifiant.optional(), espaceId: identifiant.optional(), reseau: z.enum(RESEAUX).optional(), etat: z.enum(ETATS_PUBLICATION).optional() }),
  executer: async (ctx, entree) => {
    const serieId = entree.montageId === undefined ? undefined : (await montageAccessible(ctx, entree.montageId)).serieId;
    const toutes = await ctx.services.publications.lister(ctx.marqueId, ctx.utilisateurId, { serieId, espaceId: entree.espaceId, reseau: entree.reseau, etat: entree.etat, limite: 200 });
    return {
      publications: toutes
        .filter((p) => ctx.espaceIds === undefined || ctx.espaceIds.includes(p.espaceId))
        .map((p) => ({ ...vuePublication(p), reseauNom: RESEAUX_DECLARES[p.reseau]?.nom ?? p.reseau })),
    };
  },
  objet: () => 'publication',
});

export const ACTIONS_PUBLICATION = [publicationPublier, publicationLire, publicationLister] as const;
