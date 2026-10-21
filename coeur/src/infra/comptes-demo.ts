// regie — compte de démonstration d'une application (histoire 4.3, FR-14, AD-9). Identifiant et mot de passe vivent
// UNIQUEMENT dans le coffre chiffré (type `compte_demo`, un par application) : ils ne se réaffichent jamais, ne
// s'écrivent dans aucun journal, et ne se lisent que par la passerelle de secrets (tâche en cours, matrice de droits).
// Cette interface n'offre donc que deux gestes : remplacer, et savoir si un compte est déposé.

import type { Pool } from 'pg';
import type { Coffre } from './coffre.ts';
import { dateSecret, remplacerSecret } from './base.ts';

export const TYPE_SECRET_COMPTE_DEMO = 'compte_demo';
export const nomSecretCompteDemo = (applicationId: string): string => `application:${applicationId}`;

export type CompteDemo = Readonly<{ identifiant: string; motDePasse: string }>;
export type EtatCompteDemo = Readonly<{ depose: boolean; modifieLe: Date | undefined }>;

export interface ComptesDemo {
  /** Dépose ou remplace le compte. Rien d'autre ne peut l'écrire. */
  remplacer(marqueId: string, applicationId: string, compte: CompteDemo): Promise<void>;
  /** Un compte est-il déposé, et depuis quand ? Jamais son contenu. */
  etat(marqueId: string, applicationId: string): Promise<EtatCompteDemo>;
}

export const serialiserCompte = (c: CompteDemo): string => JSON.stringify({ identifiant: c.identifiant, motDePasse: c.motDePasse });

/** Relit un compte sérialisé ; `undefined` si le contenu n'a pas la bonne forme. */
export function lireCompteSerialise(clair: string): CompteDemo | undefined {
  try {
    const o = JSON.parse(clair) as Record<string, unknown>;
    return typeof o['identifiant'] === 'string' && typeof o['motDePasse'] === 'string' ? { identifiant: o['identifiant'], motDePasse: o['motDePasse'] } : undefined;
  } catch {
    return undefined;
  }
}

export class ComptesDemoPg implements ComptesDemo {
  readonly #pool: Pool;
  readonly #coffre: Coffre;

  constructor(pool: Pool, coffre: Coffre) {
    this.#pool = pool;
    this.#coffre = coffre;
  }

  async remplacer(marqueId: string, applicationId: string, compte: CompteDemo): Promise<void> {
    await remplacerSecret(this.#pool, this.#coffre, { marqueId, type: TYPE_SECRET_COMPTE_DEMO, nom: nomSecretCompteDemo(applicationId), clair: serialiserCompte(compte) });
  }

  async etat(marqueId: string, applicationId: string): Promise<EtatCompteDemo> {
    const modifieLe = await dateSecret(this.#pool, marqueId, TYPE_SECRET_COMPTE_DEMO, nomSecretCompteDemo(applicationId));
    return { depose: modifieLe !== undefined, modifieLe };
  }
}
