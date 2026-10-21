// regie — les actions des montages et de leurs rendus (histoires 4.6, 2.12, FR-26, FR-28). Une seule écriture pour
// l'interface, l'API (`/api/v1/montage/<verbe>`, `/api/v1/rendu/<verbe>`) et le MCP. Un montage est une version
// immuable : on le lit, on ne le modifie pas (la modification crée une version, histoire 3.10).

import { z } from 'zod';
import { IdScene, OperationsEdition, SCENES_MAX, VARIANTES_COUVERTURE, appliquerOperations, dureeTotaleMs, sousTitres, versSrt } from '@regie/contrats';
import { dessinerCouverture, varianteChoisie } from '../domaine/couverture.ts';
import { RESEAUX } from '../domaine/bornes.ts';
import { bornesDuReseau, legendeProposee, verifierLegende } from '../domaine/legende.ts';
import { signerAdresse } from '../auth/adresses-signees.ts';
import { evaluerMontage, figerGabarit } from '../domaine/montage.ts';
import type { Violation } from '../domaine/gardes.ts';
import type { Montage, Rendu } from '../infra/montages.ts';
import { decrireViolation } from './actions-gabarit.ts';
import { ErreurMetier } from './erreurs.ts';
import { definirAction, type ContexteAction } from './registre.ts';
import { lancerRendu } from './rendu.ts';
import { lancerVoix } from './voix.ts';
import { suivreUneTache } from './suivi.ts';
import { debutDeJourParis, prochainJour } from './journal.ts';

const identifiant = z.uuid();

/** Durée de l'adresse signée d'un fichier lu par un lecteur : moins d'une heure (2.12). */
export const DUREE_ADRESSE_FICHIER_S = 1800;

export const montageVisible = (m: Montage) => ({
  id: m.id,
  espaceId: m.espaceId,
  scriptId: m.scriptId,
  serieId: m.serieId,
  numero: m.numero,
  parentId: m.parentId,
  origine: m.origine,
  gabarit: { id: m.gabarit.id, nom: m.gabarit.nom, version: m.gabarit.version },
  dureeMs: dureeTotaleMs(m.timeline),
  timeline: m.timeline,
  creeLe: m.creeLe.toISOString(),
});

export const phrases = (violations: readonly Violation[]) => violations.map((v) => ({ ...v, phrase: decrireViolation(v) }));

export const renduVisible = (r: Rendu) => ({
  id: r.id,
  montageId: r.montageId,
  genre: r.genre,
  etat: r.etat,
  tacheId: r.tacheId,
  fichierId: r.fichierId,
  violations: phrases(r.violations),
  cause: r.cause,
  creeLe: r.creeLe.toISOString(),
  termineLe: r.termineLe?.toISOString() ?? null,
});

export async function montageAccessible(ctx: ContexteAction, id: string): Promise<Montage> {
  const m = await ctx.services.montages.lire(ctx.marqueId, ctx.utilisateurId, id);
  // Un jeton ne voit que les espaces qu'on lui a donnés : pour lui, un autre montage n'existe pas.
  if (m === undefined || (ctx.espaceIds !== undefined && !ctx.espaceIds.includes(m.espaceId))) throw new ErreurMetier('MONTAGE_INTROUVABLE', 404, { id });
  return m;
}

export async function renduAccessible(ctx: ContexteAction, id: string): Promise<Rendu> {
  const r = await ctx.services.montages.lireRendu(ctx.marqueId, ctx.utilisateurId, id);
  if (r === undefined || (ctx.espaceIds !== undefined && !ctx.espaceIds.includes(r.espaceId))) throw new ErreurMetier('RENDU_INTROUVABLE', 404, { id });
  return r;
}

export const montageLister = definirAction({
  domaine: 'montage',
  verbe: 'lister',
  description: 'Liste tes vidéos : la dernière version de chaque montage (script d’origine, gabarit, durée), la plus récente d’abord. `scriptId` limite aux montages d’un script.',
  portee: 'lecture',
  entree: z.strictObject({ scriptId: identifiant.optional() }),
  executer: async (ctx, entree) => {
    const tous = await ctx.services.montages.listerDernieres(ctx.marqueId, ctx.utilisateurId, entree.scriptId === undefined ? {} : { scriptId: entree.scriptId });
    return { montages: tous.filter((m) => ctx.espaceIds === undefined || ctx.espaceIds.includes(m.espaceId)).map(montageVisible) };
  },
  objet: () => 'montage',
});

