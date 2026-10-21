// Types d'échéance du socle (histoire 2.2, AR-22) et ce qui leur arrive quand elles sont en retard.

/** `rattraper` : on la fait quand même, même très en retard ; `echouer` : passé 2 h de retard, elle échoue avec sa cause. */
export type RegleRetard = 'rattraper' | 'echouer';

export type DefinitionEcheance = Readonly<{ type: string; regle: RegleRetard }>;

const def = (d: DefinitionEcheance): DefinitionEcheance => Object.freeze(d);

export const TYPES_ECHEANCE: Readonly<Record<string, DefinitionEcheance>> = Object.freeze({
  // Une publication ou un rappel qui sort avec des heures de retard ferait plus de mal que de bien : on la signale.
  publication: def({ type: 'publication', regle: 'echouer' }),
  rendu_differe: def({ type: 'rendu_differe', regle: 'rattraper' }),
  // `objet` dit quoi purger : `sessions`, `clients_oauth`…
  purge: def({ type: 'purge', regle: 'rattraper' }),
  rappel: def({ type: 'rappel', regle: 'echouer' }),
  expiration: def({ type: 'expiration', regle: 'rattraper' }),
  rappel_connexion: def({ type: 'rappel_connexion', regle: 'echouer' }),
  suppression_annoncee: def({ type: 'suppression_annoncee', regle: 'rattraper' }),
  verification_audit: def({ type: 'verification_audit', regle: 'rattraper' }),
});

/** Une échéance en retard de moins de 2 h est toujours rattrapée (NFR-8). */
export const RATTRAPAGE_MAX_MS = 2 * 3_600_000;

export type Recurrence = Readonly<{ type: string; objet: string; heureParis: string }>;

/** Ce qui revient chaque nuit, à l'heure de Paris. */
export const RECURRENCES: readonly Recurrence[] = Object.freeze([
  Object.freeze({ type: 'verification_audit', objet: 'chaine', heureParis: '03:00' }),
  Object.freeze({ type: 'purge', objet: 'sessions', heureParis: '03:15' }),
  Object.freeze({ type: 'purge', objet: 'clients_oauth', heureParis: '03:20' }),
]);
