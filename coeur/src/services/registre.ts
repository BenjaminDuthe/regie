// regie — registre unique des actions (histoire 1.11, AD-1).
// Une action = un domaine (au singulier), un verbe, une entrée validée par zod, une portée et un exécutant.
// L'interface, l'API (`/api/v1/<domaine>/<verbe>`) et plus tard le MCP (`<domaine>_<verbe>`) appellent la même fonction :
// mêmes validations, mêmes droits, même ErreurMetier. Chaque exécution est écrite au journal d'audit.

import { z } from 'zod';
import type { Services } from '../auth/services.ts';
import type { Portee } from '../infra/jetons.ts';
import { ErreurMetier } from './erreurs.ts';

export type Origine = 'interface' | 'api' | 'mcp';

/** Qui agit, avec quels droits, et par où. */
export type ContexteAction = Readonly<{
  services: Services;
  marqueId: string;
  utilisateurId: string;
  sub: string;
  origine: Origine;
  portees: readonly Portee[];
  /** Espaces accessibles ; `undefined` = tous les espaces de la personne (interface). */
  espaceIds: readonly string[] | undefined;
  /** Jeton d'API ou connexion à l'origine de l'appel (jamais sa valeur). */
  pat: string | undefined;
}>;

export type Action<E = unknown, S = unknown> = Readonly<{
  domaine: string;
  verbe: string;
  description: string;
  portee: Portee;
  entree: z.ZodType<E>;
  executer: (contexte: ContexteAction, entree: E) => Promise<S>;
  /** Sur quoi porte l'action, pour le journal (par défaut le domaine). */
  objet?: (entree: E, sortie: S) => string;
}>;

export const definirAction = <E, S>(action: Action<E, S>): Action<E, S> => action;

export const nomAction = (a: Pick<Action, 'domaine' | 'verbe'>): string => `${a.domaine}.${a.verbe}`;
/** Nom de l'outil MCP correspondant. */
export const nomOutil = (a: Pick<Action, 'domaine' | 'verbe'>): string => `${a.domaine}_${a.verbe}`;

/** Actions réservées à l'interface : fichier unique, avec la raison de chacune (test de parité). */
export type ExceptionParite = Readonly<{ action: string; raison: string }>;

/** `jeton` + `creer` ne doivent contenir que des minuscules et des chiffres : ils composent une adresse et un nom d'outil. */
const FORME_NOM = /^[a-z][a-z0-9]*$/;

export class Registre {
  readonly actions: readonly Action<any, any>[];
  readonly #parNom: ReadonlyMap<string, Action<any, any>>;

  constructor(actions: readonly Action<any, any>[]) {
    const vues = new Map<string, Action<any, any>>();
    for (const a of actions) {
      if (!FORME_NOM.test(a.domaine) || !FORME_NOM.test(a.verbe)) throw new Error(`action ${a.domaine}.${a.verbe} : domaine et verbe en minuscules sans séparateur`);
      if (vues.has(nomAction(a))) throw new Error(`action ${nomAction(a)} déclarée deux fois`);
      vues.set(nomAction(a), a);
    }
    this.actions = actions;
    this.#parNom = vues;
  }

  trouver(domaine: string, verbe: string): Action<any, any> | undefined {
    return this.#parNom.get(`${domaine}.${verbe}`);
  }
}

const RANG: Record<Portee, number> = { lecture: 1, ecriture: 2 };

/** La portée « ecriture » couvre la lecture. */
export const porteeSuffit = (accordees: readonly Portee[], requise: Portee): boolean => accordees.some((p) => RANG[p] >= RANG[requise]);

/**
 * Exécute une action : droits, validation, exécution, journal. Toute issue est écrite au journal ; un refus
 * lève une ErreurMetier (jamais une exception brute vers l'extérieur).
 */
export async function executerAction(contexte: ContexteAction, action: Action<any, any>, entreeBrute: unknown): Promise<unknown> {
  const details = { origine: contexte.origine, ...(contexte.pat !== undefined ? { pat: contexte.pat } : {}) };
  const refuser = async (erreur: ErreurMetier): Promise<never> => {
    await contexte.services.audit.ajouter(contexte.marqueId, {
      acteur: contexte.sub,
      action: 'action_refusee',
      objet: nomAction(action),
      details: { ...details, code: erreur.code },
    });
    throw erreur;
  };
  if (!porteeSuffit(contexte.portees, action.portee)) {
    return refuser(new ErreurMetier('JETON_PORTEE_INSUFFISANTE', 403, { action: nomAction(action), portee: action.portee }));
  }
  const lecture = action.entree.safeParse(entreeBrute ?? {});
  if (!lecture.success) {
    // Les messages de zod sont en anglais : on ne rend que les champs en cause.
    const champs = [...new Set(lecture.error.issues.map((i) => i.path.join('.') || '(corps)'))];
    return refuser(new ErreurMetier('ENTREE_INVALIDE', 400, { champs: champs.join(', ') }));
  }
  let sortie: unknown;
  try {
    sortie = await action.executer(contexte, lecture.data);
  } catch (erreur) {
    if (erreur instanceof ErreurMetier) return refuser(erreur);
    throw erreur;
  }
  await contexte.services.audit.ajouter(contexte.marqueId, {
    acteur: contexte.sub,
    action: `${action.domaine}_${action.verbe}`,
    objet: action.objet?.(lecture.data, sortie) ?? action.domaine,
    details,
  });
  return sortie;
}
