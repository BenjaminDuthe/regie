import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ClientBase } from 'pg';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DOSSIER_MIGRATIONS } from '../src/infra/demarrage.ts';
import {
  ErreurMigration,
  appliquerMigrations,
  empreinte,
  lireMigrations,
  planifier,
  type FichierMigration,
} from '../src/infra/migrations.ts';

let dossier: string;
beforeEach(() => {
  dossier = mkdtempSync(join(tmpdir(), 'regie-migrations-'));
});
afterEach(() => {
  rmSync(dossier, { recursive: true, force: true });
});

const fichier = (numero: number, sql = 'SELECT 1;'): FichierMigration => ({
  nom: `${String(numero).padStart(4, '0')}_test.sql`,
  numero,
  sql,
  sha256: empreinte(sql),
});

describe('lecture du dossier', () => {
  it('lit les migrations dans l’ordre numérique avec leur SHA-256', () => {
    writeFileSync(join(dossier, '0002_deux.sql'), 'SELECT 2;');
    writeFileSync(join(dossier, '0001_un.sql'), 'SELECT 1;');
    writeFileSync(join(dossier, '.gitkeep'), '');
    const lues = lireMigrations(dossier);
    expect(lues.map((m) => m.nom)).toEqual(['0001_un.sql', '0002_deux.sql']);
    expect(lues[0]?.sha256).toBe(empreinte('SELECT 1;'));
    expect(lues[0]?.sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it('refuse un nom mal formé, un trou ou un doublon de numéro', () => {
    writeFileSync(join(dossier, 'migration.sql'), '');
    expect(() => lireMigrations(dossier)).toThrow(/mal nommé : migration\.sql/);
    rmSync(join(dossier, 'migration.sql'));
    writeFileSync(join(dossier, '0001_un.sql'), '');
    writeFileSync(join(dossier, '0003_trois.sql'), '');
    expect(() => lireMigrations(dossier)).toThrow(/rompue à 0003_trois\.sql/);
    writeFileSync(join(dossier, '0002_deux.sql'), '');
    writeFileSync(join(dossier, '0002_bis.sql'), '');
    expect(() => lireMigrations(dossier)).toThrow(/rompue/);
  });

  it('lit celles du dépôt : nommées, numérotées sans trou, RLS forcée présente dans le socle', () => {
    const lues = lireMigrations(DOSSIER_MIGRATIONS);
    expect(lues.length).toBeGreaterThan(0);
    expect(readdirSync(DOSSIER_MIGRATIONS).filter((n) => n !== '.gitkeep')).toHaveLength(lues.length);
    const socle = lues[0]?.sql ?? '';
    expect(socle).toMatch(/ALTER TABLE secrets FORCE ROW LEVEL SECURITY/);
    expect(socle).not.toMatch(/PASSWORD/i);
  });
});

describe('planification', () => {
  it('rend les migrations non appliquées, dans l’ordre', () => {
    const disque = [fichier(1), fichier(2), fichier(3)];
    expect(planifier(disque, []).map((m) => m.numero)).toEqual([1, 2, 3]);
    expect(planifier(disque, [{ nom: disque[0]!.nom, sha256: disque[0]!.sha256 }]).map((m) => m.numero)).toEqual([2, 3]);
    expect(planifier(disque, disque)).toEqual([]);
  });

  it('refuse, en le nommant, un fichier appliqué puis modifié', () => {
    const appliquee = fichier(1, 'SELECT 1;');
    const modifiee = fichier(1, 'SELECT 2;');
    expect(() => planifier([modifiee], [{ nom: appliquee.nom, sha256: appliquee.sha256 }])).toThrow(
      new RegExp(`modifiée : ${appliquee.nom}`),
    );
  });

  it('refuse, en le nommant, un fichier appliqué puis retiré', () => {
    const appliquee = fichier(1);
    expect(() => planifier([], [{ nom: appliquee.nom, sha256: appliquee.sha256 }])).toThrow(/absente du dossier : 0001_test\.sql/);
  });

  it('refuse une migration glissée avant des migrations déjà appliquées', () => {
    const un = fichier(1);
    const deux = fichier(2);
    expect(() => planifier([un, deux], [{ nom: deux.nom, sha256: deux.sha256 }])).toThrow(/avant des migrations déjà appliquées : 0001_test\.sql/);
  });
});

/** Faux client : mémorise les requêtes et simule `migrations_appliquees`. */
function faussePg(deja: { nom: string; sha256: string }[] = [], echecSur?: string) {
  const requetes: string[] = [];
  const inscrites: string[] = [];
  const client = {
    async query(texte: string, valeurs?: unknown[]) {
      requetes.push(texte.trim().split('\n')[0]!.trim());
      if (echecSur !== undefined && texte.includes(echecSur)) throw new Error('syntaxe invalide');
      if (texte.startsWith('SELECT nom, sha256')) return { rows: deja };
      if (texte.startsWith('INSERT INTO migrations_appliquees')) inscrites.push(String(valeurs?.[0]));
      return { rows: [] };
    },
  } as unknown as ClientBase;
  return { client, requetes, inscrites };
}

describe('application', () => {
  it('applique tout dans une seule transaction et inscrit chaque SHA-256', async () => {
    const { client, requetes, inscrites } = faussePg();
    const appliquees = await appliquerMigrations(client, [fichier(1, 'CREATE TABLE a ();'), fichier(2, 'CREATE TABLE b ();')]);
    expect(appliquees).toEqual(['0001_test.sql', '0002_test.sql']);
    expect(inscrites).toEqual(['0001_test.sql', '0002_test.sql']);
    expect(requetes[0]).toBe('BEGIN');
    expect(requetes.at(-1)).toBe('COMMIT');
    expect(requetes.filter((r) => r === 'BEGIN' || r === 'COMMIT')).toHaveLength(2);
  });

  it('annule tout et nomme la migration en échec', async () => {
    const { client, requetes } = faussePg([], 'CASSE');
    await expect(appliquerMigrations(client, [fichier(1), fichier(2, 'CASSE;')])).rejects.toThrow(
      /migration échouée : 0002_test\.sql/,
    );
    expect(requetes.at(-1)).toBe('ROLLBACK');
    expect(requetes).not.toContain('COMMIT');
  });

  it('refuse sans rien appliquer quand un fichier appliqué a changé', async () => {
    const ancien = fichier(1, 'SELECT 1;');
    const { client, requetes, inscrites } = faussePg([{ nom: ancien.nom, sha256: ancien.sha256 }]);
    const erreur = await appliquerMigrations(client, [fichier(1, 'SELECT 999;'), fichier(2)]).catch((e: unknown) => e);
    expect(erreur).toBeInstanceOf(ErreurMigration);
    expect((erreur as Error).message).toContain('0001_test.sql');
    expect(inscrites).toEqual([]);
    expect(requetes.at(-1)).toBe('ROLLBACK');
  });
});
