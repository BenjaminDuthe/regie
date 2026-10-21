// regie — format des scripts de démo (histoire 4.4, FR-14, FR-47). Un script est une suite d'étapes que la capture
// rejoue dans le navigateur isolé : aller, cliquer, saisir, attendre, connexion, filmer, plus survoler, faire défiler,
// pause et narration. Module pur, partagé par le cœur (éditeur, API, MCP) et la capture (histoire 4.5). Chaque étape
// est un objet strict : un champ inconnu est une erreur, pas un champ ignoré. Les causes d'erreur sont des codes
// stables ; les messages en français vivent dans `coeur/src/chaines.json`.

import { z } from 'zod';
import { hoteDeUrl, hoteAutorise } from './hotes.ts';

export const ETAPES_MAX_PAR_SCRIPT = 100;
export const ORIGINES_SCRIPT = ['claude', 'parcours', 'test_importe'] as const;
export type OrigineScript = (typeof ORIGINES_SCRIPT)[number];

/** Une cible est le texte visible d'un élément, ou un sélecteur CSS précédé de `css=`. */
const cible = z.string().trim().min(1).max(300);

const aller = z.strictObject({
  verbe: z.literal('aller'),
  url: z.string().trim().max(2000).refine((u) => hoteDeUrl(u) !== undefined, { error: 'URL_REFUSEE' }),
});
const cliquer = z.strictObject({ verbe: z.literal('cliquer'), cible });
const saisir = z.strictObject({ verbe: z.literal('saisir'), cible, valeur: z.string().max(500) });
const attendre = z.strictObject({ verbe: z.literal('attendre'), cible });
const connexion = z.strictObject({ verbe: z.literal('connexion') });
const filmer = z.strictObject({ verbe: z.literal('filmer'), mode: z.enum(['demarrer', 'arreter']) });
const survoler = z.strictObject({ verbe: z.literal('survoler'), cible });
const defiler = z.strictObject({ verbe: z.literal('defiler'), cible: cible.optional(), pixels: z.number().int().min(-5000).max(5000).optional() });
const pause = z.strictObject({ verbe: z.literal('pause'), secondes: z.number().min(0.1).max(30) });
const narration = z.strictObject({ verbe: z.literal('narration'), texte: z.string().trim().min(1).max(500) });

export const EtapeScript = z.discriminatedUnion('verbe', [aller, cliquer, saisir, attendre, connexion, filmer, survoler, defiler, pause, narration]);
export type EtapeScript = z.infer<typeof EtapeScript>;
export const VERBES_SCRIPT = ['aller', 'cliquer', 'saisir', 'attendre', 'connexion', 'filmer', 'survoler', 'defiler', 'pause', 'narration'] as const;
export type VerbeScript = (typeof VERBES_SCRIPT)[number];

/** Un « filmer arrêter » suit toujours un « filmer démarrer » ; on ne démarre pas deux fois. */
function coherence(etapes: readonly EtapeScript[], ctx: z.RefinementCtx): void {
  let enCours = false;
  etapes.forEach((e, i) => {
    if (e.verbe !== 'filmer') return;
    if (e.mode === 'demarrer') {
      if (enCours) ctx.addIssue({ code: 'custom', path: [i, 'mode'], message: 'FILMER_DEJA_EN_COURS' });
      enCours = true;
    } else {
      if (!enCours) ctx.addIssue({ code: 'custom', path: [i, 'mode'], message: 'FILMER_SANS_DEBUT' });
      enCours = false;
    }
  });
}

export const EtapesScript = z.array(EtapeScript).max(ETAPES_MAX_PAR_SCRIPT).superRefine(coherence);
export const NomScript = z.string().trim().min(1).max(80);

/** Résultat du dernier jeu d'un script (histoire 4.5 l'écrit ; 4.4 l'affiche). */
export const DernierJeu = z.discriminatedUnion('etat', [
  z.strictObject({ etat: z.literal('reussi'), jouLe: z.iso.datetime() }),
  z.strictObject({
    etat: z.literal('echec'),
    /** Numéro de l'étape en échec, à partir de 1. */
    etape: z.number().int().min(1).max(ETAPES_MAX_PAR_SCRIPT),
    cause: z.string().max(300),
    /** Capture PNG de la page au moment de l'échec, en base64. */
    capture: z.string().regex(/^[A-Za-z0-9+/]+={0,2}$/).max(270_000).optional(),
    jouLe: z.iso.datetime(),
  }),
  z.strictObject({ etat: z.literal('hote_refuse'), hote: z.string().max(253), etape: z.number().int().min(1).max(ETAPES_MAX_PAR_SCRIPT).optional(), jouLe: z.iso.datetime() }),
]);
export type DernierJeu = z.infer<typeof DernierJeu>;

