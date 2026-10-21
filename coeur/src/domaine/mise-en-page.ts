// regie — la mise en page commune (histoire 2.7, AD-5/AR-18) : où tombe un texte, sur combien de lignes, dans quelle
// boîte. Module pur, sans navigateur ni FFmpeg, partagé par les gardes, l'aperçu et (plus tard) le rendu. La largeur
// d'un texte est estimée par police (largeur moyenne d'un caractère × taille) : assez juste pour garder, jamais pour
// composer à l'image près (le test image du rendu ⇔ lecteur arrive avec l'histoire 3.1).

import type { Rectangle } from './bornes.ts';
import { POLICES, type IdPolice } from './polices.ts';

export type Ancre = 'haut' | 'centre' | 'bas';

export type EntreeDisposition = Readonly<{
  texte: string;
  police: IdPolice;
  taille: number;
  capitales: boolean;
  ancre: Ancre;
  /** Décalage vertical depuis le bord de l'ancre, en pixels de la toile. */
  decalage?: number;
}>;

export type Disposition = Readonly<{ lignes: readonly string[]; taille: number; interligne: number; marge: number; boite: Rectangle }>;

export const MARGE = 0.4; // en multiples de la taille
export const INTERLIGNE = 1.25;

export function largeurTexte(texte: string, police: IdPolice, taille: number, capitales: boolean): number {
  const p = POLICES[police];
  return [...texte].length * taille * (capitales ? p.largeurCapitales : p.largeurMoyenne);
}

/** Coupe aux espaces, au plus près de la largeur permise ; un mot trop long reste entier (il dépassera : c'est une garde). */
export function couper(texte: string, largeurMax: number, mesurer: (t: string) => number): string[] {
  const lignes: string[] = [];
  let courante = '';
  for (const mot of texte.split(/\s+/).filter((m) => m !== '')) {
    const essai = courante === '' ? mot : `${courante} ${mot}`;
    if (courante !== '' && mesurer(essai) > largeurMax) {
      lignes.push(courante);
      courante = mot;
    } else courante = essai;
  }
  if (courante !== '') lignes.push(courante);
  return lignes;
}

export function disposer(entree: EntreeDisposition, zone: Rectangle): Disposition {
  const texte = entree.capitales ? entree.texte.toLocaleUpperCase('fr-FR') : entree.texte;
  const marge = MARGE * entree.taille;
  const mesurer = (t: string) => largeurTexte(t, entree.police, entree.taille, entree.capitales);
  const lignes = couper(texte, zone.largeur - 2 * marge, mesurer);
  const largeur = Math.max(0, ...lignes.map(mesurer)) + 2 * marge;
  const hauteur = lignes.length * entree.taille * INTERLIGNE + 2 * marge;
  const decalage = entree.decalage ?? 0;
  const x = zone.x + (zone.largeur - largeur) / 2;
  const y = entree.ancre === 'haut' ? zone.y + decalage : entree.ancre === 'bas' ? zone.y + zone.hauteur - hauteur - decalage : zone.y + (zone.hauteur - hauteur) / 2;
  return { lignes, taille: entree.taille, interligne: entree.taille * INTERLIGNE, marge, boite: { x, y, largeur, hauteur } };
}
