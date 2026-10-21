// regie — l'aperçu d'une scène d'un montage (histoire 3.10, FR-26) : une image SVG 1080x1920 dessinée côté serveur
// avec la même mise en page que les gardes et le rendu. Elle suit chaque modification sans rendu complet. Les éléments
// qui enfreignent une garde sont cerclés de rouge. Le fond est uni (couleur du gabarit) : l'image du film n'est pas
// extraite ici (arbitrage ARB-3.10). Depuis l'histoire 3.11, le SVG joue les animations (SMIL) et montre le cadre du zoom. Le SVG est servi en `<img>` : ses scripts ne s'y exécutent jamais.

import { imagesCle, type ReglageAnimation, type Timeline } from '@regie/contrats';
import { BORNES, type Bornes } from './bornes.ts';
import { dessinerElement, echapper } from './apercu.ts';
import { roles, type DefinitionGabarit, type ElementPrepare } from './gabarit.ts';
import type { Violation } from './gardes.ts';
import { montageEtMesuresTimeline } from './montage.ts';

/** Identifiant de la carte de fin dans l'aperçu (comme dans les gardes). */
export const ID_CARTE_FIN = 'carte-fin';

export type OptionsApercuScene = Readonly<{ violations: readonly Violation[]; bornes?: Bornes }>;

// --- Animations jouées dans l'aperçu (histoire 3.11) : SMIL, sans script, en boucle sur la durée de la scène. ---------
// Mêmes réglages que le rendu (`balisesAnimation`) : fondu, glissement de 90 px, zoom de 40 % à 100 % à l'entrée et
// de 100 % à 60 % à la sortie, délai avant l'entrée. Seul le catalogue du moteur existe dans une timeline.

const sec = (ms: number): string => `${(Math.max(0, ms) / 1000).toFixed(3)}s`;
type Cle = readonly [number, number | string];
const anime = (attribut: string, duree: number, cles: readonly Cle[], type?: string): string => {
  const temps = cles.map(([t]) => Math.min(1, Math.max(0, t / duree)).toFixed(4)).join(';');
  const valeurs = cles.map(([, v]) => v).join(';');
  return type === undefined
    ? `<animate attributeName="${attribut}" dur="${sec(duree)}" repeatCount="indefinite" calcMode="linear" keyTimes="${temps}" values="${valeurs}"/>`
    : `<animateTransform attributeName="${attribut}" type="${type}" dur="${sec(duree)}" repeatCount="indefinite" calcMode="linear" keyTimes="${temps}" values="${valeurs}"/>`;
};

/** Enveloppe `contenu` des animations d'entrée et de sortie d'un réglage, pour une scène qui dure `duree` ms. */
export function animerContenu(contenu: string, a: ReglageAnimation, duree: number, centre: { x: number; y: number }): string {
  if (a.entree === 'aucune' && a.sortie === 'aucune' && a.delaiMs === 0) return contenu;
  const debut = Math.min(a.delaiMs, Math.max(0, duree - 200));
  const d = Math.min(a.dureeMs, Math.max(100, Math.floor((duree - debut) / 2)), duree - debut);
  const fin = Math.min(debut + d, duree);
  const opacite: Cle[] = [];
  if (debut > 0) opacite.push([0, 0]);
  opacite.push([debut, a.entree === 'aucune' ? 1 : 0], [fin, 1]);
  if (a.sortie === 'aucune') opacite.push([duree, 1]);
  else opacite.push([Math.max(fin, duree - d), 1], [duree, 0]);
  let corps = contenu;
  if (a.entree === 'zoom' || a.sortie === 'zoom') {
    const echelle: Cle[] = [];
    if (debut > 0) echelle.push([0, a.entree === 'zoom' ? 0.4 : 1]);
    echelle.push([debut, a.entree === 'zoom' ? 0.4 : 1], [fin, 1]);
    if (a.sortie === 'zoom') echelle.push([Math.max(fin, duree - d), 1], [duree, 0.6]);
    else echelle.push([duree, 1]);
    corps = `<g transform="translate(${centre.x} ${centre.y})"><g>${anime('transform', duree, echelle, 'scale')}<g transform="translate(${-centre.x} ${-centre.y})">${corps}</g></g></g>`;
  }
  if (a.entree === 'glisse_haut' || a.entree === 'glisse_bas') {
    const decalage = a.entree === 'glisse_haut' ? 90 : -90;
    const pas: Cle[] = [];
    if (debut > 0) pas.push([0, `0 ${decalage}`]);
    pas.push([debut, `0 ${decalage}`], [fin, '0 0'], [duree, '0 0']);
    corps = `<g>${anime('transform', duree, pas, 'translate')}${corps}</g>`;
  }
  return `<g>${anime('opacity', duree, opacite)}${corps}</g>`;
}