export const montageLire = definirAction({
  domaine: 'montage',
  verbe: 'lire',
  description: 'Lit un montage : sa timeline (scènes, textes, durées, animations, zoom), le gabarit figé à sa création, et ses rendus (état en_file, en_cours, pret, bloque ou echec, violations des gardes avec mesure et seuil). Donne aussi les autres versions de la série.',
  portee: 'lecture',
  entree: z.strictObject({ id: identifiant }),
  executer: async (ctx, entree) => {
    const m = await montageAccessible(ctx, entree.id);
    const [rendus, serie] = await Promise.all([
      ctx.services.montages.listerRendus(ctx.marqueId, ctx.utilisateurId, m.id),
      ctx.services.montages.listerSerie(ctx.marqueId, ctx.utilisateurId, m.serieId),
    ]);
    return { montage: montageVisible(m), rendus: rendus.map(renduVisible), versions: serie.map((v) => ({ id: v.id, numero: v.numero, origine: v.origine, creeLe: v.creeLe.toISOString() })) };
  },
  objet: (entree) => `montage:${entree.id}`,
});

export const renduLire = definirAction({
  domaine: 'rendu',
  verbe: 'lire',
  description: 'Lit un rendu : son état, la progression de sa tâche, la cause d’un échec, et, pour un rendu bloqué, chaque violation des gardes (scène, élément, mesure, seuil).',
  portee: 'lecture',
  entree: z.strictObject({ id: identifiant }),
  executer: async (ctx, entree) => ({ rendu: renduVisible(await renduAccessible(ctx, entree.id)) }),
  objet: (entree) => `rendu:${entree.id}`,
});

export const renduAdresse = definirAction({
  domaine: 'rendu',
  verbe: 'adresse',
  description: 'Rend l’adresse signée (moins d’une heure) de la vidéo d’un rendu pour la lire dans le navigateur. Un rendu bloqué par une garde reste lisible, marqué « bloqué ». Un rendu en file, en cours ou en échec n’a pas de vidéo.',
  portee: 'lecture',
  entree: z.strictObject({ id: identifiant }),
  executer: async (ctx, entree) => {
    const r = await renduAccessible(ctx, entree.id);
    if ((r.etat !== 'pret' && r.etat !== 'bloque') || r.fichierId === null) throw new ErreurMetier('RENDU_PAS_PRET', 409, { etat: r.etat });
    const fichier = await ctx.services.montages.lireFichier(ctx.marqueId, ctx.utilisateurId, r.fichierId);
    if (fichier === undefined || fichier.purgeLe !== null) throw new ErreurMetier('RENDU_INTROUVABLE', 404, { id: entree.id });
    // Adresse relative, même origine que la page : le lecteur vidéo reste dans `media-src 'self'`.
    const adresse = signerAdresse(ctx.services.cleAdresses, `/v/session/${ctx.marqueId}/${ctx.utilisateurId}/${fichier.id}`, { maintenant: ctx.services.maintenant(), dureeS: DUREE_ADRESSE_FICHIER_S });
    return { adresse, mime: fichier.mime, octets: fichier.octets, dureeMs: fichier.dureeMs, bloque: r.etat === 'bloque', expireDansS: DUREE_ADRESSE_FICHIER_S };
  },
  objet: (entree) => `rendu:${entree.id}`,
});

export const montageSousTitres = definirAction({
  domaine: 'montage',
  verbe: 'soustitres',
  description: 'Donne les sous-titres d’un montage, tirés du texte de voix de chaque scène : les repères (scène, début, fin, texte) et le fichier SRT à télécharger.',
  portee: 'lecture',
  entree: z.strictObject({ id: identifiant }),
  executer: async (ctx, entree) => {
    const m = await montageAccessible(ctx, entree.id);
    const reperes = sousTitres(m.timeline);
    return { reperes, srt: versSrt(reperes) };
  },
  objet: (entree) => `montage:${entree.id}`,
});

