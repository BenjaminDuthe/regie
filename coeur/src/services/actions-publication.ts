// regie — les actions de publication sur les réseaux (histoires 7.3 à 7.5, FR-42 à FR-44). Une seule écriture pour
// l'interface, l'API (`/api/v1/publication/<verbe>`) et le MCP. Publier fige le montage, le rendu et la légende : la
// publication qui part est celle qui a été demandée, même si la vidéo change ensuite. Aucune vue ne rend le jeton du
// compte ni la clé d'idempotence.

import { z } from 'zod';
import { RESEAUX_DECLARES } from '../domaine/reseaux.ts';
import { ETATS_PUBLICATION, HORIZON_PROGRAMMATION_MS, peutAnnuler, peutRejouer } from '../domaine/publication.ts';
import { heureParisVersInstant } from './horaires.ts';
import { RESEAUX } from '../domaine/bornes.ts';
import { legendeProposee, verifierLegende } from '../domaine/legende.ts';
import type { Publication, TentativePublication } from '../infra/publications.ts';
import { controlerAvantEnvoi } from '../publication/controles.ts';
import { enfilerEnvoi } from '../publication/mise-en-file.ts';
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
export const mettreEnFile = (ctx: ContexteAction, p: Publication): Promise<Publication> =>
  enfilerEnvoi(ctx.services, ctx.marqueId, ctx.utilisateurId, p, { origine: ctx.origine, pat: ctx.pat ?? null, sub: ctx.sub });

/** Le rendu complet prêt d'un montage : celui que la publication fige. */
export async function renduAPublier(ctx: ContexteAction, montageId: string) {
  const rendus = (await ctx.services.montages.listerRendus(ctx.marqueId, ctx.utilisateurId, montageId)).filter((r) => r.genre === 'complet');
  const pret = rendus.find((r) => r.etat === 'pret' && r.fichierId !== null);
  if (pret === undefined) throw new ErreurMetier('PUBLICATION_RENDU_ABSENT', 409, { etat: rendus[0]?.etat ?? 'absent' });
  return pret;
}

/** Fige ce qui partira : compte de la vidéo, rendu complet prêt, contrôles, légende enregistrée (ou proposée) vérifiée. */
export async function figer(ctx: ContexteAction, montageId: string, compteId: string, options: Readonly<{ quota: boolean }>) {
  const m = await montageAccessible(ctx, montageId);
  const compte = await ctx.services.comptesReseau.lire(ctx.marqueId, ctx.utilisateurId, compteId);
  if (compte === undefined || (ctx.espaceIds !== undefined && !ctx.espaceIds.includes(compte.espaceId)) || compte.espaceId !== m.espaceId) throw new ErreurMetier('COMPTE_RESEAU_INTROUVABLE', 404);
  const rendu = await renduAPublier(ctx, m.id);
  const controle = await controlerAvantEnvoi(ctx.services, ctx.marqueId, ctx.utilisateurId, { compteId: compte.id, renduId: rendu.id, reseau: compte.reseau }, options);
  if (!controle.ok) throw new ErreurMetier(controle.code, controle.code === 'PUBLICATION_BORNE' ? 422 : 409, controle.contexte);
  const lue = await ctx.services.montages.lireLegende(ctx.marqueId, ctx.utilisateurId, m.serieId, compte.reseau);
  const brute = lue === undefined ? legendeProposee(m.timeline, compte.reseau) : { legende: lue.legende, hashtags: lue.hashtags };
  const v = verifierLegende(compte.reseau, brute.legende, brute.hashtags);
  if (!v.ok) throw new ErreurMetier(v.refus.code, 422, v.refus.contexte);
  return { montage: m, compte, rendu, legende: v.valeur.legende, hashtags: v.valeur.hashtags };
}

/** La dernière version d'une vidéo (série). */
export async function derniereVersion(ctx: ContexteAction, serieId: string) {
  const v = (await ctx.services.montages.listerSerie(ctx.marqueId, ctx.utilisateurId, serieId))[0];
  if (v === undefined) throw new ErreurMetier('MONTAGE_INTROUVABLE', 404, { id: serieId });
  return v;
}

/** « AAAA-MM-JJTHH:MM » à Paris -> instant. Dans le futur, au plus un an ; heure inexistante (saut de printemps) refusée. */
export function instantProgramme(ctx: ContexteAction, quand: string): Date {
  const instant = heureParisVersInstant(quand);
  const maintenant = ctx.services.maintenant();
  if (instant === undefined || instant.getTime() <= maintenant || instant.getTime() > maintenant + HORIZON_PROGRAMMATION_MS) throw new ErreurMetier('PUBLICATION_ECHEANCE_INVALIDE', 422);
  return instant;
}

const quandSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);

export const publicationPublier = definirAction({
  domaine: 'publication',
  verbe: 'publier',
  description:
    'Publie maintenant une vidéo sur un compte de réseau relié (Instagram). Contrôle avant tout envoi : compte connecté, rendu complet prêt, bornes du réseau (PUBLICATION_BORNE, en nommant la borne) et quota (PUBLICATION_QUOTA). La publication fige le montage, le rendu et la légende enregistrée de la vidéo pour ce réseau (à défaut, la légende proposée). Une seule publication par compte et par vidéo (PUBLICATION_EXISTANTE). Rend la publication `en_file` : suis-la avec `publication.lire`. Un envoi n’est jamais fait deux fois ; après une coupure, l’état est `incertaine` et regie ne renvoie pas.',
  portee: 'ecriture',
  entree: z.strictObject({ montageId: identifiant, compteId: identifiant }),
  executer: async (ctx, entree) => {
    const f = await figer(ctx, entree.montageId, entree.compteId, { quota: true });
    const { montage: m, compte, rendu } = f;
    const creation = await ctx.services.publications.creer({
      marqueId: ctx.marqueId, utilisateurId: ctx.utilisateurId, espaceId: m.espaceId, compteId: compte.id, reseau: compte.reseau,
      serieId: m.serieId, montageId: m.id, renduId: rendu.id, legende: f.legende, hashtags: f.hashtags, etat: 'en_file',
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


export const publicationProgrammer = definirAction({
  domaine: 'publication',
  verbe: 'programmer',
  description:
    'Programme la publication d’une vidéo sur un compte relié à une heure de Paris (`quand`, « AAAA-MM-JJTHH:MM », dans le futur, au plus un an ; une heure qui n’existe pas au changement d’heure est refusée, une heure répétée à l’automne est la première). Mêmes contrôles que `publication.publier`, hors quota (contrôlé à l’heure dite). Le départ a lieu dans la minute qui suit ; un retard de moins de 2 h est rattrapé, au-delà la publication échoue (ECHEANCE_PERIMEE). Si le montage change avant l’heure, la publication passe en `en_attente_confirmation` : `publication.confirmer` avant l’heure, sinon elle échoue (MONTAGE_MODIFIE). Rend la publication `programmee`.',
  portee: 'ecriture',
  entree: z.strictObject({ montageId: identifiant, compteId: identifiant, quand: quandSchema }),
  executer: async (ctx, entree) => {
    const instant = instantProgramme(ctx, entree.quand);
    const f = await figer(ctx, entree.montageId, entree.compteId, { quota: false });
    const creation = await ctx.services.publications.creer({
      marqueId: ctx.marqueId, utilisateurId: ctx.utilisateurId, espaceId: f.montage.espaceId, compteId: f.compte.id, reseau: f.compte.reseau,
      serieId: f.montage.serieId, montageId: f.montage.id, renduId: f.rendu.id, legende: f.legende, hashtags: f.hashtags, etat: 'programmee', programmeePour: instant,
    });
    if (creation.etat === 'existe') throw new ErreurMetier('PUBLICATION_EXISTANTE', 409, { id: creation.id });
    if (creation.etat === 'introuvable') throw new ErreurMetier('MONTAGE_INTROUVABLE', 404, { id: entree.montageId });
    return { publication: vuePublication(creation.publication) };
  },
  objet: (entree) => `montage:${entree.montageId}`,
});

export const publicationDeplacer = definirAction({
  domaine: 'publication',
  verbe: 'deplacer',
  description: 'Déplace l’heure d’une publication `programmee` ou `en_attente_confirmation` (`quand`, heure de Paris, mêmes règles que `publication.programmer`) : l’ancienne échéance est retirée, la nouvelle inscrite.',
  portee: 'ecriture',
  entree: z.strictObject({ id: identifiant, quand: quandSchema }),
  executer: async (ctx, entree) => {
    const p = await publicationAccessible(ctx, entree.id);
    if (p.etat !== 'programmee' && p.etat !== 'en_attente_confirmation') throw new ErreurMetier('PUBLICATION_ETAT', 409, { etat: p.etat });
    const deplacee = await ctx.services.publications.deplacer(ctx.marqueId, ctx.utilisateurId, p.id, instantProgramme(ctx, entree.quand));
    if (deplacee === undefined) throw new ErreurMetier('PUBLICATION_ETAT', 409, { etat: (await publicationAccessible(ctx, p.id)).etat });
    return { publication: vuePublication(deplacee) };
  },
  objet: (entree) => `publication:${entree.id}`,
});

export const publicationAnnuler = definirAction({
  domaine: 'publication',
  verbe: 'annuler',
  description: 'Annule une publication qui n’est pas encore partie (`en_file`, `programmee`, `en_attente_confirmation` ou `en_echec`) : son échéance est supprimée. Une publication partie ou incertaine ne s’annule pas (PUBLICATION_ETAT).',
  portee: 'ecriture',
  entree: z.strictObject({ id: identifiant }),
  executer: async (ctx, entree) => {
    const p = await publicationAccessible(ctx, entree.id);
    if (!peutAnnuler(p.etat)) throw new ErreurMetier('PUBLICATION_ETAT', 409, { etat: p.etat });
    const annulee = await ctx.services.publications.annuler(ctx.marqueId, ctx.utilisateurId, p.id);
    if (annulee === undefined) throw new ErreurMetier('PUBLICATION_ETAT', 409, { etat: (await publicationAccessible(ctx, p.id)).etat });
    return { publication: vuePublication(annulee) };
  },
  objet: (entree) => `publication:${entree.id}`,
});

export const publicationConfirmer = definirAction({
  domaine: 'publication',
  verbe: 'confirmer',
  description: 'Confirme la nouvelle version du montage d’une publication `en_attente_confirmation` : elle fige la dernière version, son rendu complet prêt et la légende enregistrée, refait les contrôles et redevient `programmee` à la même heure. À faire avant l’heure prévue, sinon elle échoue (MONTAGE_MODIFIE).',
  portee: 'ecriture',
  entree: z.strictObject({ id: identifiant }),
  executer: async (ctx, entree) => {
    const p = await publicationAccessible(ctx, entree.id);
    if (p.etat !== 'en_attente_confirmation') throw new ErreurMetier('PUBLICATION_ETAT', 409, { etat: p.etat });
    const f = await figer(ctx, (await derniereVersion(ctx, p.serieId)).id, p.compteId, { quota: false });
    const confirmee = await ctx.services.publications.confirmer(ctx.marqueId, ctx.utilisateurId, p.id, { montageId: f.montage.id, renduId: f.rendu.id, legende: f.legende, hashtags: f.hashtags });
    if (confirmee === undefined) throw new ErreurMetier('PUBLICATION_ETAT', 409, { etat: (await publicationAccessible(ctx, p.id)).etat });
    return { publication: vuePublication(confirmee) };
  },
  objet: (entree) => `publication:${entree.id}`,
});

/**
 * Rejouer un échec (histoire 7.5) : nouvelle clé d'idempotence, nouvelle tâche, nouvelle tentative inscrite à l'historique.
 * Seul `en_echec` se rejoue : une publication `incertaine` est peut-être en ligne, regie ne la renvoie pas.
 * Un échec `MONTAGE_MODIFIE` fige d'abord la dernière version du montage.
 */
export const publicationRejouer = definirAction({
  domaine: 'publication',
  verbe: 'rejouer',
  description:
    'Rejoue une publication `en_echec` : une nouvelle tentative est mise en file (historique visible dans `publication.lire`, une ligne par tentative). Si l’échec vient d’un montage modifié non confirmé (MONTAGE_MODIFIE), la dernière version, son rendu complet prêt et la légende enregistrée sont figés avant la nouvelle tentative ; si l’heure prévue était dépassée (ECHEANCE_PERIMEE), la publication part maintenant. Une publication `incertaine` ne se rejoue pas (PUBLICATION_ETAT) : vérifie sur le réseau.',
  portee: 'ecriture',
  entree: z.strictObject({ id: identifiant }),
  executer: async (ctx, entree) => {
    const p = await publicationAccessible(ctx, entree.id);
    if (!peutRejouer(p.etat)) throw new ErreurMetier('PUBLICATION_ETAT', 409, { etat: p.etat });
    let cible;
    if (p.cause === 'MONTAGE_MODIFIE') {
      const f = await figer(ctx, (await derniereVersion(ctx, p.serieId)).id, p.compteId, { quota: true });
      cible = { montageId: f.montage.id, renduId: f.rendu.id, legende: f.legende, hashtags: f.hashtags };
    }
    const rejouee = await ctx.services.publications.rejouer(ctx.marqueId, ctx.utilisateurId, p.id, cible);
    if (rejouee === undefined) throw new ErreurMetier('PUBLICATION_ETAT', 409, { etat: (await publicationAccessible(ctx, p.id)).etat });
    return { publication: vuePublication(await mettreEnFile(ctx, rejouee)) };
  },
  objet: (entree) => `publication:${entree.id}`,
});

export const ACTIONS_PUBLICATION = [publicationPublier, publicationProgrammer, publicationDeplacer, publicationAnnuler, publicationConfirmer, publicationRejouer, publicationLire, publicationLister] as const;
