// Histoire 2.7 : bornes versionnées, gardes (contraste, taille du texte, zone sûre), mise en page, gabarit de départ, polices libres.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BORNES, lireBornes } from '../src/domaine/bornes.ts';
import { GABARIT_DE_DEPART, definitionGabarit, evaluerGabarit, roles, type DefinitionGabarit } from '../src/domaine/gabarit.ts';
import { codeTemporel, contraste, depassement, evaluerGardes, type Montage } from '../src/domaine/gardes.ts';
import { couper, disposer, largeurTexte } from '../src/domaine/mise-en-page.ts';
import { POLICES } from '../src/domaine/polices.ts';

const brut = JSON.parse(readFileSync(new URL('../../deploiement/bornes.json', import.meta.url), 'utf8')) as Record<string, unknown>;
const montage: Montage = { segments: [{ id: 'scene-2', debutMs: 4000, elements: [{ id: 'titre', genre: 'titre' }] }] };
const boiteDedans = { x: 100, y: 300, largeur: 400, hauteur: 200 };

describe('bornes', () => {
  it('le fichier versionné donne les seuils du cahier des charges', () => {
    expect(BORNES.contrasteMin).toBe(4.5);
    expect(BORNES.texteMinPx).toBe(48);
    expect(BORNES.hauteurReferencePx).toBe(1920);
    expect(BORNES.zoneSure).toEqual({ x: 0, y: 220, largeur: 880, hauteur: 1220 });
  });
  it('refuse un fichier incohérent : champ inconnu, seuil absent, zone hors toile', () => {
    expect(() => lireBornes({ ...brut, inconnu: 1 })).toThrow();
    expect(() => lireBornes({ ...brut, contrasteMin: undefined })).toThrow();
    expect(() => lireBornes({ ...brut, zoneSure: { x: 0, y: 220, largeur: 2000, hauteur: 100 } })).toThrow(/zone sûre/);
  });
});

describe('gardes', () => {
  it('contraste : noir sur blanc = 21, identiques = 1, et un contraste suffisant ne lève rien', () => {
    expect(contraste('#000000', '#FFFFFF')).toBeCloseTo(21, 5);
    expect(contraste('#336699', '#336699')).toBeCloseTo(1, 5);
    expect(evaluerGardes(montage, { titre: { contraste: 4.5, textePx: 48, boite: boiteDedans } }, BORNES)).toEqual([]);
  });
  it('contraste sous 4,5:1 : violation qui nomme la scène, le code temporel, l’élément, la mesure et le seuil', () => {
    const [v] = evaluerGardes(montage, { titre: { contraste: 3.2, textePx: 60, boite: boiteDedans } }, BORNES);
    expect(v).toMatchObject({ code: 'CONTRASTE', segment: 'scene-2', tempsMs: 4000, element: 'titre', mesure: 3.2, seuil: 4.5, unite: 'ratio' });
    expect(codeTemporel(v!.tempsMs)).toBe('00:04.0');
  });
  it('texte sous 48 px sur 1920 : violation ; 48 px pile : aucune', () => {
    expect(evaluerGardes(montage, { titre: { contraste: 10, textePx: 47.9, boite: boiteDedans } }, BORNES)).toMatchObject([{ code: 'TEXTE_TROP_PETIT', seuil: 48 }]);
    expect(evaluerGardes(montage, { titre: { contraste: 10, textePx: 48, boite: boiteDedans } }, BORNES)).toEqual([]);
  });
  it('zone sûre : une boîte qui dépasse de 20 px est signalée, une boîte qui touche le bord ne l’est pas', () => {
    expect(depassement({ x: 0, y: 220, largeur: 880, hauteur: 1220 }, BORNES.zoneSure)).toBe(0);
    const trop = { x: 100, y: 300, largeur: 800, hauteur: 200 };
    expect(evaluerGardes(montage, { titre: { contraste: 10, textePx: 60, boite: trop } }, BORNES)).toMatchObject([{ code: 'ZONE_SURE', mesure: 20, seuil: 0 }]);
  });
  it('un élément sans texte n’a ni contraste ni taille à garder ; un élément non mesuré est ignoré', () => {
    expect(evaluerGardes(montage, { titre: { contraste: null, textePx: null, boite: boiteDedans } }, BORNES)).toEqual([]);
    expect(evaluerGardes(montage, {}, BORNES)).toEqual([]);
  });
  it('aucune option ne permet de forcer une garde', () => {
    expect(evaluerGardes.length).toBe(3);
  });
});

