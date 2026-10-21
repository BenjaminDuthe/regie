import { describe, expect, it } from 'vitest';
import { appliquerOperations } from '../src/edition.ts';
import { depuisJournal } from '../src/timeline.ts';

const base = depuisJournal(
  [
    { t: 0, genre: 'film_debut' },
    { t: 100, genre: 'narration', cible: 'Un.' },
    { t: 3000, genre: 'narration', cible: 'Deux.' },
    { t: 6000, genre: 'film_fin' },
  ],
  { filmDureeMs: 6000, titre: 'Démo' },
);
const [a, b] = base.scenes.map((s) => s.id) as [string, string];

describe('édition : opérations pures', () => {
  it('change un texte sans toucher aux autres scènes', () => {
    const r = appliquerOperations(base, [{ op: 'texte', sceneId: a, accroche: 'Nouveau', texteEcran: 'Écran' }]);
    expect(r.ok && r.timeline.scenes[0]).toMatchObject({ accroche: 'Nouveau', texteEcran: 'Écran' });
    expect(r.ok && r.timeline.scenes[1]).toEqual(base.scenes[1]);
  });
  it('ne modifie pas la timeline de départ', () => {
    const avant = JSON.stringify(base);
    appliquerOperations(base, [{ op: 'duree', sceneId: a, dureeMs: base.scenes[0]!.dureeMs + 500 }]);
    expect(JSON.stringify(base)).toBe(avant);
  });
  it('déplace, duplique et retire', () => {
    const r = appliquerOperations(base, [{ op: 'deplacer', sceneId: b, sens: 'monter' }, { op: 'dupliquer', sceneId: a }]);
    expect(r.ok && r.timeline.scenes.map((s) => s.id)).toEqual([b, a, 'sc-3']);
    const r2 = appliquerOperations(base, [{ op: 'retirer', sceneId: a }]);
    expect(r2.ok && r2.timeline.scenes.map((s) => s.id)).toEqual([b]);
  });
  it('pose puis retire la carte de fin', () => {
    const r = appliquerOperations(base, [{ op: 'carte_fin', titre: 'Merci' }]);
    expect(r.ok && r.timeline.carteFin).toMatchObject({ titre: 'Merci', dureeMs: 3000 });
    const r2 = r.ok ? appliquerOperations(r.timeline, [{ op: 'carte_fin', retirer: true }]) : r;
    expect(r2.ok && r2.timeline.carteFin).toBeNull();
  });
  it('refuse une scène inconnue', () => {
    expect(appliquerOperations(base, [{ op: 'texte', sceneId: 'nope', accroche: 'x' }])).toMatchObject({ ok: false, code: 'SCENE_INTROUVABLE', sceneId: 'nope' });
  });
  it('refuse de retirer la dernière scène', () => {
    const seule = appliquerOperations(base, [{ op: 'retirer', sceneId: a }]);
    expect(seule.ok && appliquerOperations(seule.timeline, [{ op: 'retirer', sceneId: b }])).toMatchObject({ ok: false, code: 'DERNIERE_SCENE' });
  });
  it('refuse une durée qui rend la vitesse impossible, en nommant la scène', () => {
    expect(appliquerOperations(base, [{ op: 'duree', sceneId: a, dureeMs: 500 }])).toMatchObject({ ok: false, code: 'TIMELINE_INVALIDE', sceneId: a });
  });
  it('n’applique rien si une opération échoue', () => {
    const r = appliquerOperations(base, [{ op: 'texte', sceneId: a, accroche: 'ok' }, { op: 'retirer', sceneId: 'nope' }]);
    expect(r.ok).toBe(false);
  });
});