export const montageDefinirVoix = definirAction({
  domaine: 'montage',
  verbe: 'definirvoix',
  description: 'Change le texte de voix de scènes (500 caractères au plus ; vide = la scène ne parle pas). Crée une NOUVELLE version du montage (l’ancienne ne change pas) à partir de la dernière version, puis met en file la voix de synthèse locale et le rendu : les sous-titres suivent le texte. Une version qui n’est plus la dernière est refusée (MONTAGE_VERSION_PERIMEE).',
  portee: 'ecriture',
  entree: z.strictObject({
    id: identifiant,
    voix: z.array(z.strictObject({ sceneId: IdScene, texte: z.string().max(500) })).min(1).max(SCENES_MAX),
  }),
  executer: async (ctx, entree) => {
    const base = await montageAccessible(ctx, entree.id);
    const nouveaux = new Map(entree.voix.map((v) => [v.sceneId, v.texte.trim()] as const));
    for (const sceneId of nouveaux.keys()) {
      if (!base.timeline.scenes.some((s) => s.id === sceneId)) throw new ErreurMetier('SCENE_INTROUVABLE', 404, { sceneId });
    }
    const timeline = { ...base.timeline, scenes: base.timeline.scenes.map((s) => (nouveaux.has(s.id) ? { ...s, voix: nouveaux.get(s.id)! } : s)) };
    const r = await ctx.services.montages.creerVersion({ marqueId: ctx.marqueId, utilisateurId: ctx.utilisateurId, parentId: base.id, origine: 'edition', timeline });
    if (r.etat === 'introuvable') throw new ErreurMetier('MONTAGE_INTROUVABLE', 404, { id: entree.id });
    if (r.etat === 'perimee') throw new ErreurMetier('MONTAGE_VERSION_PERIMEE', 409, { derniere: r.derniere });
    const qui = { marqueId: ctx.marqueId, utilisateurId: ctx.utilisateurId };
    // Avec une voix locale et du texte à dire : la voix d'abord (elle met ensuite le rendu en file) ; sinon, le rendu seul.
    const aDire = ctx.services.voixLocale === true && timeline.scenes.some((s) => s.voix.trim() !== '');
    const lance = aDire ? await lancerVoix(ctx.services, qui, r.montage.id) : await lancerRendu(ctx.services, qui, r.montage.id, 'allege');
    if (lance === undefined) throw new ErreurMetier('MONTAGE_INTROUVABLE', 404, { id: r.montage.id });
    return { montage: montageVisible(r.montage), tacheId: lance.tacheId };
  },
  objet: (entree) => `montage:${entree.id}`,
});

export const montageEditer = definirAction({
  domaine: 'montage',
  verbe: 'editer',
  description: 'Modifie un montage par une liste d’opérations appliquées dans l’ordre : `texte` (accroche, texteEcran, voix d’une scène), `duree` (dureeMs d’une scène), `deplacer` (monter ou descendre), `dupliquer`, `retirer`, `carte_fin` (titre, sousTitre, dureeMs, ou retirer), `animation` (entree, sortie, dureeMs, delaiMs des textes d’une scène ; catalogue : aucune, fondu, glisse_haut, glisse_bas, zoom en entrée ; aucune, fondu, zoom en sortie), `transition` (coupe ou fondu avec la scène précédente), `zoom` (actif, niveau de 1,1 à 3, decalageMs par rapport au clic) et `animation_carte` (la même chose pour la carte de fin) et `couverture` (variante : titre, ecran ou bandeau). Crée une NOUVELLE version du montage (l’ancienne ne change pas, les publications déjà parties restent liées à elle) à partir de la version donnée, sans lancer de rendu. Rend les violations des gardes de la nouvelle version, scène par scène : un texte hors zone sûre ou illisible n’empêche pas l’enregistrement, mais la vidéo ne passera pas « prête » tant qu’il n’est pas corrigé. Une version qui n’est plus la dernière est refusée (MONTAGE_VERSION_PERIMEE).',
  portee: 'ecriture',
  entree: z.strictObject({ id: identifiant, operations: OperationsEdition }),
  executer: async (ctx, entree) => {
    const base = await montageAccessible(ctx, entree.id);
    const resultat = appliquerOperations(base.timeline, entree.operations);
    if (!resultat.ok) {
      const statut = resultat.code === 'SCENE_INTROUVABLE' ? 404 : resultat.code === 'DERNIERE_SCENE' ? 409 : 422;
      throw new ErreurMetier(resultat.code, statut, { sceneId: resultat.sceneId ?? '', detail: resultat.detail ?? '' });
    }
    const r = await ctx.services.montages.creerVersion({ marqueId: ctx.marqueId, utilisateurId: ctx.utilisateurId, parentId: base.id, origine: 'edition', timeline: resultat.timeline });
    if (r.etat === 'introuvable') throw new ErreurMetier('MONTAGE_INTROUVABLE', 404, { id: entree.id });
    if (r.etat === 'perimee') throw new ErreurMetier('MONTAGE_VERSION_PERIMEE', 409, { derniere: r.derniere });
    return { montage: montageVisible(r.montage), violations: phrases(evaluerMontage(r.montage.timeline, r.montage.gabarit.definition)) };
  },
  objet: (entree) => `montage:${entree.id}`,
});

