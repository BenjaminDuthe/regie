import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { ErreurPaquet, Reception, validerPlan } from '../src/paquet.ts';

const plan = (surcharge: Record<string, unknown> = {}): Record<string, unknown> => ({
  graphe: 'x',
  ass: 'y',
  args: ['-y', '-i', 'film.webm', '-i', 'voix-sc-1.wav', '-/filter_complex', 'graphe.txt', 'sortie.mp4'],
  fichiersVoix: ['voix-sc-1.wav'],
  sansTexte: false,
  ...surcharge,
});

const lignes = (nom: string, octets: Buffer): string[] => [
  JSON.stringify({ fichier: { nom, n: 0, d: octets.toString('base64') } }),
  JSON.stringify({ fichier: { nom, fin: true, octets: octets.length, sha256: createHash('sha256').update(octets).digest('hex') } }),
];

describe('plan reçu par le conteneur de rendu', () => {
  it('accepte un plan cohérent', () => {
    expect(validerPlan(plan()).args.at(-1)).toBe('sortie.mp4');
  });
  it('refuse une entrée hors des fichiers attendus, un chemin qui remonte, ou une sortie ailleurs', () => {
    expect(() => validerPlan(plan({ args: ['-i', 'film.webm', '-i', '/etc/passwd', 'sortie.mp4'] }))).toThrow(ErreurPaquet);
    expect(() => validerPlan(plan({ args: ['-i', 'film.webm', '-i', 'voix-sc-1.wav', '../sortie.mp4'] }))).toThrow(ErreurPaquet);
    expect(() => validerPlan(plan({ args: ['-i', 'film.webm', '-i', 'voix-sc-1.wav', 'autre.mp4'] }))).toThrow(ErreurPaquet);
    expect(() => validerPlan(plan({ fichiersVoix: ['../voix.wav'] }))).toThrow(ErreurPaquet);
    expect(() => validerPlan(null)).toThrow(ErreurPaquet);
    expect(() => validerPlan(plan({ args: Array.from({ length: 300 }, () => '-y') }))).toThrow(ErreurPaquet);
  });
});

describe('réception des fichiers', () => {
  it('réassemble un fichier complet et contrôlé', () => {
    const r = new Reception();
    for (const l of lignes('film.webm', Buffer.from('contenu'))) r.ajouter(l);
    expect(r.fichiers.get('film.webm')?.toString()).toBe('contenu');
    expect(r.enCours).toBe(false);
  });
  it('refuse un nom hors liste, une empreinte fausse, un morceau hors d’ordre ou un doublon', () => {
    expect(() => new Reception().ajouter(lignes('../evil.wav', Buffer.from('x'))[0]!)).toThrow(ErreurPaquet);
    const r = new Reception();
    const [morceau, fin] = lignes('film.webm', Buffer.from('abc'));
    r.ajouter(morceau!);
    expect(() => r.ajouter(fin!.replace(/[0-9a-f]{64}/, '0'.repeat(64)))).toThrow(ErreurPaquet);
    expect(() => new Reception().ajouter(JSON.stringify({ fichier: { nom: 'film.webm', n: 3, d: 'YQ==' } }))).toThrow(ErreurPaquet);
    const d = new Reception();
    for (const l of lignes('film.webm', Buffer.from('a'))) d.ajouter(l);
    expect(() => d.ajouter(lignes('film.webm', Buffer.from('a'))[0]!)).toThrow(ErreurPaquet);
    expect(() => new Reception().ajouter('pas du json')).toThrow(ErreurPaquet);
  });
  it('signale un fichier resté incomplet', () => {
    const r = new Reception();
    r.ajouter(lignes('film.webm', Buffer.from('a'))[0]!);
    expect(r.enCours).toBe(true);
  });
});