const centreDe = (e: ElementPrepare): { x: number; y: number } => ({ x: e.disposition.boite.x + e.disposition.boite.largeur / 2, y: e.disposition.boite.y + e.disposition.boite.hauteur / 2 });

/** Le cadre du zoom automatique, qui suit les images clés du rendu, et les clics qui le déclenchent. */
function dessinerZoom(scene: Timeline['scenes'][number], largeur: number, hauteur: number): string {
  if (!scene.zoom.actif || scene.points.length === 0) return '';
  const cles = imagesCle(scene);
  const duree = scene.dureeMs;
  const cadre = (c: { z: number; cx: number; cy: number }) => {
    const w = largeur / c.z;
    const h = hauteur / c.z;
    return { x: Math.min(largeur - w, Math.max(0, c.cx * largeur - w / 2)), y: Math.min(hauteur - h, Math.max(0, c.cy * hauteur - h / 2)), w, h };
  };
  const liste = cles.map((c) => ({ t: c.t, ...cadre(c) }));
  const suite = (cle: 'x' | 'y' | 'w' | 'h'): Cle[] => liste.map((c) => [c.t, c[cle].toFixed(1)]);
  const premier = liste[0]!;
  const vitesse = (scene.sourceFinMs - scene.sourceDebutMs) / scene.dureeMs;
  const clics = scene.points.map((p) => `<circle cx="${((p.x / 1000) * largeur).toFixed(1)}" cy="${((p.y / 1000) * hauteur).toFixed(1)}" r="18" fill="#FFC94D" fill-opacity="0.85" stroke="#000000" stroke-width="4" data-t="${Math.round(p.t / vitesse)}"/>`).join('');
  return `${clics}<rect x="${premier.x.toFixed(1)}" y="${premier.y.toFixed(1)}" width="${premier.w.toFixed(1)}" height="${premier.h.toFixed(1)}" fill="none" stroke="#3DDC84" stroke-width="10">${anime('x', duree, suite('x'))}${anime('y', duree, suite('y'))}${anime('width', duree, suite('w'))}${anime('height', duree, suite('h'))}</rect>`;
}

/** L'image d'une scène (`sceneId`) ou de la carte de fin (`ID_CARTE_FIN`) ; `undefined` si elle n'existe pas. */
export function apercuScene(t: Timeline, d: DefinitionGabarit, sceneId: string, o: OptionsApercuScene): string | undefined {
  const bornes = o.bornes ?? BORNES;
  const { toile, zoneSure: z } = bornes;
  const { scenes } = montageEtMesuresTimeline(t, d, bornes);
  const scene = scenes.find((s) => s.id === sceneId);
  if (scene === undefined) return undefined;
  const fautifs = new Set(o.violations.filter((v) => v.segment === sceneId).map((v) => v.element));
  // Seuls l'accroche, le texte à l'écran et la carte de fin sont animés (comme dans le rendu) ; les sous-titres ne le sont pas.
  const reglage: ReglageAnimation | undefined = sceneId === ID_CARTE_FIN ? t.carteFin?.animation : t.scenes.find((x) => x.id === sceneId)?.animation;
  const duree = sceneId === ID_CARTE_FIN ? (t.carteFin?.dureeMs ?? 1000) : (t.scenes.find((x) => x.id === sceneId)?.dureeMs ?? 1000);
  const elements = scene.elements.map((e) => (e.genre === 'sous_titre' || reglage === undefined ? dessinerElement(e, d) : animerContenu(dessinerElement(e, d), reglage, duree, centreDe(e)))).join('');
  const scenePleine = t.scenes.find((x) => x.id === sceneId);
  const zoom = scenePleine === undefined ? '' : dessinerZoom(scenePleine, toile.largeur, toile.hauteur);
  const cercles = scene.elements
    .filter((e) => fautifs.has(e.id))
    .map((e) => `<rect x="${e.disposition.boite.x - 8}" y="${e.disposition.boite.y - 8}" width="${e.disposition.boite.largeur + 16}" height="${e.disposition.boite.hauteur + 16}" rx="20" fill="none" stroke="#E5484D" stroke-width="10"/>`)
    .join('');
  const etiquette = t.scenes.findIndex((s) => s.id === sceneId);
  const nom = sceneId === ID_CARTE_FIN ? 'la carte de fin' : `la scène ${etiquette + 1}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${toile.largeur} ${toile.hauteur}" role="img" aria-label="${echapper(`Aperçu de ${nom}`)}"><rect width="${toile.largeur}" height="${toile.hauteur}" fill="${roles(d).fond}"/><rect x="${z.x}" y="${z.y}" width="${z.largeur}" height="${z.hauteur}" fill="none" stroke="#888888" stroke-width="4" stroke-dasharray="24 16"/>${zoom}${elements}${cercles}</svg>`;
}