const dateFr = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long', timeZone: 'Europe/Paris' });

/** Refuse (`SEANCE_PURGEE`, avec la date de purge) si le film brut du montage n'existe plus : rien ne peut être rendu sans lui. */
async function exigerFilm(ctx: ContexteAction, m: Montage): Promise<void> {
  const film = await ctx.services.montages.lireFichier(ctx.marqueId, ctx.utilisateurId, m.filmFichierId);
  if (film === undefined) throw new ErreurMetier('MONTAGE_INTROUVABLE', 404, { id: m.id });
  if (film.purgeLe !== null) throw new ErreurMetier('SEANCE_PURGEE', 409, { date: dateFr.format(film.purgeLe) });
}

/** Met en file la voix (si une voix locale existe et que du texte est à dire) puis le rendu, ou le rendu seul. */
async function lancerRegeneration(ctx: ContexteAction, m: Montage, genre: 'allege' | 'complet') {
  const qui = { marqueId: ctx.marqueId, utilisateurId: ctx.utilisateurId };
  const aDire = ctx.services.voixLocale === true && m.timeline.scenes.some((s) => s.voix.trim() !== '');
  const lance = aDire ? await lancerVoix(ctx.services, qui, m.id) : await lancerRendu(ctx.services, qui, m.id, genre);
  if (lance === undefined) throw new ErreurMetier('MONTAGE_INTROUVABLE', 404, { id: m.id });
  return lance;
}

export const montageRegenerer = definirAction({
  domaine: 'montage',
  verbe: 'regenerer',
  description: 'Regénère la vidéo d’un montage : met en file un nouveau rendu (et la voix de synthèse, si elle existe) à partir du montage tel qu’il est, sans le modifier. Le film rendu est la référence de ce que le montage donne ; le même montage, le même film brut et la même version du moteur donnent deux rendus identiques. Suis l’avancement avec `rendu.lire` (état en_file, en_cours, pret, bloque ou echec). Refusé avec SEANCE_PURGEE si les rushes ont été purgés (la date de purge est dans le message).',
  portee: 'ecriture',
  entree: z.strictObject({ id: identifiant, genre: z.enum(['allege', 'complet']).default('allege') }),
  executer: async (ctx, entree) => {
    const m = await montageAccessible(ctx, entree.id);
    await exigerFilm(ctx, m);
    const lance = await lancerRegeneration(ctx, m, entree.genre);
    return { montageId: m.id, tacheId: lance.tacheId };
  },
  objet: (entree) => `montage:${entree.id}`,
});

export const montageRegenererGabarit = definirAction({
  domaine: 'montage',
  verbe: 'regenerergabarit',
  description: 'Regénère la vidéo avec le gabarit actuel de l’espace (celui par défaut). Un gabarit modifié ne touche jamais un montage existant : seules les nouvelles séances l’utilisent. Cette action crée un NOUVEAU montage (origine « gabarit », mêmes scènes, gabarit actuel figé) et met son rendu en file ; l’ancien montage et son rendu restent dans l’historique. Refusé avec SEANCE_PURGEE si les rushes ont été purgés (la date de purge est dans le message). Une version qui n’est plus la dernière est refusée (MONTAGE_VERSION_PERIMEE).',
  portee: 'ecriture',
  entree: z.strictObject({ id: identifiant }),
  executer: async (ctx, entree) => {
    const base = await montageAccessible(ctx, entree.id);
    await exigerFilm(ctx, base);
    const gabarits = await ctx.services.gabarits.lister(ctx.marqueId, ctx.utilisateurId, base.espaceId);
    const actuel = gabarits.find((g) => g.parDefaut) ?? gabarits[0];
    if (actuel === undefined) throw new ErreurMetier('GABARIT_INTROUVABLE', 404, { id: base.gabarit.id });
    const r = await ctx.services.montages.creerVersion({ marqueId: ctx.marqueId, utilisateurId: ctx.utilisateurId, parentId: base.id, origine: 'gabarit', timeline: base.timeline, gabarit: figerGabarit(actuel) });
    if (r.etat === 'introuvable') throw new ErreurMetier('MONTAGE_INTROUVABLE', 404, { id: entree.id });
    if (r.etat === 'perimee') throw new ErreurMetier('MONTAGE_VERSION_PERIMEE', 409, { derniere: r.derniere });
    const lance = await lancerRegeneration(ctx, r.montage, 'allege');
    return { montage: montageVisible(r.montage), tacheId: lance.tacheId };
  },
  objet: (entree) => `montage:${entree.id}`,
});

