// regie — qui agit, selon la porte d'entrée (histoire 1.11).

import type { Services } from '../auth/services.ts';
import { idUtilisateur } from '../infra/espaces.ts';
import type { Principal } from '../infra/jetons.ts';
import type { Session } from '../infra/sessions.ts';
import type { ContexteAction, Origine } from './registre.ts';

/** Une personne connectée à l'interface : tous ses droits et tous ses espaces. */
export function contexteInterface(services: Services, session: Pick<Session, 'marqueId' | 'sub'>): ContexteAction {
  return {
    services,
    marqueId: session.marqueId,
    utilisateurId: idUtilisateur(session.marqueId, session.sub),
    sub: session.sub,
    origine: 'interface',
    portees: ['lecture', 'ecriture'],
    espaceIds: undefined,
    pat: undefined,
  };
}

/** Un jeton Bearer : seulement la portée et les espaces qu'il porte. */
export function contexteJeton(services: Services, principal: Principal, origine: Exclude<Origine, 'interface'>): ContexteAction {
  return {
    services,
    marqueId: principal.marqueId,
    utilisateurId: principal.utilisateurId,
    sub: principal.sub,
    origine,
    portees: principal.portees,
    espaceIds: principal.espaceIds,
    pat: principal.jetonId,
  };
}
