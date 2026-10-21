import { describe, expect, it } from 'vitest';
import {
  Timeline,
  ajusterAuxVoix,
  cadreA,
  depuisJournal,
  deplacerScene,
  dupliquerScene,
  dureeTotaleMs,
  imagesCle,
  retirerScene,
  situerScenes,
  type EntreeJournalMontage,
  type SceneMontage,
} from '../src/timeline.ts';

const journal: EntreeJournalMontage[] = [
  { t: 0, genre: 'film_debut' },
  { t: 100, genre: 'narration', cible: 'Bienvenue sur la page.' },
  { t: 2000, genre: 'clic', x: 800, y: 200 },
  { t: 4000, genre: 'narration', cible: 'Un deuxième temps.' },
  { t: 6000, genre: 'clic', x: 200, y: 900 },
  { t: 9000, genre: 'film_fin' },
];

describe('timeline : construction d’après le journal', () => {
  it('découpe en scènes à chaque narration et rattache les clics', () => {
    const t = depuisJournal(journal, { filmDureeMs: 9500, titre: 'Ma démo' });
    expect(Timeline.safeParse(t).success).toBe(true);
    expect(t.scenes).toHaveLength(2);
    expect(t.scenes[0]!.voix).toBe('Bienvenue sur la page.');
    expect(t.scenes[0]!.accroche).toBe('Ma démo');
    expect(t.scenes[1]!.voix).toBe('Un deuxième temps.');
    expect(t.scenes[0]!.points).toHaveLength(1);
    expect(t.scenes[1]!.points[0]).toMatchObject({ x: 200, y: 900 });
    expect(t.scenes[0]!.sourceFinMs).toBe(t.scenes[1]!.sourceDebutMs);
  });
  it('est déterministe', () => {
    const a = JSON.stringify(depuisJournal(journal, { filmDureeMs: 9500 }));
    expect(JSON.stringify(depuisJournal(journal, { filmDureeMs: 9500 }))).toBe(a);
  });
  it('rend une seule scène pour un journal vide', () => {
    const t = depuisJournal([], { filmDureeMs: 5000 });
    expect(t.scenes).toHaveLength(1);
    expect(t.scenes[0]!.sourceFinMs).toBe(5000);
  });
  it('ne produit jamais de segment hors du film', () => {
    const t = depuisJournal(journal, { filmDureeMs: 5000 });
    for (const s of t.scenes) expect(s.sourceFinMs).toBeLessThanOrEqual(5000);
  });
});

describe('timeline : validation', () => {
  const base = depuisJournal(journal, { filmDureeMs: 9500 });
  it('refuse un segment vide, une vitesse hors limites, un identifiant en double, une animation hors catalogue', () => {
    const s0 = base.scenes[0]!;
    expect(Timeline.safeParse({ ...base, scenes: [{ ...s0, sourceFinMs: s0.sourceDebutMs + 1 }] }).success).toBe(false);
    expect(Timeline.safeParse({ ...base, scenes: [{ ...s0, dureeMs: 120_000 }] }).success).toBe(false);
    expect(Timeline.safeParse({ ...base, scenes: [s0, { ...s0 }] }).success).toBe(false);
    expect(Timeline.safeParse({ ...base, scenes: [{ ...s0, animation: { ...s0.animation, entree: 'tourbillon' } }] }).success).toBe(false);
    expect(Timeline.safeParse({ ...base, scenes: [{ ...s0, sourceFinMs: 99_999 }] }).success).toBe(false);
  });
  it('refuse un champ inconnu', () => {
    expect(Timeline.safeParse({ ...base, extra: 1 }).success).toBe(false);
  });
});

