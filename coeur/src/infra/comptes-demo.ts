// regie — compte de démonstration d'une application (histoire 4.3, FR-14, AD-9). Identifiant et mot de passe vivent
// UNIQUEMENT dans le coffre chiffré (type `compte_demo`, un par application) : ils ne se réaffichent jamais, ne
// s'écrivent dans aucun journal, et ne se lisent que par la passerelle de secrets (tâche en cours, matrice de droits).
// Cette interface n'offre donc que deux gestes : remplacer, et savoir si un compte est déposé.

import type { Pool } from 'pg';
import type { Coffre } from './coffre.ts';
import { dateSecret, remplacerSecret, supprimerSecret } from './base.ts';

export const TYPE_SECRET_COMPTE_DEMO = 'compte_demo';
export const nomSecretCompteDemo = (applicationId: string): string => `application:${applicationId}`;

export type CompteDemo = Readonly<{ identifiant: string; motDePasse: string }>;
/** La cible à laquelle le compte est lié au dépôt : l'adresse d'accueil et la liste des hôtes de l'application. */
export type CibleCompte = Readonly<{ accueil: string; hotes: readonly string[] }>;
export type CompteLu = CompteDemo & Readonly<{ cible: CibleCompte | undefined }>;

/** Longueur minimale d'un mot de passe de démonstration (assez long pour être détecté sans faux positifs dans une sortie). */
export const MOT_DE_PASSE_MIN = 8;
export type EtatCompteDemo = Readonly<{ depose: boolean; modifieLe: Date | undefined }>;

export interface ComptesDemo {
  /** Dépose ou remplace le compte, lié à la cible de l'application. Rien d'autre ne peut l'écrire. */
  remplacer(marqueId: string, applicationId: string, compte: CompteDemo, cible: CibleCompte): Promise<void>;
  /** Supprime le compte déposé (la cible de l'application a changé). Rend vrai s'il y en avait un. */
  supprimer(marqueId: string, applicationId: string): Promise<boolean>;
  /** Un compte est-il déposé, et depuis quand ? Jamais son contenu. */
  etat(marqueId: string, applicationId: string): Promise<EtatCompteDemo>;
}

const hotesTries = (hotes: readonly string[]): string[] => [...hotes].sort();

export const serialiserCompte = (c: CompteDemo, cible: CibleCompte): string =>
  JSON.stringify({ identifiant: c.identifiant, motDePasse: c.motDePasse, accueil: cible.accueil, hotes: hotesTries(cible.hotes) });

/** Relit un compte sérialisé ; `undefined` si le contenu n'a pas la bonne forme. `cible` est absente d'un ancien dépôt. */
export function lireCompteSerialise(clair: string): CompteLu | undefined {
  try {
    const o = JSON.parse(clair) as Record<string, unknown>;
    if (typeof o['identifiant'] !== 'string' || typeof o['motDePasse'] !== 'string') return undefined;
    const hotes = o['hotes'];
    const cible: CibleCompte | undefined =
      typeof o['accueil'] === 'string' && Array.isArray(hotes) && hotes.every((h) => typeof h === 'string') ? { accueil: o['accueil'], hotes: hotesTries(hotes as string[]) } : undefined;
    return { identifiant: o['identifiant'], motDePasse: o['motDePasse'], cible };
  } catch {
    return undefined;
  }
}

/** Le compte a-t-il été déposé pour CETTE cible ? Une cible absente ou différente est refusée (fail-closed). */
export function compteLieA(compte: CompteLu, accueil: string, hotes: readonly string[]): boolean {
  const c = compte.cible;
  if (c === undefined || c.accueil !== accueil) return false;
  const voulus = hotesTries(hotes);
  return c.hotes.length === voulus.length && c.hotes.every((h, i) => h === voulus[i]);
}

const norm = (t: string): string => t.toLowerCase().replace(/\s+/g, '');

/** Les formes sous lesquelles un mot de passe peut se retrouver dans un texte brut : tel quel, JSON-échappé, base64. */
function formesBrutes(motDePasse: string): string[] {
  const o = Buffer.from(motDePasse, 'utf8');
  const b64 = o.toString('base64');
  return [motDePasse, JSON.stringify(motDePasse).slice(1, -1), b64, b64.replace(/=+$/, ''), o.toString('base64url')];
}

/**
 * Une sortie de conteneur cite-t-elle le mot de passe ? Contrôle le texte brut (tel quel, JSON-échappé, base64) puis,
 * après analyse JSON, chaque chaîne décodée, normalisée (casse, espaces) et dans ses formes JSON-échappée et base64.
 * Aucune exemption de longueur : un mot de passe vide ou blanc compte comme cité (refus par prudence).
 * `ignorer` : champs dont le contenu est binaire (miniature) et exclus du contrôle normalisé.
 */
export function sortieCiteMotDePasse(sortie: string, motDePasse: string, ignorer: readonly string[] = ['miniature', 'capture', 'video']): boolean {
  if (norm(motDePasse) === '') return true;
  if (formesBrutes(motDePasse).some((f) => f !== '' && sortie.includes(f))) return true;
  const voulu = norm(motDePasse);
  const voulues = [voulu, norm(JSON.stringify(motDePasse).slice(1, -1)), norm(Buffer.from(motDePasse, 'utf8').toString('base64'))];
  const cite = (texte: string): boolean => {
    const n = norm(texte);
    return voulues.some((v) => v !== '' && n.includes(v));
  };
  const parcourir = (v: unknown, cle: string | undefined): boolean => {
    if (typeof v === 'string') return cle !== undefined && ignorer.includes(cle) ? false : cite(v) || cite(v.replace(/\\(.)/g, '$1'));
    if (Array.isArray(v)) return v.some((x) => parcourir(x, cle));
    if (typeof v === 'object' && v !== null) return Object.entries(v).some(([k, x]) => cite(k) || parcourir(x, k));
    return false;
  };
  for (const ligne of sortie.split('\n')) {
    const l = ligne.trim();
    if (l === '') continue;
    try {
      if (parcourir(JSON.parse(l), undefined)) return true;
    } catch {
      if (cite(l)) return true;
    }
  }
  return false;
}

export class ComptesDemoPg implements ComptesDemo {
  readonly #pool: Pool;
  readonly #coffre: Coffre;

  constructor(pool: Pool, coffre: Coffre) {
    this.#pool = pool;
    this.#coffre = coffre;
  }

  async remplacer(marqueId: string, applicationId: string, compte: CompteDemo, cible: CibleCompte): Promise<void> {
    await remplacerSecret(this.#pool, this.#coffre, { marqueId, type: TYPE_SECRET_COMPTE_DEMO, nom: nomSecretCompteDemo(applicationId), clair: serialiserCompte(compte, cible) });
  }

  async supprimer(marqueId: string, applicationId: string): Promise<boolean> {
    return supprimerSecret(this.#pool, marqueId, TYPE_SECRET_COMPTE_DEMO, nomSecretCompteDemo(applicationId));
  }

  async etat(marqueId: string, applicationId: string): Promise<EtatCompteDemo> {
    const modifieLe = await dateSecret(this.#pool, marqueId, TYPE_SECRET_COMPTE_DEMO, nomSecretCompteDemo(applicationId));
    return { depose: modifieLe !== undefined, modifieLe };
  }
}