export const montageCouvertures = definirAction({
  domaine: 'montage',
  verbe: 'couvertures',
  description: 'Donne les trois couvertures d’un montage (variantes `titre`, `ecran` et `bandeau`), au style du gabarit figé du montage, chacune en image SVG 1080×1920, et dit laquelle est choisie (la première par défaut). Rien n’est écrit.',
  portee: 'lecture',
  entree: z.strictObject({ id: identifiant }),
  executer: async (ctx, entree) => {
    const m = await montageAccessible(ctx, entree.id);
    const choisie = varianteChoisie(m.timeline);
    return { montageId: m.id, variantes: VARIANTES_COUVERTURE.map((variante) => ({ variante, choisie: variante === choisie, svg: dessinerCouverture(m.timeline, m.gabarit.definition, variante) })) };
  },
  objet: (entree) => `montage:${entree.id}`,
});

export const montageCouvrir = definirAction({
  domaine: 'montage',
  verbe: 'couvrir',
  description: 'Choisit la couverture d’un montage parmi `titre`, `ecran` et `bandeau`. Crée une NOUVELLE version du montage (l’ancienne ne change pas) avec la couverture choisie ; le film n’est pas rendu de nouveau. Si la variante est déjà celle du montage, rien n’est créé (`inchange`). Refusé avec SEANCE_PURGEE si les rushes ont été purgés (la date de purge est dans le message). Une version qui n’est plus la dernière est refusée (MONTAGE_VERSION_PERIMEE).',
  portee: 'ecriture',
  entree: z.strictObject({ id: identifiant, variante: z.enum(VARIANTES_COUVERTURE) }),
  executer: async (ctx, entree) => {
    const base = await montageAccessible(ctx, entree.id);
    await exigerFilm(ctx, base);
    if (varianteChoisie(base.timeline) === entree.variante && base.timeline.couverture !== undefined) return { montage: montageVisible(base), inchange: true };
    const resultat = appliquerOperations(base.timeline, [{ op: 'couverture', variante: entree.variante }]);
    if (!resultat.ok) throw new ErreurMetier(resultat.code, 422, { sceneId: resultat.sceneId ?? '', detail: resultat.detail ?? '' });
    const r = await ctx.services.montages.creerVersion({ marqueId: ctx.marqueId, utilisateurId: ctx.utilisateurId, parentId: base.id, origine: 'edition', timeline: resultat.timeline });
    if (r.etat === 'introuvable') throw new ErreurMetier('MONTAGE_INTROUVABLE', 404, { id: entree.id });
    if (r.etat === 'perimee') throw new ErreurMetier('MONTAGE_VERSION_PERIMEE', 409, { derniere: r.derniere });
    return { montage: montageVisible(r.montage), inchange: false };
  },
  objet: (entree) => `montage:${entree.id}`,
});

export const montageLegende = definirAction({
  domaine: 'montage',
  verbe: 'legende',
  description: 'Donne la légende et les hashtags d’une vidéo pour un réseau (`instagram`, `facebook` ou `tiktok`), avec les bornes du réseau (longueur de la légende, nombre de hashtags). La légende appartient à la vidéo, pas à une version. Tant que rien n’est enregistré (`enregistree` faux), une légende est proposée à partir de l’accroche de la première scène. Rien n’est écrit.',
  portee: 'lecture',
  entree: z.strictObject({ id: identifiant, reseau: z.enum(RESEAUX) }),
  executer: async (ctx, entree) => {
    const m = await montageAccessible(ctx, entree.id);
    const lue = await ctx.services.montages.lireLegende(ctx.marqueId, ctx.utilisateurId, m.serieId, entree.reseau);
    const valeur = lue === undefined ? legendeProposee(m.timeline, entree.reseau) : { legende: lue.legende, hashtags: lue.hashtags };
    return { montageId: m.id, serieId: m.serieId, reseau: entree.reseau, ...valeur, enregistree: lue !== undefined, bornes: bornesDuReseau(entree.reseau), majLe: lue?.majLe.toISOString() ?? null };
  },
  objet: (entree) => `montage:${entree.id}`,
});

