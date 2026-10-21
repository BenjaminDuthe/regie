// regie — état de santé pour /sante : base, coffre, disque. Sans authentification, donc sans aucune
// donnée d'utilisateur ni message d'erreur détaillé (AR-24). File, dernière sauvegarde et GPU
// s'ajoutent avec les histoires qui les créent.

import { readFile, statfs } from 'node:fs/promises';
import { join } from 'node:path';
import type { Pool } from 'pg';
import { Coffre, ErreurCoffre, verifierTemoin } from './coffre.ts';

export type EtatElement = 'ok' | 'ko' | 'indisponible';
/** Âge d'une sauvegarde : jamais de chemin ni de nom de machine, seulement l'état et l'âge (NFR-41). */
export type EtatSauvegarde = Readonly<{ etat: 'ok' | 'ancienne' | 'absente' | 'illisible'; age_heures: number | null }>;
export type Sante = Readonly<{
  etat: 'ok' | 'degrade';
  mode: 'normal' | 'restauration';
  base: EtatElement;
  coffre: EtatElement;
  disque: Readonly<{ etat: 'ok' | 'bas' | 'ko'; libre_pourcent: number | null }>;
  /** Absente de la réponse tant qu'aucun fichier d'état n'est configuré (poste de développement). */
  sauvegarde?: Readonly<{ base: EtatSauvegarde; vzdump: EtatSauvegarde }>;
}>;

/** Un dump nocturne de plus de 36 h, ou un vzdump hebdomadaire de plus de 9 jours, rend /sante « dégradé ». */
export const AGE_MAX_BASE_HEURES = 36;
export const AGE_MAX_VZDUMP_HEURES = 9 * 24;

const HORODATAGE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;

function evaluer(valeur: unknown, maintenant: number, maxHeures: number): EtatSauvegarde {
  if (valeur === undefined || valeur === null) return { etat: 'absente', age_heures: null };
  if (typeof valeur !== 'string' || !HORODATAGE.test(valeur) || Number.isNaN(Date.parse(valeur))) return { etat: 'illisible', age_heures: null };
  const age = Math.max(0, (maintenant - Date.parse(valeur)) / 3_600_000);
  return { etat: age > maxHeures ? 'ancienne' : 'ok', age_heures: Math.round(age * 10) / 10 };
}

/**
 * Lit le dossier d'état des sauvegardes : `base_le` et `vzdump_le`, chacun une date UTC écrite par les scripts de
 * deploiement/sauvegarde/ après une copie réussie. Un fichier absent ou illisible n'est jamais « ok » : une sauvegarde
 * qu'on ne peut pas dater est une sauvegarde qui n'existe pas.
 */
export async function lireSauvegarde(dossier: string, maintenant: number): Promise<NonNullable<Sante['sauvegarde']>> {
  const lire = async (nom: string, maxHeures: number): Promise<EtatSauvegarde> => {
    try {
      return evaluer((await readFile(join(dossier, nom), 'utf8')).trim(), maintenant, maxHeures);
    } catch (erreur) {
      return (erreur as NodeJS.ErrnoException).code === 'ENOENT' ? { etat: 'absente', age_heures: null } : { etat: 'illisible', age_heures: null };
    }
  };
  return { base: await lire('base_le', AGE_MAX_BASE_HEURES), vzdump: await lire('vzdump_le', AGE_MAX_VZDUMP_HEURES) };
}

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

export type OptionsSante = Readonly<{ mode?: 'normal' | 'restauration'; dossierSauvegarde?: string; maintenant?: number }>;

export async function calculerSante(sources: SourcesSante | undefined, cheminDisque: string, options: OptionsSante = {}): Promise<Sante> {
  const mode = options.mode ?? 'normal';
  const sauvegarde = options.dossierSauvegarde === undefined ? undefined : await lireSauvegarde(options.dossierSauvegarde, options.maintenant ?? Date.now());
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
  // En mode restauration, la sauvegarde qu'on vérifie est par définition celle qu'on a restaurée : son âge ne dégrade rien.
  const sauvegardeSaine = sauvegarde === undefined || mode === 'restauration' || (sauvegarde.base.etat === 'ok' && sauvegarde.vzdump.etat === 'ok');
  const sain = base === 'ok' && coffre === 'ok' && disque.etat === 'ok' && sauvegardeSaine;
  return { etat: sain ? 'ok' : 'degrade', mode, base, coffre, disque, ...(sauvegarde === undefined ? {} : { sauvegarde }) };
}