export type CauseEtape = 'VERBE_INCONNU' | 'CHAMP_MANQUANT' | 'CHAMP_INCONNU' | 'VALEUR_INVALIDE' | 'URL_REFUSEE' | 'FILMER_DEJA_EN_COURS' | 'FILMER_SANS_DEBUT' | 'TROP_D_ETAPES';
export type ErreurEtape = Readonly<{ etape: number; verbe: string | undefined; champ: string | undefined; cause: CauseEtape }>;

/** Traduit les erreurs de zod en erreurs par étape (numéro à partir de 1, verbe, champ, cause). `chemin` mène aux étapes dans l'entrée. */
export function erreursParEtape(erreur: z.ZodError, entree: unknown, chemin: readonly string[] = ['etapes']): ErreurEtape[] {
  let etapes: unknown = entree;
  for (const c of chemin) etapes = (etapes as Record<string, unknown> | undefined)?.[c];
  const liste = Array.isArray(etapes) ? (etapes as unknown[]) : [];
  const vues = new Set<string>();
  const sortie: ErreurEtape[] = [];
  const ajouter = (e: ErreurEtape): void => {
    const cle = `${e.etape}/${e.champ ?? ''}/${e.cause}`;
    if (!vues.has(cle)) {
      vues.add(cle);
      sortie.push(e);
    }
  };
  for (const issue of erreur.issues) {
    const debut = chemin.length;
    const chemins = issue.path.slice(debut);
    const indice = chemins[0];
    if (typeof indice !== 'number') {
      if (issue.code === 'too_big') ajouter({ etape: ETAPES_MAX_PAR_SCRIPT + 1, verbe: undefined, champ: undefined, cause: 'TROP_D_ETAPES' });
      continue;
    }
    const brute = liste[indice];
    const verbe = typeof brute === 'object' && brute !== null && typeof (brute as { verbe?: unknown }).verbe === 'string' ? ((brute as { verbe: string }).verbe) : undefined;
    const base = { etape: indice + 1, verbe };
    const champ = chemins[1] === undefined ? undefined : String(chemins[1]);
    if (issue.code === 'unrecognized_keys') {
      for (const k of issue.keys) ajouter({ ...base, champ: k, cause: 'CHAMP_INCONNU' });
    } else if (issue.code === 'invalid_union' || (champ === 'verbe' && issue.code !== 'custom')) {
      ajouter({ ...base, champ: 'verbe', cause: 'VERBE_INCONNU' });
    } else if (issue.code === 'invalid_type' && champ !== undefined && (brute as Record<string, unknown> | undefined)?.[champ] === undefined) {
      ajouter({ ...base, champ, cause: 'CHAMP_MANQUANT' });
    } else if (issue.code === 'invalid_type' && champ === undefined) {
      ajouter({ ...base, verbe: undefined, champ: undefined, cause: 'VERBE_INCONNU' });
    } else if (issue.code === 'custom' && (issue.message === 'FILMER_DEJA_EN_COURS' || issue.message === 'FILMER_SANS_DEBUT' || issue.message === 'URL_REFUSEE')) {
      ajouter({ ...base, champ, cause: issue.message });
    } else {
      ajouter({ ...base, champ, cause: 'VALEUR_INVALIDE' });
    }
  }
  return sortie;
}

/** L'hôte visé par une étape `aller` ; `undefined` pour les autres étapes. */
export const hoteVise = (e: EtapeScript): string | undefined => (e.verbe === 'aller' ? hoteDeUrl(e.url) : undefined);

/** La première étape qui vise un hôte hors liste (numéro à partir de 1), ou `undefined` si tout est déclaré. */
export function premierHoteRefuse(etapes: readonly EtapeScript[], autorises: readonly string[]): Readonly<{ etape: number; hote: string }> | undefined {
  for (const [i, e] of etapes.entries()) {
    const h = hoteVise(e);
    if (h !== undefined && !hoteAutorise(h, autorises)) return { etape: i + 1, hote: h };
  }
  return undefined;
}