export const montageLegender = definirAction({
  domaine: 'montage',
  verbe: 'legender',
  description: 'Enregistre la légende et les hashtags d’une vidéo pour un réseau (`instagram`, `facebook` ou `tiktok`) ; remplace l’enregistrement précédent. Les bornes du réseau (deploiement/bornes.json) sont appliquées sans troncature : une légende trop longue (LEGENDE_TROP_LONGUE), trop de hashtags (TROP_DE_HASHTAGS) ou un hashtag invalide (HASHTAG_INVALIDE) est refusé en nommant la borne. Les hashtags s’écrivent avec ou sans « # » ; ils sont mis en minuscules et dédoublonnés. Ne crée pas de version du montage.',
  portee: 'ecriture',
  entree: z.strictObject({ id: identifiant, reseau: z.enum(RESEAUX), legende: z.string().max(20000), hashtags: z.array(z.string().max(200)).max(100) }),
  executer: async (ctx, entree) => {
    const m = await montageAccessible(ctx, entree.id);
    const v = verifierLegende(entree.reseau, entree.legende, entree.hashtags);
    if (!v.ok) throw new ErreurMetier(v.refus.code, 422, v.refus.contexte);
    const r = await ctx.services.montages.enregistrerLegende({ marqueId: ctx.marqueId, utilisateurId: ctx.utilisateurId, serieId: m.serieId, reseau: entree.reseau, legende: v.valeur.legende, hashtags: v.valeur.hashtags });
    if (r === undefined) throw new ErreurMetier('MONTAGE_INTROUVABLE', 404, { id: entree.id });
    return { montageId: m.id, serieId: m.serieId, reseau: entree.reseau, legende: r.legende, hashtags: r.hashtags, majLe: r.majLe.toISOString() };
  },
  objet: (entree) => `montage:${entree.id}`,
});

/**
 * Télécharger la vidéo prête (histoire 3.8, FR-40, FR-52, NFR-18) : la vidéo complète (1 080×1 920, sans filigrane), sa
 * couverture et ses légendes. Si le rendu complet n'existe pas encore, il est lancé (une seule fois) et l'heure estimée
 * est donnée. Les rushes purgés n'empêchent pas le téléchargement d'un rendu déjà fait.
 */
export const montageTelecharger = definirAction({
  domaine: 'montage',
  verbe: 'telecharger',
  description: 'Prépare le téléchargement d’une vidéo prête. Si le rendu complet (1 080×1 920, sans filigrane) est fait, rend son adresse signée (moins d’une heure), la couverture choisie (image SVG) et la légende de chaque réseau. Sinon, met le rendu complet en file (une seule fois : un rendu déjà en file n’est pas doublé) et rend l’état `en_preparation` avec l’heure de fin estimée ; rappelle ensuite cette action. Les rushes purgés n’empêchent pas de télécharger un rendu déjà fait ; sans rendu à faire, ils donnent SEANCE_PURGEE. Un rendu complet bloqué par une garde n’est pas téléchargeable (RENDU_PAS_PRET).',
  portee: 'ecriture',
  entree: z.strictObject({ id: identifiant }),
  executer: async (ctx, entree) => {
    const m = await montageAccessible(ctx, entree.id);
    const qui = { marqueId: ctx.marqueId, utilisateurId: ctx.utilisateurId };
    const complets = (await ctx.services.montages.listerRendus(qui.marqueId, qui.utilisateurId, m.id)).filter((r) => r.genre === 'complet');
    const pret = complets.find((r) => r.etat === 'pret' && r.fichierId !== null);
    const fichier = pret?.fichierId == null ? undefined : await ctx.services.montages.lireFichier(qui.marqueId, qui.utilisateurId, pret.fichierId);
    if (pret !== undefined && fichier !== undefined && fichier.purgeLe === null) {
      const adresse = signerAdresse(ctx.services.cleAdresses, `/v/session/${ctx.marqueId}/${ctx.utilisateurId}/${fichier.id}`, { maintenant: ctx.services.maintenant(), dureeS: DUREE_ADRESSE_FICHIER_S });
      const variante = varianteChoisie(m.timeline);
      const legendes = await Promise.all(RESEAUX.map(async (reseau) => {
        const lue = await ctx.services.montages.lireLegende(qui.marqueId, qui.utilisateurId, m.serieId, reseau);
        const valeur = lue === undefined ? legendeProposee(m.timeline, reseau) : { legende: lue.legende, hashtags: lue.hashtags };
        return { reseau, ...valeur, enregistree: lue !== undefined };
      }));
      return {
        etat: 'pret' as const,
        montageId: m.id,
        video: { adresse, mime: fichier.mime, octets: fichier.octets, dureeMs: fichier.dureeMs, largeur: 1080, hauteur: 1920, expireDansS: DUREE_ADRESSE_FICHIER_S },
        couverture: { variante, svg: dessinerCouverture(m.timeline, m.gabarit.definition, variante) },
        legendes,
      };
    }
    // Un rendu complet bloqué par une garde ne se relance pas à l'identique : la personne corrige d'abord le montage.
    const dernier = complets[0];
    if (dernier?.etat === 'bloque') throw new ErreurMetier('RENDU_PAS_PRET', 409, { etat: dernier.etat });
    let tacheId: string | null = complets.find((r) => r.etat === 'en_file' || r.etat === 'en_cours')?.tacheId ?? null;
    let lance = false;
    if (tacheId === null) {
      await exigerFilm(ctx, m);
      const nouveau = await lancerRendu(ctx.services, qui, m.id, 'complet');
      if (nouveau === undefined) throw new ErreurMetier('MONTAGE_INTROUVABLE', 404, { id: m.id });
      tacheId = nouveau.tacheId;
      lance = true;
    }
    const suivi = await suivreUneTache(ctx.services, qui.marqueId, qui.utilisateurId, tacheId);
    return { etat: 'en_preparation' as const, montageId: m.id, lance, tacheId, finEstimee: suivi?.finEstimee ?? null, finEstimeeEnClair: suivi?.finEstimeeEnClair ?? null };
  },
  objet: (entree) => `montage:${entree.id}`,
});

