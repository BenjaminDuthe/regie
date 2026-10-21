// regie — la vue d'une tâche pour la personne qui l'a lancée (histoire 2.5) : état, étape, position dans la file,
// fin estimée, cause et action en cas d'échec. Même vue pour l'interface, l'API, le MCP et le flux en direct.

import type { Services } from '../auth/services.ts';
import type { Tache, Tentative } from '../infra/file.ts';
import { estimer, type Estimation } from './estimation.ts';
import { heureEnClair } from './horaires.ts';

export type VueTache = Readonly<{
  id: string;
  /** Étape : le type de la tâche (capture, rendu, montage…). */
  etape: string;
  etat: Tache['etat'];
  /** 0 : en cours ; 1 : la prochaine ; null hors de la file. */
  position: number | null;
  finEstimee: string | null;
  /** « vers 18 h 40 » : une estimation, pas une promesse. */
  finEstimeeEnClair: string | null;
  tentative: number;
  tentativesMax: number;
  cause: string | null;
  action: string | null;
  creeLe: string;
  termineeLe: string | null;
  /** Historique des tentatives, pour une tâche échouée (ou lue seule) ; `null` sinon. */
  tentatives: VueTentative[] | null;
}>;

export type VueTentative = Readonly<{ numero: number; debut: string; fin: string | null; issue: string; cause: string | null }>;

export function vueTache(t: Tache, estimation: Estimation | undefined, maintenant: Date, historique?: readonly Tentative[]): VueTache {
  return {
    id: t.id,
    etape: t.type,
    etat: t.etat,
    position: estimation?.position ?? null,
    finEstimee: estimation?.finLe.toISOString() ?? null,
    finEstimeeEnClair: estimation === undefined ? null : heureEnClair(estimation.finLe, maintenant),
    tentative: t.tentatives,
    tentativesMax: t.tentativesMax,
    cause: t.cause ?? null,
    action: t.action ?? null,
    creeLe: t.creeLe.toISOString(),
    termineeLe: t.termineeLe?.toISOString() ?? null,
    tentatives: historique === undefined ? null : historique.map(vueTentative),
  };
}

export function vueTentative(t: Tentative): VueTentative {
  return { numero: t.numero, debut: t.debut.toISOString(), fin: t.fin?.toISOString() ?? null, issue: t.issue, cause: t.cause ?? null };
}

/** Nombre de tâches affichées : les dernières de la personne. */
export const LIMITE_TACHES = 50;

/** Les dernières tâches de la personne, avec position et fin estimée pour celles qui sont dans la file. */
export async function suivreTaches(services: Services, marqueId: string, utilisateurId: string): Promise<VueTache[]> {
  const maintenant = new Date(services.maintenant());
  const [miennes, file, durees] = await Promise.all([services.file.lister(marqueId, utilisateurId, LIMITE_TACHES), services.file.instantane(marqueId), services.file.durees(marqueId)]);
  const estimations = estimer(file, durees, maintenant);
  // L'historique des tentatives accompagne les tâches échouées : de quoi décider de relancer en connaissance de cause.
  const historiques = new Map(await Promise.all(miennes.filter((t) => t.etat === 'echouee').map(async (t) => [t.id, await services.file.historique(marqueId, utilisateurId, t.id)] as const)));
  return miennes.map((t) => vueTache(t, estimations.get(t.id), maintenant, historiques.get(t.id)));
}

/** Une tâche de la personne et son historique de tentatives ; `undefined` si elle n'est pas à elle. */
export async function suivreUneTache(services: Services, marqueId: string, utilisateurId: string, id: string): Promise<(VueTache & { tentatives: VueTentative[] }) | undefined> {
  const t = await services.file.lire(marqueId, utilisateurId, id);
  if (t === undefined) return undefined;
  const maintenant = new Date(services.maintenant());
  const [file, durees, historique] = await Promise.all([services.file.instantane(marqueId), services.file.durees(marqueId), services.file.historique(marqueId, utilisateurId, id)]);
  return { ...vueTache(t, estimer(file, durees, maintenant).get(t.id), maintenant, historique), tentatives: historique.map(vueTentative) };
}