describe('timeline : le cadre suit chaque clic (FR-26)', () => {
  const scene: SceneMontage = { ...depuisJournal(journal, { filmDureeMs: 9500 }).scenes[0]!, sourceDebutMs: 0, sourceFinMs: 4000, dureeMs: 4000, points: [{ t: 2000, x: 800, y: 200 }] };
  it('part du plan large, zoome sur le clic, y reste puis redescend', () => {
    expect(cadreA(scene, 0).z).toBe(1);
    const sur = cadreA(scene, 2000);
    expect(sur.z).toBeCloseTo(scene.zoom.niveau, 5);
    expect(sur.cx).toBeGreaterThan(0.5);
    expect(sur.cy).toBeLessThan(0.5);
    expect(cadreA(scene, 3900).z).toBeLessThan(sur.z);
  });
  it('garde toujours le point cliqué dans le cadre', () => {
    for (let t = 0; t <= 4000; t += 100) {
      const c = cadreA(scene, t);
      const demi = 0.5 / c.z;
      expect(c.cx - demi).toBeGreaterThanOrEqual(-1e-9);
      expect(c.cx + demi).toBeLessThanOrEqual(1 + 1e-9);
      expect(c.cy - demi).toBeGreaterThanOrEqual(-1e-9);
      expect(c.cy + demi).toBeLessThanOrEqual(1 + 1e-9);
    }
    const sur = cadreA(scene, 2000);
    const demi = 0.5 / sur.z;
    expect(0.8).toBeGreaterThanOrEqual(sur.cx - demi);
    expect(0.8).toBeLessThanOrEqual(sur.cx + demi);
  });
  it('reste en plan large sans zoom actif ou sans clic', () => {
    expect(cadreA({ ...scene, zoom: { ...scene.zoom, actif: false } }, 2000).z).toBe(1);
    expect(cadreA({ ...scene, points: [] }, 2000).z).toBe(1);
  });
  it('décale le zoom et change son niveau', () => {
    const tard = { ...scene, zoom: { ...scene.zoom, decalageMs: 500, niveau: 2.5 } };
    expect(cadreA(tard, 2500).z).toBeCloseTo(2.5, 5);
    expect(cadreA(tard, 2000).z).toBeLessThan(2.5);
  });
  it('a des temps strictement croissants, y compris pour des clics proches', () => {
    const serre = { ...scene, points: [{ t: 1000, x: 100, y: 100 }, { t: 1100, x: 900, y: 900 }, { t: 3999, x: 500, y: 500 }] };
    const cles = imagesCle(serre);
    for (let i = 1; i < cles.length; i++) expect(cles[i]!.t).toBeGreaterThan(cles[i - 1]!.t);
  });
});

describe('timeline : édition pure', () => {
  const t = depuisJournal(journal, { filmDureeMs: 9500 });
  it('situe les scènes l’une après l’autre et totalise', () => {
    const s = situerScenes(t);
    expect(s[1]!.debutMs).toBe(s[0]!.finMs);
    expect(dureeTotaleMs(t)).toBe(s[1]!.finMs);
  });
  it('duplique, déplace, retire ; refuse de retirer la dernière scène', () => {
    const d = dupliquerScene(t, 'sc-1')!;
    expect(d.scenes).toHaveLength(3);
    expect(new Set(d.scenes.map((s) => s.id)).size).toBe(3);
    expect(deplacerScene(t, 'sc-1', 'descendre')!.scenes[0]!.id).toBe('sc-2');
    expect(retirerScene(t, 'sc-2')!.scenes).toHaveLength(1);
    expect(retirerScene(retirerScene(t, 'sc-2')!, 'sc-1')).toBeUndefined();
    expect(retirerScene(t, 'inconnue')).toBeUndefined();
  });
  it('rallonge une scène pour que la voix tienne, dans la limite de vitesse', () => {
    const r = ajusterAuxVoix(t, { 'sc-1': 6000 });
    expect(r.scenes[0]!.dureeMs).toBe(6250);
    expect(Timeline.safeParse(r).success).toBe(true);
    expect(ajusterAuxVoix(t, { 'sc-1': 1 }).scenes[0]!.dureeMs).toBe(t.scenes[0]!.dureeMs);
    expect(ajusterAuxVoix(t, {}).scenes).toEqual(t.scenes);
  });
});
