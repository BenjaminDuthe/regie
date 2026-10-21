import { createHash } from 'node:crypto';
import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { dire, validerDemandeVoix } from '../src/voix.ts';

const modeleOctets = Buffer.from('faux-modele-onnx');
const empreinte = createHash('sha256').update(modeleOctets).digest('hex');
let dossier: string;
let sortie: string[];

beforeEach(async () => {
  dossier = await mkdtemp(join(tmpdir(), 'essai-voix-'));
  sortie = [];
  vi.spyOn(process.stdout, 'write').mockImplementation((m: string | Uint8Array) => {
    sortie.push(String(m));
    return true;
  });
  await writeFile(join(dossier, 'gilles.onnx'), modeleOctets);
  // Faux Piper : écrit un WAV minimal dans le fichier demandé.
  await writeFile(join(dossier, 'piper'), '#!/bin/sh\nwhile [ "$1" != "--output_file" ]; do shift; done\nprintf "RIFF1234WAVEfmt " > "$2"\ncat >/dev/null\n');
  await chmod(join(dossier, 'piper'), 0o755);
});
afterEach(async () => {
  vi.restoreAllMocks();
  await rm(dossier, { recursive: true, force: true });
});

async function* lignes(...l: string[]) {
  for (const x of l) yield x;
}
const resultat = () => JSON.parse(sortie.join('').trim().split('\n').at(-1) ?? '{}') as { ok: boolean; cause?: string; octets?: number };
const demande = (o: object) => JSON.stringify({ modele: { fichier: 'gilles.onnx', sha256: empreinte }, texte: 'Bonjour', ...o });

describe('validerDemandeVoix', () => {
  it('accepte une demande valide', () => {
    expect(validerDemandeVoix(JSON.parse(demande({}))).texte).toBe('Bonjour');
  });
  it.each([
    ['chemin sorti du volume', { modele: { fichier: '../etc/passwd.onnx', sha256: empreinte } }],
    ['sous-dossier', { modele: { fichier: 'a/b.onnx', sha256: empreinte } }],
    ['empreinte absente', { modele: { fichier: 'gilles.onnx', sha256: '' } }],
    ['texte vide', { texte: '  ' }],
    ['texte trop long', { texte: 'a'.repeat(2001) }],
    ['caractère de commande', { texte: 'a\u0000b' }],
  ])('refuse : %s', (_nom, o) => {
    expect(() => validerDemandeVoix(JSON.parse(demande(o)))).toThrow();
  });
});

describe('dire', () => {
  it('renvoie le WAV de Piper quand l’empreinte du modèle correspond', async () => {
    await dire(lignes(demande({})), { piper: join(dossier, 'piper'), modeles: dossier });
    expect(resultat().ok).toBe(true);
    expect(sortie.join('')).toContain('{"film":{"n":0');
  });
  it('refuse un modèle dont l’empreinte ne correspond pas', async () => {
    await dire(lignes(demande({ modele: { fichier: 'gilles.onnx', sha256: 'a'.repeat(64) } })), { piper: join(dossier, 'piper'), modeles: dossier });
    expect(resultat()).toEqual({ ok: false, cause: 'MODELE_EMPREINTE' });
    expect(sortie.join('')).not.toContain('"film"');
  });
  it('refuse un modèle absent', async () => {
    await dire(lignes(demande({ modele: { fichier: 'autre.onnx', sha256: empreinte } })), { piper: join(dossier, 'piper'), modeles: dossier });
    expect(resultat().cause).toBe('MODELE_ABSENT');
  });
  it('signale l’échec de Piper', async () => {
    await dire(lignes(demande({})), { piper: '/inexistant', modeles: dossier });
    expect(resultat().cause).toBe('PIPER_ECHEC');
  });
});
