import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { verifierChaines } from './verifier-chaines.mjs';

const temporaires = [];
const MOTS = JSON.stringify({ mots: ['timeline', 'image clé', 'codec'] });

/** Faux dépôt : les chaînes (objet) et, au choix, la liste de mots interdits. */
function depot(chaines, mots = MOTS) {
  const racine = mkdtempSync(join(tmpdir(), 'regie-chaines-'));
  temporaires.push(racine);
  const fichiers = { 'coeur/src/chaines.json': JSON.stringify(chaines), 'deploiement/mots-interdits.json': mots };
  for (const [chemin, contenu] of Object.entries(fichiers)) {
    mkdirSync(dirname(join(racine, chemin)), { recursive: true });
    writeFileSync(join(racine, chemin), contenu);
  }
  return racine;
}

afterEach(() => {
  for (const racine of temporaires.splice(0)) rmSync(racine, { recursive: true, force: true });
});

describe('verifier-chaines', () => {
  it('passe sur le dépôt', () => {
    expect(verifierChaines()).toEqual([]);
  });

  it('accepte des textes tutoyés et des heures en clair', () => {
    const racine = depot({ $commentaire: 'timeline vous', ok: 'Tes 3 brouillons sont prêts vers 18 h 40.' });
    expect(verifierChaines(racine)).toEqual([]);
  });

  it('échoue sur un mot interdit en nommant la clé et le mot', () => {
    const fautes = verifierChaines(depot({ editeur: { aide: 'Déplace le clip sur la Timeline.' } }));
    expect(fautes).toHaveLength(1);
    expect(fautes[0]).toContain('« editeur.aide »');
    expect(fautes[0]).toContain('« timeline »');
  });

  it.each([
    ['pluriel', 'Les timelines sont longues.'],
    ['accents ignorés', 'Choisis une image cle.'],
    ['casse ignorée', 'CODEC choisi.'],
  ])('détecte le mot interdit (%s)', (_nom, texte) => {
    expect(verifierChaines(depot({ t: texte }))).toHaveLength(1);
  });

  it('ne confond pas un mot interdit avec un mot plus long', () => {
    expect(verifierChaines(depot({ t: 'Un codecage inconnu et timelinesque' }))).toEqual([]);
  });

  it.each([
    ['vous', 'Vous avez 3 vidéos.'],
    ['votre', 'Voici votre brouillon.'],
    ['vos', 'Gardez vos vidéos.'],
  ])('échoue sur le vouvoiement (%s)', (_nom, texte) => {
    const fautes = verifierChaines(depot({ t: texte }));
    expect(fautes).toHaveLength(1);
    expect(fautes[0]).toContain('vouvoiement');
  });

  it.each(['Prêt à 18:40.', 'Prêt à 18h40.', 'Prêt à 7:05.'])('échoue sur une heure collée (%s)', (texte) => {
    const fautes = verifierChaines(depot({ t: texte }));
    expect(fautes).toHaveLength(1);
    expect(fautes[0]).toContain('heure');
  });

  it('parcourt les textes imbriqués', () => {
    const fautes = verifierChaines(depot({ a: { b: { c: 'un codec' } } }));
    expect(fautes[0]).toContain('« a.b.c »');
  });

  it('échoue si le fichier de chaînes ou la liste manque', () => {
    const racine = mkdtempSync(join(tmpdir(), 'regie-chaines-'));
    temporaires.push(racine);
    expect(verifierChaines(racine)).toHaveLength(2);
  });

  it('échoue si la liste de mots interdits est vide', () => {
    expect(verifierChaines(depot({ t: 'ok' }, JSON.stringify({ mots: [] })))).toHaveLength(1);
  });
});
