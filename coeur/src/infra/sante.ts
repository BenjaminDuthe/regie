// regie — état de santé pour /sante : base, coffre, disque. Sans authentification, donc sans aucune
// donnée d'utilisateur ni message d'erreur détaillé (AR-24). File, dernière sauvegarde et GPU
// s'ajoutent avec les histoires qui les créent.

import { statfs } from 'node:fs/promises';
import type { Pool } from 'pg';
import { Coffre, ErreurCoffre, verifierTemoin } from './coffre.ts';

export type EtatElement = 'ok' | 'ko' | 'indisponible';
export type Sante = Readonly<{
  etat: 'ok' | 'degrade';
  base: EtatElement;
  coffre: EtatElement;
  disque: Readonly<{ etat: 'ok' | 'bas' | 'ko'; libre_pourcent: number | null }>;
}>;

/** Sous 15 % d'espace libre, l'alerte du socle (AD-20) se déclenche. */
export const SEUIL_DISQUE_LIBRE_POURCENT = 15;

export async function mesurerDisque(chemin: string): Promise<Sante['disque']> {
  try {
    const stats = await statfs(chemin);
    const libre = stats.blocks === 0 ? 0 : Math.round((stats.bavail / stats.blocks) * 100);
    return { etat: libre < SEUIL_DISQUE_LIBRE_POURCENT ? 'bas' : 'ok', libre_pourcent: libre };
  } catch {
    return { etat: 'ko', libre_pourcent: null };
  }
}

export type SourcesSante = Readonly<{ pool: Pool; coffre: Coffre }>;

export async function calculerSante(sources: SourcesSante | undefined, cheminDisque: string): Promise<Sante> {
  const disque = await mesurerDisque(cheminDisque);
  let base: EtatElement = 'indisponible';
  let coffre: EtatElement = 'indisponible';
  if (sources !== undefined) {
    try {
      const { rows } = await sources.pool.query<{ chiffre: Buffer }>('SELECT chiffre FROM coffre_temoin');
      base = 'ok';
      const temoin = rows[0];
      coffre = 'ko';
      if (temoin !== undefined) {
        try {
          verifierTemoin(sources.coffre, temoin.chiffre);
          coffre = 'ok';
        } catch (erreur) {
          if (!(erreur instanceof ErreurCoffre)) throw erreur;
        }
      }
    } catch {
      base = 'ko';
    }
  }
  const sain = base === 'ok' && coffre === 'ok' && disque.etat === 'ok';
  return { etat: sain ? 'ok' : 'degrade', base, coffre, disque };
}
