// regie — l'aperçu d'une scène d'un montage (histoire 3.10, FR-26) : une image SVG 1080x1920 dessinée côté serveur
// avec la même mise en page que les gardes et le rendu. Elle suit chaque modification sans rendu complet. Les éléments
// qui enfreignent une garde sont cerclés de rouge. Le fond est uni (couleur du gabarit) : l'image du film n'est pas
// extraite ici (arbitrage ARB-3.10). Le SVG est servi en `<img>` : ses scripts ne s'y exécutent jamais.

import type { Timeline } from '@regie/contrats';
import { BORNES, type Bornes } from './bornes.ts';
import { dessinerElement, echapper } from './apercu.ts';
import { roles, type DefinitionGabarit } from './gabarit.ts';
import type { Violation } from './gardes.ts';
import { montageEtMesuresTimeline } from './montage.ts';

/** Identifiant de la carte de fin dans l'aperçu (comme dans les gardes). */
export const ID_CARTE_FIN = 'carte-fin';

export type OptionsApercuScene = Readonly<{ violations: readonly Violation[]; bornes?: Bornes }>;

/** L'image d'une scène (`sceneId`) ou de la carte de fin (`ID_CARTE_FIN`) ; `undefined` si elle n'existe pas. */
export function apercuScene(t: Timeline, d: DefinitionGabarit, sceneId: string, o: OptionsApercuScene): string | undefined {
  const bornes = o.bornes ?? BORNES;
  const { toile, zoneSure: z } = bornes;
  const { scenes } = montageEtMesuresTimeline(t, d, bornes);
  const scene = scenes.find((s) => s.id === sceneId);
  if (scene === undefined) return undefined;
  const fautifs = new Set(o.violations.filter((v) => v.segment === sceneId).map((v) => v.element));
  const elements = scene.elements.map((e) => dessinerElement(e, d)).join('');
  const cercles = scene.elements
    .filter((e) => fautifs.has(e.id))
    .map((e) => `<rect x="${e.disposition.boite.x - 8}" y="${e.disposition.boite.y - 8}" width="${e.disposition.boite.largeur + 16}" height="${e.disposition.boite.hauteur + 16}" rx="20" fill="none" stroke="#E5484D" stroke-width="10"/>`)
    .join('');
  const etiquette = t.scenes.findIndex((s) => s.id === sceneId);
  const nom = sceneId === ID_CARTE_FIN ? 'la carte de fin' : `la scène ${etiquette + 1}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${toile.largeur} ${toile.hauteur}" role="img" aria-label="${echapper(`Aperçu de ${nom}`)}"><rect width="${toile.largeur}" height="${toile.hauteur}" fill="${roles(d).fond}"/><rect x="${z.x}" y="${z.y}" width="${z.largeur}" height="${z.hauteur}" fill="none" stroke="#888888" stroke-width="4" stroke-dasharray="24 16"/>${elements}${cercles}</svg>`;
}
