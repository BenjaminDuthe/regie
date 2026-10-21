// Contraste des jetons de theme.css (WCAG 2.2, niveau AA : 4,5:1 pour le texte courant).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('../src/styles/theme.css', import.meta.url), 'utf8');

function jeton(nom: string): string {
  const trouve = css.match(new RegExp(`--${nom}:\\s*(#[0-9a-f]{6})\\s*;`, 'i'));
  if (!trouve?.[1]) throw new Error(`jeton --${nom} absent ou non hexadécimal`);
  return trouve[1];
}

function luminance(hex: string): number {
  const [r, v, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * v + 0.0722 * b;
}

function contraste(a: string, b: string): number {
  const [clair, sombre] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (clair + 0.05) / (sombre + 0.05);
}

describe('contraste des jetons', () => {
  const fonds = ['fond', 'surface', 'surface-2'];
  const textes = ['texte', 'doux', 'accent', 'garder', 'jeter', 'doute'];

  for (const fond of fonds) {
    for (const texte of textes) {
      it(`--${texte} sur --${fond} atteint 4,5:1`, () => {
        expect(contraste(jeton(texte), jeton(fond))).toBeGreaterThanOrEqual(4.5);
      });
    }
  }
});