describe('mise en page', () => {
  const zone = BORNES.zoneSure;
  it('coupe aux espaces ; un mot trop long reste entier', () => {
    expect(couper('un deux trois', 6, (t) => t.length)).toEqual(['un', 'deux', 'trois']);
    expect(couper('abcdefghij', 4, (t) => t.length)).toEqual(['abcdefghij']);
  });
  it('un titre court tient dans la zone sûre, centré, ancré en haut', () => {
    const d = disposer({ texte: 'Bonjour', police: 'inter', taille: 80, capitales: false, ancre: 'haut', decalage: 240 }, zone);
    expect(depassement(d.boite, zone)).toBe(0);
    expect(d.boite.x + d.boite.largeur / 2).toBeCloseTo(zone.x + zone.largeur / 2, 5);
    expect(d.boite.y).toBe(zone.y + 240);
  });
  it('un long texte passe sur plusieurs lignes sans sortir de la zone', () => {
    const d = disposer({ texte: 'Aujourd’hui, on prépare un déjeuner pour toute la semaine', police: 'inter', taille: 60, capitales: false, ancre: 'bas', decalage: 40 }, zone);
    expect(d.lignes.length).toBeGreaterThan(1);
    expect(depassement(d.boite, zone)).toBe(0);
  });
  it('un mot plus large que la zone dépasse (et sera refusé par la garde)', () => {
    const d = disposer({ texte: 'Anticonstitutionnellement-anticonstitutionnellement', police: 'inter', taille: 80, capitales: false, ancre: 'haut' }, zone);
    expect(depassement(d.boite, zone)).toBeGreaterThan(0);
  });
  it('les capitales sont plus larges que le texte courant', () => {
    expect(largeurTexte('abc', 'inter', 60, true)).toBeGreaterThan(largeurTexte('abc', 'inter', 60, false));
  });
});

describe('gabarit', () => {
  const avec = (changement: Partial<DefinitionGabarit>): DefinitionGabarit => ({ ...GABARIT_DE_DEPART, ...changement });
  it('le gabarit de départ est valide et respecte toutes les gardes', () => {
    expect(definitionGabarit.parse(GABARIT_DE_DEPART)).toEqual(GABARIT_DE_DEPART);
    expect(evaluerGabarit(GABARIT_DE_DEPART)).toEqual([]);
    expect(roles(GABARIT_DE_DEPART)).toMatchObject({ principale: '#1B6B5A', texte: '#FFFFFF' });
  });
  it('les trois styles de sous-titres respectent les gardes avec le gabarit de départ', () => {
    for (const style of ['classique', 'impact', 'karaoke'] as const) expect(evaluerGabarit(avec({ styleSousTitres: style }))).toEqual([]);
  });
  it('une couleur principale claire sous le texte blanc enfreint le contraste, et la violation nomme l’élément', () => {
    const violations = evaluerGabarit(avec({ couleurs: ['#FFD700', '#FFFFFF', '#101820'] }));
    expect(violations.length).toBeGreaterThan(0);
    expect(violations[0]).toMatchObject({ code: 'CONTRASTE', element: 'scene-1-titre', segment: 'scene-1', seuil: 4.5 });
    expect(violations.some((v) => v.element === 'scene-3-carte-fin')).toBe(true);
  });
  it('une couleur d’accent trop proche du fond enfreint le contraste en karaoké seulement', () => {
    const couleurs = ['#1B6B5A', '#FFFFFF', '#101820', '#102030'];
    expect(evaluerGabarit(avec({ couleurs, styleSousTitres: 'karaoke' })).some((v) => v.code === 'CONTRASTE')).toBe(true);
    expect(evaluerGabarit(avec({ couleurs, styleSousTitres: 'classique' }))).toEqual([]);
  });
  it('un titre à mot géant dépasse la zone sûre', () => {
    const d = avec({ carteFin: { titre: 'Anticonstitutionnellement-anticonstitutionnellement', sousTitre: '' } });
    expect(evaluerGabarit(d)).toMatchObject([{ code: 'ZONE_SURE', element: 'scene-3-carte-fin' }]);
  });
  it('la définition refuse un champ inconnu, une couleur mal formée, trop de couleurs, trop de mots-clics', () => {
    expect(definitionGabarit.safeParse({ ...GABARIT_DE_DEPART, forcer: true }).success).toBe(false);
    expect(definitionGabarit.safeParse({ ...GABARIT_DE_DEPART, couleurs: ['rouge', '#FFFFFF'] }).success).toBe(false);
    expect(definitionGabarit.safeParse({ ...GABARIT_DE_DEPART, couleurs: ['#111111'] }).success).toBe(false);
    expect(definitionGabarit.safeParse({ ...GABARIT_DE_DEPART, couleurs: Array(5).fill('#111111') }).success).toBe(false);
    expect(definitionGabarit.safeParse({ ...GABARIT_DE_DEPART, hashtags: ['#a', '#b', '#c', '#d', '#e', '#f'] }).success).toBe(false);
    expect(definitionGabarit.safeParse({ ...GABARIT_DE_DEPART, hashtags: ['sans-diese'] }).success).toBe(false);
  });
});

describe('polices proposées', () => {
  const licences = JSON.parse(readFileSync(new URL('../../deploiement/licences-tiers.json', import.meta.url), 'utf8')) as { polices: { nom: string; licence: string; source: string }[] };
  it('chaque police du catalogue est déclarée avec une licence libre et une source', () => {
    for (const police of Object.values(POLICES)) {
      const declaree = licences.polices.find((p) => p.nom === police.nom);
      expect(declaree, police.nom).toBeDefined();
      expect(declaree!.licence).toBe('OFL-1.1');
      expect(declaree!.source).toMatch(/^https:\/\//);
    }
  });
  it('une police hors catalogue est refusée par la définition', () => {
    expect(definitionGabarit.safeParse({ ...GABARIT_DE_DEPART, policeTitres: 'comic' }).success).toBe(false);
  });
});
