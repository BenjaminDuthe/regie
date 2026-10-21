// regie — l'erreur métier unique (histoire 1.11, AD-1).
// Une action refuse toujours par une ErreurMetier : code stable `DOMAINE_CAUSE`, statut HTTP, message en français
// (tiré de chaines.json, jamais écrit ici) et contexte. L'interface, l'API et le MCP la rendent à l'identique.

import chaines from '../chaines.json' with { type: 'json' };

/** Statuts HTTP utilisés par l'API (AD-1). */
export type StatutErreur = 400 | 401 | 403 | 404 | 409 | 422 | 429;

const MESSAGES = chaines.erreurs as Record<string, string>;

export class ErreurMetier extends Error {
  readonly code: string;
  readonly statut: StatutErreur;
  readonly contexte: Readonly<Record<string, unknown>>;

  constructor(code: string, statut: StatutErreur, contexte: Readonly<Record<string, unknown>> = {}) {
    super(ErreurMetier.message(code, contexte));
    this.name = 'ErreurMetier';
    this.code = code;
    this.statut = statut;
    this.contexte = contexte;
  }

  /** Le message en français du code, avec ses `{variables}` remplacées par le contexte. */
  static message(code: string, contexte: Readonly<Record<string, unknown>> = {}): string {
    const modele = MESSAGES[code] ?? MESSAGES['ERREUR_INCONNUE'] ?? code;
    return modele.replace(/\{(\w+)\}/g, (_, cle: string) => String(contexte[cle] ?? ''));
  }
}

/** Corps d'erreur commun à l'API et au MCP. */
export type CorpsErreur = Readonly<{ ok: false; erreur: Readonly<{ code: string; message: string; contexte: Readonly<Record<string, unknown>> }> }>;

export const corpsErreur = (e: ErreurMetier): CorpsErreur => ({ ok: false, erreur: { code: e.code, message: e.message, contexte: e.contexte } });
