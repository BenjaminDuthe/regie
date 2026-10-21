import { z } from 'zod';
import { describe, expect, it } from 'vitest';
import { EtapesScript, erreursParEtape, premierHoteRefuse } from '../src/scripts.ts';

const lire = (etapes: unknown) => {
  const r = z.strictObject({ etapes: EtapesScript }).safeParse({ etapes });
  return r.success ? { ok: true as const, etapes: r.data.etapes } : { ok: false as const, erreurs: erreursParEtape(r.error, { etapes }) };
};

describe('format des scripts', () => {
  it('accepte les dix verbes', () => {
    const r = lire([
      { verbe: 'aller', url: 'https://demo.exemple.fr/' },
      { verbe: 'connexion' },
      { verbe: 'filmer', mode: 'demarrer' },
      { verbe: 'cliquer', cible: 'Nouveau devis' },
      { verbe: 'saisir', cible: 'css=#nom', valeur: 'Marie' },
      { verbe: 'attendre', cible: 'Devis créé' },
      { verbe: 'survoler', cible: 'Total' },
      { verbe: 'defiler', pixels: 400 },
      { verbe: 'pause', secondes: 1.5 },
      { verbe: 'narration', texte: 'Le devis est prêt.' },
      { verbe: 'filmer', mode: 'arreter' },
    ]);
    expect(r.ok).toBe(true);
  });
  it('nomme l’étape, le verbe et le champ en faute', () => {
    expect(lire([{ verbe: 'aller', url: 'https://a.exemple.fr/' }, { verbe: 'cliquer' }])).toEqual({ ok: false, erreurs: [{ etape: 2, verbe: 'cliquer', champ: 'cible', cause: 'CHAMP_MANQUANT' }] });
    expect(lire([{ verbe: 'danser' }])).toEqual({ ok: false, erreurs: [{ etape: 1, verbe: 'danser', champ: 'verbe', cause: 'VERBE_INCONNU' }] });
    expect(lire([{ verbe: 'connexion', mot: 'x' }])).toEqual({ ok: false, erreurs: [{ etape: 1, verbe: 'connexion', champ: 'mot', cause: 'CHAMP_INCONNU' }] });
    expect(lire([{ verbe: 'pause', secondes: 99 }])).toMatchObject({ ok: false, erreurs: [{ etape: 1, champ: 'secondes', cause: 'VALEUR_INVALIDE' }] });
    expect(lire([{ verbe: 'aller', url: 'http://a.exemple.fr/' }])).toMatchObject({ ok: false, erreurs: [{ etape: 1, champ: 'url', cause: 'URL_REFUSEE' }] });
    expect(lire(['texte'])).toMatchObject({ ok: false, erreurs: [{ etape: 1, cause: 'VERBE_INCONNU' }] });
  });
  it('refuse un arrêt sans démarrage et un double démarrage', () => {
    expect(lire([{ verbe: 'filmer', mode: 'arreter' }])).toMatchObject({ ok: false, erreurs: [{ etape: 1, cause: 'FILMER_SANS_DEBUT' }] });
    expect(lire([{ verbe: 'filmer', mode: 'demarrer' }, { verbe: 'filmer', mode: 'demarrer' }])).toMatchObject({ ok: false, erreurs: [{ etape: 2, cause: 'FILMER_DEJA_EN_COURS' }] });
  });
  it('limite le nombre d’étapes', () => {
    expect(lire(Array.from({ length: 101 }, () => ({ verbe: 'connexion' })))).toMatchObject({ ok: false, erreurs: [{ cause: 'TROP_D_ETAPES' }] });
  });
  it('repère la première étape qui vise un hôte hors liste', () => {
    const etapes = EtapesScript.parse([{ verbe: 'aller', url: 'https://demo.exemple.fr/' }, { verbe: 'aller', url: 'https://pistage.exemple.com/x' }]);
    expect(premierHoteRefuse(etapes, ['demo.exemple.fr'])).toEqual({ etape: 2, hote: 'pistage.exemple.com' });
    expect(premierHoteRefuse(etapes, ['demo.exemple.fr', 'pistage.exemple.com'])).toBeUndefined();
  });
});
