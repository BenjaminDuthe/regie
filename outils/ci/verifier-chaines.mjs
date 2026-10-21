// regie — vérificateur du fichier de chaînes unique (NFR-36, UX-DR23, AR-23).
// Tout texte lu par une personne vient de coeur/src/chaines.json. Ce fichier ne doit
// contenir aucun mot de deploiement/mots-interdits.json, aucun vouvoiement et aucune
// heure en chiffres collés (« 18:40 », « 18h40 » au lieu de « 18 h 40 »).
// Chaque faute nomme la clé du texte et la cause.

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { RACINE_DEPOT, rapporter } from './commun.mjs';

export const FICHIER_CHAINES = 'coeur/src/chaines.json';
export const FICHIER_MOTS_INTERDITS = 'deploiement/mots-interdits.json';

/** Mots du vouvoiement : les textes tutoient. */
const VOUVOIEMENT = ['vous', 'votre', 'vos', 'votres'];

/** Heure écrite en chiffres collés : 18:40 ou 18h40 (la forme attendue est « 18 h 40 »). */
const HEURE_COLLEE = /(?<![\d:])(?:[01]?\d|2[0-3])(?::[0-5]\d|h[0-5]\d)(?![\d])/iu;

/** Minuscules, sans accents : « Image clé » et « image cle » se valent. */
function normaliser(texte) {
  return texte.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

function motif(mot) {
  const echappe = normaliser(mot).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '\\s+');
  return new RegExp(`(?<![\\p{L}\\p{N}])${echappe}s?(?![\\p{L}\\p{N}])`, 'u');
}

/** Aplatit l'arbre JSON en [chemin, texte] ; les clés « $… » (commentaires) sont ignorées. */
function aplatir(valeur, chemin = '') {
  if (typeof valeur === 'string') return [[chemin, valeur]];
  if (valeur === null || typeof valeur !== 'object') return [];
  return Object.entries(valeur)
    .filter(([cle]) => !cle.startsWith('$'))
    .flatMap(([cle, enfant]) => aplatir(enfant, chemin === '' ? cle : `${chemin}.${cle}`));
}

function lireJson(racine, fichier, fautes) {
  const chemin = join(racine, fichier);
  if (!existsSync(chemin)) {
    fautes.push(`${fichier} : fichier absent`);
    return null;
  }
  try {
    return JSON.parse(readFileSync(chemin, 'utf8'));
  } catch (erreur) {
    fautes.push(`${fichier} : JSON invalide (${erreur.message})`);
    return null;
  }
}

/** Rend la liste des fautes, sous la forme « clé — cause ». */
export function verifierChaines(racine = RACINE_DEPOT) {
  const fautes = [];
  const chaines = lireJson(racine, FICHIER_CHAINES, fautes);
  const interdits = lireJson(racine, FICHIER_MOTS_INTERDITS, fautes);
  if (chaines === null || interdits === null) return fautes;

  const mots = interdits.mots;
  if (!Array.isArray(mots) || mots.length === 0 || mots.some((mot) => typeof mot !== 'string' || mot.trim() === '')) {
    return [`${FICHIER_MOTS_INTERDITS} : « mots » doit être une liste non vide de textes`];
  }

  const motifsInterdits = mots.map((mot) => [mot, motif(mot)]);
  const motifsVouvoiement = VOUVOIEMENT.map((mot) => [mot, motif(mot)]);
  for (const [cle, texte] of aplatir(chaines)) {
    const normalise = normaliser(texte);
    for (const [mot, regle] of motifsInterdits) {
      if (regle.test(normalise)) fautes.push(`${FICHIER_CHAINES} « ${cle} » — mot interdit « ${mot} » (${FICHIER_MOTS_INTERDITS})`);
    }
    for (const [mot, regle] of motifsVouvoiement) {
      if (regle.test(normalise)) fautes.push(`${FICHIER_CHAINES} « ${cle} » — vouvoiement (« ${mot} ») : les textes tutoient`);
    }
    if (HEURE_COLLEE.test(normalise)) {
      fautes.push(`${FICHIER_CHAINES} « ${cle} » — heure en chiffres collés : écris « 18 h 40 »`);
    }
  }
  return fautes;
}

if (import.meta.main) {
  process.exitCode = rapporter('mots interdits', verifierChaines());
}
