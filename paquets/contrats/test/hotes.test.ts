// Histoire 4.1 : liste stricte d'hôtes — formes acceptées et refusées.
import { describe, expect, it } from 'vitest';
import { hoteAutorise, hoteDeUrl, normaliserHote } from '../src/hotes.ts';

describe('normaliserHote', () => {
  it('normalise un nom de domaine (minuscules, point final, punycode)', () => {
    expect(normaliserHote('  Demo.Etablia.FR. ')).toEqual({ ok: true, hote: 'demo.etablia.fr' });
    expect(normaliserHote('bücher.example.org')).toEqual({ ok: true, hote: 'xn--bcher-kva.example.org' });
  });

  it.each([
    ['', 'VIDE'],
    ['*.etablia.fr', 'JOKER'],
    ['etablia.fr:8443', 'FORME'],
    ['https://etablia.fr', 'FORME'],
    ['etablia.fr/chemin', 'FORME'],
    ['a@etablia.fr', 'FORME'],
    ['127.0.0.1', 'ADRESSE_IP'],
    ['2130706433', 'ADRESSE_IP'],
    ['0x7f.1', 'ADRESSE_IP'],
    ['192.168.1.20', 'ADRESSE_IP'],
    ['[::1]', 'ADRESSE_IP'],
    ['::1', 'ADRESSE_IP'],
    ['localhost', 'LOCAL'],
    ['nas.local', 'LOCAL'],
    ['routeur.lan', 'LOCAL'],
    ['proxmox.home.arpa', 'LOCAL'],
    ['service.internal', 'LOCAL'],
    ['monsite', 'LOCAL'],
    ['-mauvais.example.com', 'FORME'],
    ['a..b.com', 'FORME'],
  ])('refuse « %s » (%s)', (brut, cause) => {
    expect(normaliserHote(brut)).toEqual({ ok: false, cause });
  });
});

describe('hoteDeUrl', () => {
  it('lit l’hôte d’une adresse https', () => {
    expect(hoteDeUrl('https://Demo.Etablia.fr/accueil?x=1')).toBe('demo.etablia.fr');
    expect(hoteDeUrl('https://demo.etablia.fr:443/')).toBe('demo.etablia.fr');
  });
  it('refuse http, les identifiants, un autre port, une IP et une adresse illisible', () => {
    for (const a of ['http://demo.etablia.fr/', 'https://u:p@demo.etablia.fr/', 'https://demo.etablia.fr:8443/', 'https://10.0.0.5/', 'pas une adresse', 'javascript:alert(1)']) {
      expect(hoteDeUrl(a)).toBeUndefined();
    }
  });
});

describe('hoteAutorise', () => {
  it('compare à la liste stricte, sans joker ni sous-domaine implicite', () => {
    expect(hoteAutorise('demo.etablia.fr', ['demo.etablia.fr'])).toBe(true);
    expect(hoteAutorise('autre.etablia.fr', ['demo.etablia.fr'])).toBe(false);
    expect(hoteAutorise('demo.etablia.fr.evil.com', ['demo.etablia.fr'])).toBe(false);
  });
});
