// regie — opérations d'édition d'un montage (histoires 3.10 et 3.11).
// Pures et sans effet : le navigateur, l'API et le MCP appliquent la même liste d'opérations à une timeline, et le
// résultat est revalidé par le schéma. L'enregistrement crée ensuite une nouvelle version immuable du montage.

import { z } from 'zod';
import {
  CarteFin,
  IdScene,
  SCENES_MAX,
  Timeline,
  deplacerScene,
  dupliquerScene,
  retirerScene,
  type SceneMontage,
} from './timeline.ts';

const texte = (max: number) => z.string().trim().max(max);

export const OperationEdition = z.discriminatedUnion('op', [
  /** Change un ou plusieurs textes d'une scène (ceux qui sont absents ne bougent pas). */
  z.strictObject({
    op: z.literal('texte'),
    sceneId: IdScene,
    accroche: texte(80).optional(),
    texteEcran: texte(120).optional(),
    voix: texte(500).optional(),
  }),
  /** Change la durée à l'écran d'une scène, en millisecondes. */
  z.strictObject({ op: z.literal('duree'), sceneId: IdScene, dureeMs: z.number().int().min(1).max(3_600_000) }),
  z.strictObject({ op: z.literal('deplacer'), sceneId: IdScene, sens: z.enum(['monter', 'descendre']) }),
  z.strictObject({ op: z.literal('dupliquer'), sceneId: IdScene }),
  z.strictObject({ op: z.literal('retirer'), sceneId: IdScene }),
  /** Pose ou change la carte de fin ; `null` la retire. */
  z.strictObject({
    op: z.literal('carte_fin'),
    titre: texte(60).optional(),
    sousTitre: texte(80).optional(),
    dureeMs: z.number().int().min(1).max(3_600_000).optional(),
    retirer: z.boolean().optional(),
  }),
]);
export type OperationEdition = z.infer<typeof OperationEdition>;

export const OPERATIONS_MAX = 50;
export const OperationsEdition = z.array(OperationEdition).min(1).max(OPERATIONS_MAX);

/** Les causes de refus du schéma, dites en français. */
const CAUSES: Readonly<Record<string, string>> = {
  VITESSE_HORS_LIMITES: 'la durée donne une vitesse hors limites : la scène ne peut pas aller plus de deux fois plus vite, ni plus de quatre fois plus lentement, que le film tourné',
  SEGMENT_VIDE: 'le segment du film montré est vide',
  APRES_LE_FILM: 'le segment dépasse la fin du film',
  ID_EN_DOUBLE: 'deux scènes ont le même identifiant',
};
const dire = (message: string): string => CAUSES[message] ?? message;

export type ResultatEdition =
  | Readonly<{ ok: true; timeline: Timeline }>
  | Readonly<{ ok: false; code: 'SCENE_INTROUVABLE' | 'DERNIERE_SCENE' | 'TROP_DE_SCENES' | 'TIMELINE_INVALIDE'; sceneId?: string; detail?: string }>;

const CARTE_FIN_PAR_DEFAUT: CarteFin = Object.freeze({
  titre: '',
  sousTitre: '',
  dureeMs: 3000,
  animation: Object.freeze({ entree: 'fondu', sortie: 'aucune', dureeMs: 400, delaiMs: 0 }),
}) as CarteFin;

const changerScene = (t: Timeline, id: string, f: (s: SceneMontage) => SceneMontage): Timeline | undefined =>
  t.scenes.some((s) => s.id === id) ? { ...t, scenes: t.scenes.map((s) => (s.id === id ? f(s) : s)) } : undefined;

/** Applique les opérations dans l'ordre. La première qui échoue arrête tout : rien n'est appliqué à moitié. */
export function appliquerOperations(base: Timeline, operations: readonly OperationEdition[]): ResultatEdition {
  let t: Timeline = base;
  for (const o of operations) {
    let suite: Timeline | undefined;
    switch (o.op) {
      case 'texte':
        suite = changerScene(t, o.sceneId, (s) => ({
          ...s,
          accroche: o.accroche ?? s.accroche,
          texteEcran: o.texteEcran ?? s.texteEcran,
          voix: o.voix ?? s.voix,
        }));
        break;
      case 'duree':
        suite = changerScene(t, o.sceneId, (s) => ({ ...s, dureeMs: o.dureeMs }));
        break;
      case 'deplacer':
        suite = deplacerScene(t, o.sceneId, o.sens);
        break;
      case 'dupliquer':
        if (t.scenes.length >= SCENES_MAX && t.scenes.some((s) => s.id === o.sceneId)) return { ok: false, code: 'TROP_DE_SCENES', sceneId: o.sceneId };
        suite = dupliquerScene(t, o.sceneId);
        break;
      case 'retirer':
        if (t.scenes.length <= 1 && t.scenes.some((s) => s.id === o.sceneId)) return { ok: false, code: 'DERNIERE_SCENE', sceneId: o.sceneId };
        suite = retirerScene(t, o.sceneId);
        break;
      case 'carte_fin': {
        if (o.retirer === true) {
          suite = { ...t, carteFin: null };
          break;
        }
        const carte = t.carteFin ?? CARTE_FIN_PAR_DEFAUT;
        suite = {
          ...t,
          carteFin: { ...carte, titre: o.titre ?? carte.titre, sousTitre: o.sousTitre ?? carte.sousTitre, dureeMs: o.dureeMs ?? carte.dureeMs },
        };
        break;
      }
    }
    if (suite === undefined) {
      const sceneId = 'sceneId' in o ? o.sceneId : undefined;
      return sceneId === undefined ? { ok: false, code: 'TIMELINE_INVALIDE' } : { ok: false, code: 'SCENE_INTROUVABLE', sceneId };
    }
    t = suite;
  }
  const valide = Timeline.safeParse(t);
  if (!valide.success) {
    const probleme = valide.error.issues[0];
    const chemin = probleme?.path ?? [];
    const indice = chemin[0] === 'scenes' && typeof chemin[1] === 'number' ? chemin[1] : undefined;
    const sceneId = indice === undefined ? undefined : t.scenes[indice]?.id;
    return {
      ok: false,
      code: 'TIMELINE_INVALIDE',
      ...(sceneId === undefined ? {} : { sceneId }),
      detail: dire(probleme?.message ?? ''),
    };
  }
  return { ok: true, timeline: valide.data };
}
