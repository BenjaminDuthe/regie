// regie — légende et hashtags d'une vidéo pour un réseau (histoire 3.7, FR-38, UX-DR13). Module pur : normalise les
// hashtags, applique les bornes du réseau (deploiement/bornes.json) et propose une légende de départ. Aucune borne ne
// se force : un dépassement est refusé, jamais tronqué en silence.

import type { Timeline } from '@regie/contrats';
import { BORNES, RESEAUX, type BornesLegende, type Reseau } from './bornes.ts';

export { RESEAUX, type Reseau };

/** Les bornes d'un réseau ; un réseau absent du fichier retombe sur les défauts (jamais sans borne). */
export const bornesDuReseau = (reseau: Reseau): BornesLegende => BORNES.reseaux[reseau] ?? BORNES.defauts;

export const HASHTAG_LONGUEUR_MAX = 60;
const MOTIF_HASHTAG = /^[\p{L}\p{N}_]+$/u;

export type CodeLegende = 'LEGENDE_TROP_LONGUE' | 'TROP_DE_HASHTAGS' | 'HASHTAG_INVALIDE';
export type RefusLegende = Readonly<{ code: CodeLegende; contexte: Readonly<Record<string, string | number>> }>;
export type LegendeVerifiee = Readonly<{ legende: string; hashtags: readonly string[] }>;

/** Nombre de caractères tels que le réseau les compte (points de code, pas unités UTF-16). */
export const longueur = (texte: string): number => [...texte].length;

/** Nettoie la légende : retours à la ligne unifiés, caractères de contrôle ôtés, espaces de bord retirés. */
export function nettoyerLegende(brut: string): string {
  const unifie = brut.replace(/\r\n?/g, '\n');
  // Hors retour à la ligne : aucun caractère de contrôle ni de formatage invisible dans une légende.
  return unifie.replace(/[\p{Cc}\p{Cf}]/gu, (c) => (c === '\n' ? c : '')).trim();
}

/** « #Cuisine » → « cuisine » ; vide si rien ne reste. Les doublons (casse comprise) se retirent ensuite. */
export const normaliserHashtag = (brut: string): string => brut.trim().replace(/^#+/, '').trim().toLowerCase();

/** Applique les bornes du réseau : `{ ok }` avec la légende et les hashtags propres, ou le premier refus nommant la borne. */
export function verifierLegende(reseau: Reseau, legende: string, hashtags: readonly string[]): { ok: true; valeur: LegendeVerifiee } | { ok: false; refus: RefusLegende } {
  const bornes = bornesDuReseau(reseau);
  const propre = nettoyerLegende(legende);
  if (longueur(propre) > bornes.legendeMaxCaracteres) return { ok: false, refus: { code: 'LEGENDE_TROP_LONGUE', contexte: { reseau, max: bornes.legendeMaxCaracteres, actuel: longueur(propre) } } };
  const vus = new Set<string>();
  for (const brut of hashtags) {
    const h = normaliserHashtag(brut);
    if (h === '' || longueur(h) > HASHTAG_LONGUEUR_MAX || !MOTIF_HASHTAG.test(h)) return { ok: false, refus: { code: 'HASHTAG_INVALIDE', contexte: { hashtag: brut.slice(0, 40), max: HASHTAG_LONGUEUR_MAX } } };
    vus.add(h);
  }
  if (vus.size > bornes.hashtagsMax) return { ok: false, refus: { code: 'TROP_DE_HASHTAGS', contexte: { reseau, max: bornes.hashtagsMax, actuel: vus.size } } };
  return { ok: true, valeur: { legende: propre, hashtags: [...vus] } };
}

/** La légende proposée tant que rien n'est enregistré : l'accroche de la première scène, au plus long que le réseau permet. */
export function legendeProposee(timeline: Timeline, reseau: Reseau): LegendeVerifiee {
  const accroche = timeline.scenes[0]?.accroche ?? '';
  return { legende: [...nettoyerLegende(accroche)].slice(0, bornesDuReseau(reseau).legendeMaxCaracteres).join(''), hashtags: [] };
}
