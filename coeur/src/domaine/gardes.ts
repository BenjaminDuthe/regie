// regie — le module unique des gardes (histoire 2.7, FR-28, AR-18) : `(montage, mesures, bornes) → violations[]`.
// Module pur, sans dépendance au navigateur ni à FFmpeg. Il est appelé avant l'enregistrement d'un gabarit ; il le
// sera aussi avant un rendu complet, « garder » et la publication (histoires suivantes). Aucune garde ne se force :
// ce module n'a ni option, ni exception, ni liste d'éléments exemptés, et aucune porte n'en ajoute.

import type { Bornes, Rectangle } from './bornes.ts';

export type GenreElement = 'logo' | 'titre' | 'sous_titre' | 'carte_fin';

/** Ce que les gardes lisent d'un montage : des scènes, et leurs éléments, rien d'autre. */
export type Montage = Readonly<{
  segments: readonly Readonly<{ id: string; debutMs: number; elements: readonly Readonly<{ id: string; genre: GenreElement }>[] }>[];
}>;

/** Les mesures d'un élément, prises sur sa mise en page (contraste, taille du texte, boîte occupée). */
export type Mesure = Readonly<{
  /** Rapport de contraste du texte sur son fond ; `null` pour un élément sans texte. */
  contraste: number | null;
  /** Taille du texte ramenée à `hauteurReferencePx` ; `null` pour un élément sans texte. */
  textePx: number | null;
  boite: Rectangle;
}>;
export type Mesures = Readonly<Record<string, Mesure>>;

export type CodeGarde = 'CONTRASTE' | 'TEXTE_TROP_PETIT' | 'ZONE_SURE';

/** Une garde non respectée : où (scène, code temporel, élément), la mesure et le seuil. */
export type Violation = Readonly<{
  code: CodeGarde;
  segment: string;
  tempsMs: number;
  element: string;
  genre: GenreElement;
  mesure: number;
  seuil: number;
  unite: 'ratio' | 'px';
}>;

const arrondir = (valeur: number): number => Math.round(valeur * 100) / 100;

/** Dépassement maximal de la boîte hors de la zone, en pixels ; 0 si elle est entièrement dedans. */
export function depassement(boite: Rectangle, zone: Rectangle): number {
  return Math.max(0, zone.x - boite.x, zone.y - boite.y, boite.x + boite.largeur - (zone.x + zone.largeur), boite.y + boite.hauteur - (zone.y + zone.hauteur));
}

export function evaluerGardes(montage: Montage, mesures: Mesures, bornes: Bornes): Violation[] {
  const violations: Violation[] = [];
  for (const segment of montage.segments) {
    for (const element of segment.elements) {
      const mesure = mesures[element.id];
      if (mesure === undefined) continue;
      const lieu = { segment: segment.id, tempsMs: segment.debutMs, element: element.id, genre: element.genre };
      if (mesure.contraste !== null && mesure.contraste < bornes.contrasteMin) {
        violations.push({ ...lieu, code: 'CONTRASTE', mesure: arrondir(mesure.contraste), seuil: bornes.contrasteMin, unite: 'ratio' });
      }
      if (mesure.textePx !== null && mesure.textePx < bornes.texteMinPx) {
        violations.push({ ...lieu, code: 'TEXTE_TROP_PETIT', mesure: arrondir(mesure.textePx), seuil: bornes.texteMinPx, unite: 'px' });
      }
      const sortie = depassement(mesure.boite, bornes.zoneSure);
      if (sortie > 0) violations.push({ ...lieu, code: 'ZONE_SURE', mesure: arrondir(sortie), seuil: 0, unite: 'px' });
    }
  }
  return violations;
}

// --- Contraste (WCAG 2.x) -------------------------------------------------------------------------------------

const FORME_COULEUR = /^#[0-9a-f]{6}$/i;
export const estCouleur = (valeur: string): boolean => FORME_COULEUR.test(valeur);

function luminance(couleur: string): number {
  if (!estCouleur(couleur)) throw new Error(`couleur invalide : ${couleur}`);
  const [r, g, b] = [1, 3, 5].map((i) => {
    const canal = Number.parseInt(couleur.slice(i, i + 2), 16) / 255;
    return canal <= 0.03928 ? canal / 12.92 : ((canal + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Rapport de contraste de 1 (identiques) à 21 (noir sur blanc). */
export function contraste(a: string, b: string): number {
  const [clair, sombre] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (clair + 0.05) / (sombre + 0.05);
}

/** Code temporel `mm:ss.d` d'un instant en millisecondes. */
export function codeTemporel(ms: number): string {
  const total = Math.max(0, Math.round(ms));
  const minutes = Math.floor(total / 60_000);
  const secondes = Math.floor((total % 60_000) / 1000);
  return `${String(minutes).padStart(2, '0')}:${String(secondes).padStart(2, '0')}.${Math.floor((total % 1000) / 100)}`;
}
