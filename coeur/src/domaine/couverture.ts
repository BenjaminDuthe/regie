// regie — la couverture d'une vidéo (histoire 3.5, FR-25, FR-37) : trois variantes dessinées côté serveur, au style du
// gabarit figé du montage (couleurs et polices), en SVG 1080x1920. Tout texte est échappé. Module pur : mêmes entrées,
// même image. Le choix d'une variante est une opération d'édition (`couverture`) : il crée une nouvelle version du
// montage. La rastérisation en PNG/JPEG pour la publication arrive avec le rendu complet (ARBITRAGES.md, histoire 3.5).

import { VARIANTES_COUVERTURE, VARIANTE_COUVERTURE_PAR_DEFAUT, type Timeline, type VarianteCouverture } from '@regie/contrats';
import { BORNES, type Bornes } from './bornes.ts';
import { dessinerElement, echapper } from './apercu.ts';
import { roles, type DefinitionGabarit, type ElementPrepare } from './gabarit.ts';
import { disposer } from './mise-en-page.ts';
import type { Ancre } from './mise-en-page.ts';

export { VARIANTES_COUVERTURE };
export type { VarianteCouverture };

const premier = (textes: readonly string[]): string => textes.find((t) => t.trim() !== '') ?? '';

/** La variante choisie d'une timeline (la première par défaut). */
export const varianteChoisie = (t: Timeline): VarianteCouverture => t.couverture?.variante ?? VARIANTE_COUVERTURE_PAR_DEFAUT;

/** Les textes dont se servent les couvertures : l'accroche, puis le texte à l'écran, puis la carte de fin. */
export function textesCouverture(t: Timeline): { titre: string; ecran: string } {
  const titre = premier([...t.scenes.map((s) => s.accroche), t.carteFin?.titre ?? '']);
  const ecran = premier([...t.scenes.map((s) => s.texteEcran), t.carteFin?.sousTitre ?? '', titre]);
  return { titre, ecran };
}

/** L'image SVG d'une variante de couverture. */
export function dessinerCouverture(t: Timeline, d: DefinitionGabarit, variante: VarianteCouverture, bornes: Bornes = BORNES): string {
  const { toile, zoneSure: zone } = bornes;
  const r = roles(d);
  const { titre, ecran } = textesCouverture(t);
  const element = (id: string, texte: string, taille: number, ancre: Ancre, decalage: number): ElementPrepare | undefined =>
    texte === '' ? undefined : { id, genre: 'titre', texte, texteCouleur: r.texte, fondCouleur: r.principale, accentCouleur: null, disposition: disposer({ texte, police: d.policeTitres, taille, capitales: false, ancre, decalage }, zone) };

  let corps = '';
  if (variante === 'titre') {
    const e = element('couverture-titre', titre, 110, 'centre', 0);
    corps = e === undefined ? '' : dessinerElement(e, d);
  } else if (variante === 'ecran') {
    const haut = element('couverture-accroche', titre, 56, 'haut', 120);
    const centre = element('couverture-ecran', ecran, 84, 'centre', 0);
    corps = [haut, centre].map((e) => (e === undefined ? '' : dessinerElement(e, d))).join('');
  } else {
    const e = element('couverture-bandeau', titre, 96, 'bas', 160);
    const b = e?.disposition.boite;
    // Un filet d'accent au-dessus du bandeau, sur toute la largeur de la zone sûre.
    corps = e === undefined || b === undefined ? '' : `<rect x="${zone.x}" y="${b.y - 36}" width="${zone.largeur}" height="12" fill="${r.accent}"/>${dessinerElement(e, d)}`;
  }
  const nom = `Couverture, variante ${variante}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${toile.largeur} ${toile.hauteur}" role="img" aria-label="${echapper(nom)}"><rect width="${toile.largeur}" height="${toile.hauteur}" fill="${r.fond}"/>${corps}</svg>`;
}
