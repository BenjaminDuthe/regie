// regie — programmer une échéance (histoire 2.2, AR-22). L'inscription se fait dans la transaction de l'action métier :
// si l'action est annulée, l'échéance l'est aussi ; si l'action réussit, l'échéance existe, même si le serveur tombe aussitôt.

import type { ClientBase } from 'pg';
import { TYPES_ECHEANCE } from '@regie/contrats';
import { inscrireEcheance } from '../infra/echeances.ts';

export class ErreurEcheance extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ErreurEcheance';
  }
}

/** À appeler avec le client de la transaction de l'action métier. Rend l'identifiant, ou `undefined` si la clé existait déjà. */
export async function programmerEcheance(
  transaction: ClientBase,
  marqueId: string,
  echeance: Readonly<{ type: string; objet: string; instant: Date; cle?: string }>,
): Promise<string | undefined> {
  if (TYPES_ECHEANCE[echeance.type] === undefined) throw new ErreurEcheance(`type d'échéance inconnu : ${echeance.type}`);
  if (Number.isNaN(echeance.instant.getTime())) throw new ErreurEcheance('instant invalide');
  return inscrireEcheance(transaction, marqueId, echeance);
}
