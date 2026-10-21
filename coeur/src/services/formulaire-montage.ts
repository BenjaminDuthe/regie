// regie — lecture du formulaire de l'éditeur de montage (histoire 3.10) : champs de la page → opérations d'édition.
// Les opérations se calculent par différence avec la version affichée : un champ absent ou inchangé ne produit rien,
// ce qui sert aussi bien à l'enregistrement qu'à l'aperçu (qui n'envoie que les champs de la scène dessinée).
// Rien n'est validé ici : `appliquerOperations` (schéma zod) et les gardes le font.

import { appliquerOperations, type OperationEdition, type ResultatEdition, type Timeline } from '@regie/contrats';

export type LireChamp = (nom: string) => string | null;

/** « 2,5 » ou « 2.5 » secondes → millisecondes ; `undefined` si ce n'est pas un nombre. */
export function millisecondesDepuisSecondes(texte: string): number | undefined {
  const n = Number(texte.trim().replace(',', '.'));
  return Number.isFinite(n) && texte.trim() !== '' ? Math.round(n * 1000) : undefined;
}

/** Les champs de texte, de durée et de carte de fin qui diffèrent de la timeline de départ. */
export function operationsDepuisChamps(base: Timeline, lire: LireChamp): OperationEdition[] {
  const operations: OperationEdition[] = [];
  for (const s of base.scenes) {
    const accroche = lire(`accroche-${s.id}`);
    const ecran = lire(`ecran-${s.id}`);
    const voix = lire(`voix-${s.id}`);
    const changes = {
      ...(accroche !== null && accroche.trim() !== s.accroche ? { accroche } : {}),
      ...(ecran !== null && ecran.trim() !== s.texteEcran ? { texteEcran: ecran } : {}),
      ...(voix !== null && voix.trim() !== s.voix ? { voix } : {}),
    };
    if (Object.keys(changes).length > 0) operations.push({ op: 'texte', sceneId: s.id, ...changes });
    const duree = lire(`duree-${s.id}`);
    const ms = duree === null ? undefined : millisecondesDepuisSecondes(duree);
    // Une durée illisible devient une durée impossible : le refus nomme la scène fautive.
    if (duree !== null && ms === undefined) operations.push({ op: 'duree', sceneId: s.id, dureeMs: 1 });
    else if (ms !== undefined && ms !== s.dureeMs) operations.push({ op: 'duree', sceneId: s.id, dureeMs: ms });
  }
  const titre = lire('carte-titre');
  const sousTitre = lire('carte-soustitre');
  const duree = lire('carte-duree');
  if (base.carteFin !== null && (titre !== null || sousTitre !== null || duree !== null)) {
    const ms = duree === null ? undefined : millisecondesDepuisSecondes(duree);
    const c = base.carteFin;
    const changes = {
      ...(titre !== null && titre.trim() !== c.titre ? { titre } : {}),
      ...(sousTitre !== null && sousTitre.trim() !== c.sousTitre ? { sousTitre } : {}),
      ...(ms !== undefined && ms !== c.dureeMs ? { dureeMs: ms } : {}),
    };
    if (Object.keys(changes).length > 0) operations.push({ op: 'carte_fin', ...changes });
  }
  return operations;
}

/** Un geste de structure : `deplacer:<scène>:monter|descendre`, `dupliquer:<scène>`, `retirer:<scène>`, `carte:ajouter|retirer`. */
export function operationDepuisGeste(geste: string): OperationEdition | undefined {
  const [genre, a, b] = geste.split(':');
  if (genre === 'deplacer' && a !== undefined && (b === 'monter' || b === 'descendre')) return { op: 'deplacer', sceneId: a, sens: b };
  if (genre === 'dupliquer' && a !== undefined) return { op: 'dupliquer', sceneId: a };
  if (genre === 'retirer' && a !== undefined) return { op: 'retirer', sceneId: a };
  if (genre === 'carte' && a === 'ajouter') return { op: 'carte_fin' };
  if (genre === 'carte' && a === 'retirer') return { op: 'carte_fin', retirer: true };
  return undefined;
}

/** La timeline telle que les champs la montrent, et la première erreur si les champs ne forment pas un montage valide. */
export function brouillonDepuisChamps(base: Timeline, lire: LireChamp, geste?: string): { timeline: Timeline; operations: OperationEdition[]; refus: ResultatRefus | undefined } {
  const operations = operationsDepuisChamps(base, lire);
  const g = geste === undefined ? undefined : operationDepuisGeste(geste);
  if (g !== undefined) operations.push(g);
  const r = appliquerOperations(base, operations);
  return r.ok ? { timeline: r.timeline, operations, refus: undefined } : { timeline: base, operations, refus: r };
}
export type ResultatRefus = Extract<ResultatEdition, { ok: false }>;