const STATUTS_VIDEO = ['prete', 'en_cours', 'bloquee', 'en_echec', 'sans_rendu'] as const;
type StatutVideo = (typeof STATUTS_VIDEO)[number];
const JOUR = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/** Le statut d'une vidéo se lit sur son rendu allégé le plus récent, à défaut sur son rendu le plus récent. */
export function statutVideo(rendus: readonly Rendu[]): StatutVideo {
  const tries = [...rendus].sort((a, b) => b.creeLe.getTime() - a.creeLe.getTime());
  const r = tries.find((x) => x.genre === 'allege') ?? tries[0];
  if (r === undefined) return 'sans_rendu';
  return r.etat === 'pret' ? 'prete' : r.etat === 'bloque' ? 'bloquee' : r.etat === 'echec' ? 'en_echec' : 'en_cours';
}

/**
 * Ma bibliothèque de vidéos (histoire 3.9, FR-45, FR-47) : la dernière version de chaque vidéo, filtrable par statut,
 * par période (jours en heure de Paris, bornes comprises) et par archivage. Le filtre par réseau attend les publications.
 */
export const montageBibliotheque = definirAction({
  domaine: 'montage',
  verbe: 'bibliotheque',
  description: 'Liste ta bibliothèque de vidéos : la dernière version de chaque vidéo avec son statut (`prete`, `en_cours`, `bloquee`, `en_echec`, `sans_rendu`, lu sur le rendu allégé le plus récent) et sa date d’archivage. Filtres : `statut`, `depuis` et `jusqua` (jours AAAA-MM-JJ en heure de Paris, bornes comprises, sur la date de la dernière version), `archivees` (`exclure` par défaut, `inclure` ou `seulement`), `espaceId`. La plus récente d’abord ; 200 vidéos au plus.',
  portee: 'lecture',
  entree: z.strictObject({
    statut: z.enum(STATUTS_VIDEO).optional(),
    depuis: JOUR.optional(),
    jusqua: JOUR.optional(),
    archivees: z.enum(['exclure', 'inclure', 'seulement']).default('exclure'),
    espaceId: identifiant.optional(),
  }),
  executer: async (ctx, entree) => {
    const debut = entree.depuis === undefined ? undefined : debutDeJourParis(entree.depuis);
    const fin = entree.jusqua === undefined ? undefined : debutDeJourParis(prochainJour(entree.jusqua));
    if ((entree.depuis !== undefined && debut === undefined) || (entree.jusqua !== undefined && fin === undefined)) throw new ErreurMetier('PERIODE_INVALIDE', 422, {});
    if (debut !== undefined && fin !== undefined && debut >= fin) throw new ErreurMetier('PERIODE_INVALIDE', 422, {});
    const toutes = await ctx.services.montages.bibliotheque(ctx.marqueId, ctx.utilisateurId, entree.espaceId === undefined ? {} : { espaceId: entree.espaceId });
    const videos = toutes
      .filter((e) => ctx.espaceIds === undefined || ctx.espaceIds.includes(e.montage.espaceId))
      .map((e) => ({ ...e, statut: statutVideo(e.rendus) }))
      .filter((e) => entree.statut === undefined || e.statut === entree.statut)
      .filter((e) => (debut === undefined || e.montage.creeLe >= debut) && (fin === undefined || e.montage.creeLe < fin))
      .filter((e) => (entree.archivees === 'inclure' ? true : entree.archivees === 'seulement' ? e.archiveeLe !== null : e.archiveeLe === null));
    return {
      videos: videos.map((e) => ({ montage: montageVisible(e.montage), statut: e.statut, archiveeLe: e.archiveeLe?.toISOString() ?? null })),
    };
  },
  objet: () => 'montage',
});

