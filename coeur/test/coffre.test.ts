import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  Coffre,
  ErreurCoffre,
  VERSION_FORMAT,
  creerTemoin,
  deriverSousCle,
  lireCleMaitresse,
  rechiffrer,
  verifierTemoin,
  type ContexteSecret,
} from '../src/infra/coffre.ts';

let dossier: string;
beforeEach(() => {
  dossier = mkdtempSync(join(tmpdir(), 'regie-coffre-'));
});
afterEach(() => {
  rmSync(dossier, { recursive: true, force: true });
});

const contexte = (): ContexteSecret => ({ secretId: randomUUID(), marqueId: randomUUID(), type: 'oauth_meta' });

describe('clé maîtresse', () => {
  it('lit 64 caractères hexadécimaux, fin de ligne tolérée', () => {
    const cle = randomBytes(32);
    const fichier = join(dossier, 'cle');
    writeFileSync(fichier, `${cle.toString('hex')}\n`);
    expect(lireCleMaitresse(fichier).equals(cle)).toBe(true);
  });

  it('refuse une clé absente en nommant le fichier', () => {
    const fichier = join(dossier, 'absente');
    expect(() => lireCleMaitresse(fichier)).toThrow(/absente.*absente/);
  });

  it('refuse un fichier illisible', () => {
    // Un dossier à la place du fichier : la lecture échoue (EISDIR).
    expect(() => lireCleMaitresse(dossier)).toThrow(/illisible/);
  });

  it('refuse une clé invalide sans jamais écrire sa valeur', () => {
    const fichier = join(dossier, 'cle');
    const mauvaises = [randomBytes(16).toString('hex'), `${randomBytes(31).toString('hex')}zz`, randomBytes(40).toString('base64'), ''];
    for (const valeur of mauvaises) {
      writeFileSync(fichier, valeur);
      let message = '';
      try {
        lireCleMaitresse(fichier);
      } catch (erreur) {
        expect(erreur).toBeInstanceOf(ErreurCoffre);
        message = (erreur as Error).message;
      }
      expect(message).toMatch(/invalide/);
      if (valeur !== '') expect(message).not.toContain(valeur);
    }
  });

  it('refuse une clé constante', () => {
    const fichier = join(dossier, 'cle');
    writeFileSync(fichier, '00'.repeat(32));
    expect(() => lireCleMaitresse(fichier)).toThrow(/constante/);
  });

  it('dérive des sous-clés distinctes et stables', () => {
    const cle = randomBytes(32);
    const coffre = deriverSousCle(cle, 'coffre');
    expect(coffre).toHaveLength(32);
    expect(coffre.equals(deriverSousCle(cle, 'coffre'))).toBe(true);
    expect(coffre.equals(deriverSousCle(cle, 'liens'))).toBe(false);
    expect(coffre.equals(deriverSousCle(cle, 'hmac-adresses'))).toBe(false);
    expect(coffre.equals(cle)).toBe(false);
  });
});

describe('chiffrement du coffre', () => {
  it('chiffre au format versionné et redonne le clair', () => {
    const coffre = new Coffre(randomBytes(32));
    const c = contexte();
    const clair = randomBytes(24).toString('base64');
    const blob = coffre.chiffrer(clair, c);
    expect(blob[0]).toBe(VERSION_FORMAT);
    expect(blob.toString('latin1')).not.toContain(clair);
    expect(coffre.dechiffrer(blob, c).toString('utf8')).toBe(clair);
  });

  it('ne produit jamais deux fois le même chiffré (IV aléatoire)', () => {
    const coffre = new Coffre(randomBytes(32));
    const c = contexte();
    expect(coffre.chiffrer('valeur-de-test', c).equals(coffre.chiffrer('valeur-de-test', c))).toBe(false);
  });

  it('refuse un chiffré déplacé vers un autre secret, une autre marque ou un autre type (AAD)', () => {
    const coffre = new Coffre(randomBytes(32));
    const c = contexte();
    const blob = coffre.chiffrer('valeur-de-test', c);
    expect(() => coffre.dechiffrer(blob, { ...c, secretId: randomUUID() })).toThrow(ErreurCoffre);
    expect(() => coffre.dechiffrer(blob, { ...c, marqueId: randomUUID() })).toThrow(ErreurCoffre);
    expect(() => coffre.dechiffrer(blob, { ...c, type: 'autre_type' })).toThrow(ErreurCoffre);
  });

  it('distingue les parties de l’AAD même quand on déplace une frontière entre elles', () => {
    const coffre = new Coffre(randomBytes(32));
    const blob = coffre.chiffrer('valeur-de-test', { secretId: 'ab', marqueId: 'c', type: 'd' });
    expect(() => coffre.dechiffrer(blob, { secretId: 'a', marqueId: 'bc', type: 'd' })).toThrow(ErreurCoffre);
  });

  it('refuse un chiffré altéré, tronqué, d’une version inconnue ou sous une autre clé', () => {
    const coffre = new Coffre(randomBytes(32));
    const c = contexte();
    const blob = coffre.chiffrer('valeur-de-test', c);
    const altere = Buffer.from(blob);
    altere[altere.length - 1] = (altere[altere.length - 1] ?? 0) ^ 1;
    expect(() => coffre.dechiffrer(altere, c)).toThrow(/impossible/);
    expect(() => coffre.dechiffrer(blob.subarray(0, 10), c)).toThrow(/tronqué/);
    const futur = Buffer.from(blob);
    futur[0] = 9;
    expect(() => coffre.dechiffrer(futur, c)).toThrow(/version 9/);
    expect(() => new Coffre(randomBytes(32)).dechiffrer(blob, c)).toThrow(/impossible/);
  });

  it('n’écrit ni le clair ni le chiffré dans ses messages d’erreur', () => {
    const coffre = new Coffre(randomBytes(32));
    const c = contexte();
    const clair = randomBytes(18).toString('hex');
    const blob = coffre.chiffrer(clair, c);
    let message = '';
    try {
      new Coffre(randomBytes(32)).dechiffrer(blob, c);
    } catch (erreur) {
      message = (erreur as Error).message;
    }
    expect(message).not.toContain(clair);
    expect(message).not.toContain(blob.toString('hex'));
    expect(message).not.toContain(blob.toString('base64'));
  });
});

describe('témoin et rotation', () => {
  it('le témoin prouve la clé : refus sous une autre clé', () => {
    const coffre = new Coffre(randomBytes(32));
    const temoin = creerTemoin(coffre);
    expect(() => verifierTemoin(coffre, temoin)).not.toThrow();
    expect(() => verifierTemoin(new Coffre(randomBytes(32)), temoin)).toThrow(/ne correspond pas/);
  });

  it('rechiffre sous la nouvelle clé sans rien perdre, ancienne clé hors service', () => {
    const ancien = new Coffre(randomBytes(32));
    const nouveau = new Coffre(randomBytes(32));
    const c = contexte();
    const clair = randomBytes(20).toString('hex');
    const blob = rechiffrer(ancien.chiffrer(clair, c), c, ancien, nouveau);
    expect(nouveau.dechiffrer(blob, c).toString('utf8')).toBe(clair);
    expect(() => ancien.dechiffrer(blob, c)).toThrow(ErreurCoffre);
  });
});
