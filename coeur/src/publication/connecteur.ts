// regie — interface du connecteur d'un réseau de publication (histoires 7.1, 7.3, 7.6). Tout appel à un réseau passe par
// elle : les tests la remplacent par un faux serveur local, et chaque réseau a son connecteur, isolé des autres
// (service « publication »). Un connecteur ne journalise jamais un jeton, une clé ni le corps d'une réponse.

import type { Reseau } from '../domaine/bornes.ts';

/** Clé de l'application déposée chez le réseau (identifiant public + secret). Elle ne vit qu'au coffre. */
export type CleApplication = Readonly<{ idApplication: string; secret: string }>;

/** Ce que rend l'échange du code d'autorisation : le jeton (à mettre au coffre), son échéance et le compte relié. */
export type JetonObtenu = Readonly<{ jeton: string; expireLe: Date; compteExterne: string; nom: string }>;

export type QuotaReseau = Readonly<{ utilise: number; total: number }>;

export type DemandePublication = Readonly<{
  jeton: string;
  compteExterne: string;
  /** Adresse signée, de moins d'une heure, où le réseau vient chercher la vidéo. */
  urlVideo: string;
  legende: string;
  /** Clé d'idempotence de CETTE publication : identique à chaque tentative, jamais réutilisée pour une autre. */
  cleIdempotence: string;
  signal?: AbortSignal | undefined;
}>;

export type ResultatPublication = Readonly<{ idExterne: string; lien: string }>;

export interface ConnecteurReseau {
  readonly reseau: Reseau;
  /** Adresse où envoyer la personne pour autoriser regie ; `state` est opaque pour le réseau. */
  urlAutorisation(p: Readonly<{ cle: CleApplication; state: string; redirectUri: string; portees: readonly string[] }>): string;
  echangerCode(p: Readonly<{ cle: CleApplication; code: string; redirectUri: string; maintenant: Date }>): Promise<JetonObtenu>;
  /** Vérifie la clé d'application auprès du réseau. Lève `ErreurReseau` si elle est refusée ou si le réseau est injoignable. */
  tester(cle: CleApplication): Promise<void>;
  quota(p: Readonly<{ jeton: string; compteExterne: string }>): Promise<QuotaReseau>;
  publier(demande: DemandePublication): Promise<ResultatPublication>;
}

export type Connecteurs = Readonly<Partial<Record<Reseau, ConnecteurReseau>>>;

/**
 * Échec d'un appel à un réseau. `code` est un code stable (message dans chaines.erreurs / chaines.publication.causes) ;
 * `definitive` dit si une nouvelle tentative a un sens. Le message ne contient jamais de donnée du réseau.
 */
export class ErreurReseau extends Error {
  readonly code: string;
  readonly definitive: boolean;

  constructor(cause: string, definitive: boolean) {
    super(cause);
    this.name = 'ErreurReseau';
    this.code = cause;
    this.definitive = definitive;
  }
}

/**
 * Reconnaît une `ErreurReseau` par son nom plutôt que par `instanceof` : la page (Astro) et le serveur (Fastify) sont
 * compilés séparément et chacun porte sa copie de la classe.
 */
export const estErreurReseau = (e: unknown): e is ErreurReseau => e instanceof Error && e.name === 'ErreurReseau' && typeof (e as { code?: unknown }).code === 'string';
