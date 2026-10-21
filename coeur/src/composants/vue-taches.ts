// regie — les textes d'une tâche, tirés de chaines.json (histoire 2.5). Module pur, sans accès au serveur : la page
// l'utilise pour son premier rendu et le script du navigateur pour les mises à jour du flux, avec les mêmes mots.

import type { VueTache } from '../services/suivi.ts';

export type LibellesTaches = Readonly<{
  etats: Readonly<Record<string, string>>;
  types: Readonly<Record<string, string>>;
  position: Readonly<{ enCours: string; prochaine: string; rang: string }>;
  fin: string;
  finie: string;
  tentative: string;
  causes: Readonly<Record<string, string>>;
  actions: Readonly<Record<string, string>>;
  issues: Readonly<Record<string, string>>;
  historiqueLigne: string;
  relancer: string;
}>;

export type DescriptionTache = Readonly<{
  id: string;
  titre: string;
  etat: string;
  codeEtat: string;
  position: string | undefined;
  fin: string | undefined;
  tentative: string | undefined;
  /** Cause puis action, nommées en clair (UX-DR25) ; seulement pour une tâche échouée. */
  probleme: string | undefined;
  relancable: boolean;
  /** Une ligne par tentative : « Tentative 1 : échouée (cause) ». */
  historique: string[];
}>;

const ACTIVES = new Set(['prete', 'en_cours', 'gelee']);
export const estActive = (v: Pick<VueTache, 'etat'>): boolean => ACTIVES.has(v.etat);

export function decrire(v: VueTache, t: LibellesTaches): DescriptionTache {
  let position: string | undefined;
  if (v.position === 0) position = t.position.enCours;
  else if (v.position === 1) position = t.position.prochaine;
  else if (v.position !== null) position = t.position.rang.replace('{n}', String(v.position));
  const fin = v.etat === 'terminee' || v.etat === 'echouee' || v.etat === 'annulee' ? undefined : v.finEstimeeEnClair ?? undefined;
  return {
    id: v.id,
    titre: t.types[v.etape] ?? v.etape,
    etat: t.etats[v.etat] ?? v.etat,
    codeEtat: v.etat,
    position,
    fin: fin === undefined ? undefined : t.fin.replace('{heure}', fin),
    tentative: v.tentative > 0 ? t.tentative.replace('{n}', String(v.tentative)).replace('{max}', String(v.tentativesMax)) : undefined,
    probleme: v.etat === 'echouee' ? `${t.causes[v.cause ?? ''] ?? t.causes['defaut']!} ${t.actions[v.action ?? ''] ?? t.actions['defaut']!}` : undefined,
    relancable: v.etat === 'echouee',
    historique: (v.tentatives ?? []).map((x) =>
      t.historiqueLigne.replace('{n}', String(x.numero)).replace('{issue}', t.issues[x.issue] ?? x.issue).replace('{cause}', x.cause === null ? '' : ` (${t.causes[x.cause] ?? x.cause})`),
    ),
  };
}