export const montageArchiver = definirAction({
  domaine: 'montage',
  verbe: 'archiver',
  description: 'Archive une vidéo (toutes ses versions) ou la sort des archives (`archivee` faux). Rien n’est effacé : une vidéo archivée disparaît seulement de la bibliothèque par défaut, avec ses rendus, sa légende et ses fichiers. Rappeler l’action ne change rien.',
  portee: 'ecriture',
  entree: z.strictObject({ id: identifiant, archivee: z.boolean() }),
  executer: async (ctx, entree) => {
    const m = await montageAccessible(ctx, entree.id);
    const ok = await ctx.services.montages.archiver(ctx.marqueId, ctx.utilisateurId, m.serieId, entree.archivee);
    if (!ok) throw new ErreurMetier('MONTAGE_INTROUVABLE', 404, { id: entree.id });
    return { serieId: m.serieId, archivee: entree.archivee };
  },
  objet: (entree) => `montage:${entree.id}`,
});

/**
 * Supprimer une vidéo (histoire 3.9, FR-46, AR-12) : toutes ses versions, ses rendus, ses voix, sa légende et leurs
 * fichiers. Irréversible, donc `confirmer: true` obligatoire. Une vidéo publiée n'est pas supprimée : on propose d'archiver.
 */
export const montageSupprimer = definirAction({
  domaine: 'montage',
  verbe: 'supprimer',
  description: 'Supprime définitivement une vidéo : toutes ses versions, ses rendus, ses voix, sa légende et les fichiers (octets effacés du disque). Irréversible : `confirmer` doit valoir vrai. Refusé (VIDEO_PUBLIEE) tant qu’une publication de cette vidéo est en cours d’envoi, publiée ou d’état incertain : archive-la plutôt.',
  portee: 'ecriture',
  entree: z.strictObject({ id: identifiant, confirmer: z.literal(true) }),
  executer: async (ctx, entree) => {
    const m = await montageAccessible(ctx, entree.id);
    if (await ctx.services.montages.aPublicationPubliee(ctx.marqueId, ctx.utilisateurId, m.serieId)) throw new ErreurMetier('VIDEO_PUBLIEE', 409, { id: entree.id });
    let r;
    try {
      r = await ctx.services.montages.supprimerVideo(ctx.marqueId, ctx.utilisateurId, m.serieId);
    } catch (e) {
      // Une publication est partie entre le contrôle et le verrou : reconnue par son nom (pas d'instanceof entre dist et src).
      if (e instanceof Error && e.name === 'ErreurVideoPubliee') throw new ErreurMetier('VIDEO_PUBLIEE', 409, { id: entree.id });
      throw e;
    }
    if (r === undefined) throw new ErreurMetier('MONTAGE_INTROUVABLE', 404, { id: entree.id });
    // La base est déjà à jour (une seule transaction) : un fichier qui résiste est signalé, pas une raison d'échouer.
    let nonSupprimes = 0;
    for (const f of r.fichiers) {
      try {
        await ctx.services.stockage.supprimer(ctx.marqueId, f.id);
      } catch {
        nonSupprimes += 1;
      }
    }
    return { serieId: m.serieId, supprimee: true, fichiersSupprimes: r.fichiers.length - nonSupprimes, fichiersNonSupprimes: nonSupprimes };
  },
  objet: (entree) => `montage:${entree.id}`,
});

export const ACTIONS_MONTAGE = [montageLister, montageLire, montageSousTitres, montageDefinirVoix, montageEditer, montageRegenerer, montageRegenererGabarit, montageCouvertures, montageCouvrir, montageLegende, montageLegender, montageTelecharger, montageBibliotheque, montageArchiver, montageSupprimer, renduLire, renduAdresse] as const;
