import { describe, expect, it } from 'vitest';
import { appliquerOperations } from '../src/edition.ts';
import { OperationEdition } from '../src/edition.ts';
import { construirePlanRendu, type ParametresTexte } from '../src/rendu.ts';
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

  it('règle l’animation, la transition et le zoom d’une scène sans toucher aux autres champs', () => {
    const r = appliquerOperations(base, [
      { op: 'animation', sceneId: a, entree: 'glisse_haut', sortie: 'fondu', dureeMs: 800, delaiMs: 200 },
      { op: 'transition', sceneId: b, transition: 'coupe' },
      { op: 'zoom', sceneId: a, niveau: 2.2, decalageMs: -300 },
    ]);
    expect(r.ok && r.timeline.scenes[0]).toMatchObject({ animation: { entree: 'glisse_haut', sortie: 'fondu', dureeMs: 800, delaiMs: 200 }, zoom: { actif: true, niveau: 2.2, decalageMs: -300 } });
    expect(r.ok && r.timeline.scenes[1]?.transition).toBe('coupe');
    const sans = appliquerOperations(base, [{ op: 'zoom', sceneId: a, actif: false }]);
    expect(sans.ok && sans.timeline.scenes[0]?.zoom).toMatchObject({ actif: false });
  });
  it('anime la carte de fin, mais pas une carte absente', () => {
    expect(appliquerOperations(base, [{ op: 'animation_carte', entree: 'zoom' }])).toMatchObject({ ok: false, code: 'TIMELINE_INVALIDE' });
    const r = appliquerOperations(base, [{ op: 'carte_fin', titre: 'Merci' }, { op: 'animation_carte', entree: 'zoom', delaiMs: 100 }]);
    expect(r.ok && r.timeline.carteFin?.animation).toMatchObject({ entree: 'zoom', delaiMs: 100 });
  });
  it('seul le catalogue du moteur est accepté', () => {
    expect(OperationEdition.safeParse({ op: 'animation', sceneId: a, entree: 'rebond' }).success).toBe(false);
    expect(OperationEdition.safeParse({ op: 'animation', sceneId: a, sortie: 'glisse_haut' }).success).toBe(false);
    expect(OperationEdition.safeParse({ op: 'transition', sceneId: a, transition: 'volet' }).success).toBe(false);
    expect(OperationEdition.safeParse({ op: 'animation', sceneId: a, dureeMs: 50 }).success).toBe(false);
    expect(OperationEdition.safeParse({ op: 'zoom', sceneId: a, niveau: 9 }).success).toBe(false);
    expect(OperationEdition.safeParse({ op: 'animation', sceneId: a, entree: 'zoom', dureeMs: 500 }).success).toBe(true);
  });
  it('FR-30 : le même montage donne le même plan de rendu, octet pour octet, et un réglage change ce plan', () => {
    const p: ParametresTexte = {
      couleurTexte: '#FFFFFF', couleurFond: '#000000', couleurPrincipale: '#3366FF', couleurAccent: '#FFCC00',
      policeTitres: 'Inter', policeSousTitres: 'Inter', tailleTitre: 80, tailleSousTitres: 48, capitalesSousTitres: false,
      zone: { x: 60, y: 160, largeur: 960, hauteur: 1600 },
    };
    const r = appliquerOperations(base, [{ op: 'animation', sceneId: a, entree: 'zoom' }, { op: 'carte_fin', titre: 'Merci' }]);
    if (!r.ok) throw new Error('timeline refusée');
    const copie = JSON.parse(JSON.stringify(r.timeline)) as typeof r.timeline;
    const un = JSON.stringify(construirePlanRendu(r.timeline, p, { genre: 'complet' }));
    expect(JSON.stringify(construirePlanRendu(copie, p, { genre: 'complet' }))).toBe(un);
    const autre = appliquerOperations(r.timeline, [{ op: 'animation', sceneId: a, entree: 'fondu' }]);
    expect(autre.ok && JSON.stringify(construirePlanRendu(autre.timeline, p, { genre: 'complet' }))).not.toBe(un);
  });
});
