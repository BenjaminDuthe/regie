// regie — lecture du formulaire du gabarit (histoire 2.8) : champs de la page → définition, pour l'enregistrement et
// l'aperçu. Rien n'est validé ici : `definitionGabarit` (zod) et les gardes le font, dans l'action.

import { GABARIT_DE_DEPART, type DefinitionGabarit } from '../domaine/gabarit.ts';

/** Mots-clics saisis librement : séparés par des espaces, retours à la ligne ou virgules ; le « # » est ajouté s'il manque. */
export function lireMotsClics(texte: string): string[] {
  return texte
    .split(/[\s,]+/u)
    .filter((m) => m !== '')
    .map((m) => (m.startsWith('#') ? m : `#${m}`));
}

/** Définition lue dans les champs ; un champ absent reprend la valeur du gabarit de départ (jamais d'erreur ici). */
export function definitionDepuisFormulaire(lire: (nom: string) => string | null): DefinitionGabarit {
  const d = GABARIT_DE_DEPART;
  const texte = (nom: string, defaut: string): string => lire(nom) ?? defaut;
  return {
    couleurs: [texte('couleurPrincipale', d.couleurs[0]!), texte('couleurTexte', d.couleurs[1]!), texte('couleurFond', d.couleurs[2]!), texte('couleurAccent', d.couleurs[3]!)],
    policeTitres: texte('policeTitres', d.policeTitres) as DefinitionGabarit['policeTitres'],
    policeSousTitres: texte('policeSousTitres', d.policeSousTitres) as DefinitionGabarit['policeSousTitres'],
    styleSousTitres: texte('styleSousTitres', d.styleSousTitres) as DefinitionGabarit['styleSousTitres'],
    carteFin: { titre: texte('carteFinTitre', d.carteFin.titre), sousTitre: texte('carteFinSousTitre', d.carteFin.sousTitre) },
    legende: texte('legende', ''),
    hashtags: lireMotsClics(texte('hashtags', '')),
  };
}
