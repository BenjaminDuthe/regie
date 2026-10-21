// regie — l'aperçu d'un gabarit (histoire 2.8, FR-6) : trois scènes d'un brouillon d'exemple, dessinées côté serveur
// en SVG, sans dépendance. Le texte est échappé ; le logo est un monogramme provisoire (son import, rastérisé,
// arrive avec la zone de données, AR-12). Le contour pointillé est la zone sûre.

import { BORNES, type Bornes } from './bornes.ts';
import { POLICES } from './polices.ts';
import { preparerExemple, roles, type DefinitionGabarit, type ElementPrepare } from './gabarit.ts';

const echapper = (t: string): string => t.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const PILE = 'system-ui, sans-serif';

function dessinerElement(e: ElementPrepare, d: DefinitionGabarit): string {
  const b = e.disposition.boite;
  if (e.genre === 'logo') {
    return `<rect x="${b.x}" y="${b.y}" width="${b.largeur}" height="${b.hauteur}" rx="24" fill="${e.fondCouleur}"/><text x="${b.x + b.largeur / 2}" y="${b.y + b.hauteur / 2 + 30}" text-anchor="middle" font-size="90" fill="#FFFFFF" font-family="${PILE}">É</text>`;
  }
  const police = e.genre === 'sous_titre' ? POLICES[d.policeSousTitres].nom : POLICES[d.policeTitres].nom;
  const lignes = e.disposition.lignes
    .map((l, i) => {
      const y = b.y + e.disposition.marge + e.disposition.taille * (1 + i * 1.25);
      const dernier = e.accentCouleur !== null && i === e.disposition.lignes.length - 1;
      const mots = l.split(' ');
      const corps = dernier && mots.length > 1 ? `${echapper(mots.slice(0, -1).join(' '))} <tspan fill="${e.accentCouleur}">${echapper(mots[mots.length - 1]!)}</tspan>` : echapper(l);
      return `<text x="${b.x + b.largeur / 2}" y="${y}" text-anchor="middle" font-size="${e.disposition.taille}" fill="${e.texteCouleur}" font-family="'${police}', ${PILE}">${corps}</text>`;
    })
    .join('');
  return `<rect x="${b.x}" y="${b.y}" width="${b.largeur}" height="${b.hauteur}" rx="16" fill="${e.fondCouleur}"/>${lignes}`;
}

export function apercuSvg(d: DefinitionGabarit, bornes: Bornes = BORNES): string {
  const { toile, zoneSure: z } = bornes;
  const fond = roles(d).fond;
  const scenes = preparerExemple(d, bornes);
  const ecart = 60;
  const largeur = scenes.length * toile.largeur + (scenes.length - 1) * ecart;
  const corps = scenes
    .map((s, i) => {
      const dx = i * (toile.largeur + ecart);
      return `<g transform="translate(${dx} 0)"><rect width="${toile.largeur}" height="${toile.hauteur}" fill="${fond}"/><rect x="${z.x}" y="${z.y}" width="${z.largeur}" height="${z.hauteur}" fill="none" stroke="#888888" stroke-width="4" stroke-dasharray="24 16"/>${s.elements.map((e) => dessinerElement(e, d)).join('')}</g>`;
    })
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${largeur} ${toile.hauteur}" role="img" aria-label="Aperçu du gabarit sur trois scènes d’un brouillon d’exemple">${corps}</svg>`;
}
