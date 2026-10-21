// regie — les actions des montages et de leurs rendus (histoires 4.6, 2.12, FR-26, FR-28). Une seule écriture pour
// l'interface, l'API (`/api/v1/montage/<verbe>`, `/api/v1/rendu/<verbe>`) et le MCP. Un montage est une version
// immuable : on le lit, on ne le modifie pas (la modification crée une version, histoire 3.10).

import { z } from 'zod';
import { IdScene, SCENES_MAX, dureeTotaleMs, sousTitres, versSrt } from '@regie/contrats';
import { signerAdresse } from '../auth/adresses-signees.ts';
import type { Violation } from '../domaine/gardes.ts';
import type { Montage, Rendu } from '../infra/montages.ts';
import { decrireViolation } from './actions-gabarit.ts';
import { ErreurMetier } from './erreurs.ts';
import { definirAction, type ContexteAction } from './registre.ts';
import { lancerRendu } from './rendu.ts';
import { lancerVoix } from './voix.ts';

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

const phrases = (violations: readonly Violation[]) => violations.map((v) => ({ ...v, phrase: decrireViolation(v) }));

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

export const ACTIONS_MONTAGE = [montageLister, montageLire, montageSousTitres, montageDefinirVoix, renduLire, renduAdresse] as const;
