// regie — consultation du journal d'audit (histoire 1.13, NFR-21).
// Qui voit quoi : chacun voit ses actions ; le propriétaire d'un espace voit aussi ce qui touche à son espace ;
// l'administrateur de l'instance voit tout le journal de la marque, mais l'objet des lignes des autres
// n'est montré que par son genre (« jeton », « connexion »…), jamais par son identifiant ni son contenu.
// Les heures sont celles de Paris. La chaîne est vérifiée sur le journal entier de la marque, pas sur la page affichée.

import { verifierChaine, type LigneAudit } from '../infra/audit.ts';

export type Perimetre = 'moi' | 'espace' | 'instance';
export type Origine = 'interface' | 'mcp' | 'api';
export const ORIGINES: readonly Origine[] = ['interface', 'mcp', 'api'];
export const PERIMETRES: readonly Perimetre[] = ['moi', 'espace', 'instance'];
export const LIMITE_LIGNES = 500;

export type FiltreJournal = Readonly<{
  perimetre: Perimetre;
  /** Jour de Paris au format AAAA-MM-JJ, inclus. */
  du?: string | undefined;
  au?: string | undefined;
  origine?: Origine | undefined;
  /** Début de l'objet (`jeton`, `espace:`, `connexion:3f…`). */
  objet?: string | undefined;
}>;

export type Lecteur = Readonly<{ sub: string; espaceIds: readonly string[]; estAdmin: boolean }>;

export type VueLigne = Readonly<{ horodatage: string; acteur: string; action: string; objet: string; origine: string; mienne: boolean }>;

export type Consultation = Readonly<{
  lignes: readonly VueLigne[];
  /** Nombre de lignes correspondant au filtre avant la coupe à `LIMITE_LIGNES`. */
  total: number;
  /** La chaîne entière de la marque est intacte (vérifiée pour tous les lecteurs). */
  chaineIntacte: boolean;
  /** Position (à partir de 0) de la première ligne qui rompt la chaîne : administrateur seulement. */
  chaineRompueA: number | undefined;
  /** Nombre de lignes de la chaîne vérifiée : administrateur seulement (sinon, il révélerait l'activité des autres). */
  verifiees: number | undefined;
}>;

const FORME_JOUR = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Décalage de Paris par rapport à UTC, en minutes, à cet instant. */
export function decalageParis(instant: Date): number {
  const parties = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Paris', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(instant);
  const v = (t: string) => Number(parties.find((p) => p.type === t)!.value);
  return (Date.UTC(v('year'), v('month') - 1, v('day'), v('hour'), v('minute')) - Math.floor(instant.getTime() / 60_000) * 60_000) / 60_000;
}

/** Minuit à Paris du jour donné, ou `undefined` si le texte n'est pas une date réelle. */
export function debutDeJourParis(jour: string): Date | undefined {
  const m = FORME_JOUR.exec(jour);
  if (m === null) return undefined;
  const [a, mo, j] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const utc = new Date(Date.UTC(a, mo - 1, j));
  if (utc.getUTCFullYear() !== a || utc.getUTCMonth() !== mo - 1 || utc.getUTCDate() !== j) return undefined;
  // Deux passes : le décalage se lit à l'instant visé, qui dépend lui-même du décalage (changements d'heure).
  let instant = new Date(utc.getTime() - decalageParis(utc) * 60_000);
  instant = new Date(utc.getTime() - decalageParis(instant) * 60_000);
  return instant;
}

export function formaterParis(iso: string): string {
  return new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', dateStyle: 'short', timeStyle: 'medium' }).format(new Date(iso));
}

const origineDe = (l: LigneAudit): string => (typeof l.details['origine'] === 'string' ? l.details['origine'] : '');
const genreObjet = (objet: string): string => objet.split(':')[0]!;

/** Ce que ce lecteur a le droit de voir de cette ligne, dans ce périmètre ; `undefined` si rien. */
function visible(l: LigneAudit, lecteur: Lecteur, perimetre: Perimetre): { objet: string; mienne: boolean } | undefined {
  const mienne = l.acteur === lecteur.sub;
  const dansMonEspace = lecteur.espaceIds.some((id) => l.objet === `espace:${id}`);
  if (perimetre === 'moi') return mienne ? { objet: l.objet, mienne } : undefined;
  if (perimetre === 'espace') return mienne || dansMonEspace ? { objet: l.objet, mienne } : undefined;
  // instance : réservé à l'administrateur ; l'objet des autres n'est pas détaillé.
  if (!lecteur.estAdmin) return undefined;
  return { objet: mienne || dansMonEspace ? l.objet : genreObjet(l.objet), mienne };
}

export function consulterJournal(chaine: readonly LigneAudit[], lecteur: Lecteur, filtre: FiltreJournal): Consultation {
  const debut = filtre.du === undefined ? undefined : debutDeJourParis(filtre.du);
  const fin = filtre.au === undefined || debutDeJourParis(filtre.au) === undefined ? undefined : debutDeJourParis(prochainJour(filtre.au));
  const retenues: VueLigne[] = [];
  for (const l of chaine) {
    const v = visible(l, lecteur, filtre.perimetre);
    if (v === undefined) continue;
    const t = new Date(l.horodatage).getTime();
    if (debut !== undefined && t < debut.getTime()) continue;
    if (fin !== undefined && t >= fin.getTime()) continue;
    if (filtre.origine !== undefined && origineDe(l) !== filtre.origine) continue;
    if (filtre.objet !== undefined && filtre.objet !== '' && !v.objet.startsWith(filtre.objet)) continue;
    retenues.push({ horodatage: l.horodatage, acteur: l.acteur, action: l.action, objet: v.objet, origine: origineDe(l), mienne: v.mienne });
  }
  retenues.reverse(); // le plus récent d'abord
  const rupture = verifierChaine(chaine);
  return {
    lignes: retenues.slice(0, LIMITE_LIGNES),
    total: retenues.length,
    chaineIntacte: rupture === undefined,
    chaineRompueA: lecteur.estAdmin ? rupture : undefined,
    verifiees: lecteur.estAdmin ? chaine.length : undefined,
  };
}

/** Le jour suivant (AAAA-MM-JJ), sans heure. */
export function prochainJour(jour: string): string {
  const d = new Date(`${jour}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}
