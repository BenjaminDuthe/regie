// Tests de la file et du travailleur (histoire 2.1) contre le double en mémoire. Les mêmes règles sont éprouvées
// contre PostgreSQL dans postgres.integration.test.ts.

import { describe, expect, it, vi } from 'vitest';
import { TACHES } from '@regie/contrats';
import { EXECUTANTS } from '../src/services/executants.ts';
import { ErreurTache, Travailleur, type Executant } from '../src/services/travailleur.ts';
import { FileMemoire } from './faux-file.ts';

const M = 'marque-1';
const U = 'utilisateur-1';
const journal = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };

function banc(executants: Record<string, Executant> = EXECUTANTS) {
  const file = new FileMemoire();
  const horloge = { t: Date.parse('2026-10-21T08:00:00Z') };
  file.maintenant = () => horloge.t;
  const travailleur = new Travailleur({ file, marques: async () => [M], executants, service: 'svc-a', journal });
  return { file, horloge, travailleur };
}

describe('registre des types de tâche', () => {
  it('chaque type a un délai de garde et des tentatives', () => {
    for (const d of Object.values(TACHES)) {
      expect(d.delaiGardeS).toBeGreaterThan(0);
      expect(d.tentativesMax).toBeGreaterThanOrEqual(1);
    }
    expect(TACHES['reseau']!.reprise).toBe('interdite');
  });
});

describe('travailleur', () => {
  it('exécute la tâche d’essai, la termine et applique le résultat une seule fois', async () => {
    const appliques: string[] = [];
    const { file, travailleur } = banc({ essai: { ...EXECUTANTS['essai']!, appliquer: async (t) => void appliques.push(t.id) } });
    const t = await file.enfiler(M, U, 'essai', { message: 'bonjour' });
    expect(await travailleur.passer()).toBe(1);
    expect(file.taches[0]).toMatchObject({ etat: 'terminee', resultat: { echo: 'bonjour' } });
    expect(await travailleur.appliquer()).toBe(1);
    expect(await travailleur.appliquer()).toBe(0);
    expect(appliques).toEqual([t.id]);
  });

  it('une tâche interactive passe avant le lot, puis par ancienneté', async () => {
    const { file, horloge } = banc();
    await file.enfiler(M, U, 'essai', {});
    horloge.t += 1000;
    const i = await file.enfiler(M, U, 'montage', {});
    expect(i.classe).toBe('interactive');
    expect((await file.prendre(M, 's'))?.id).toBe(i.id);
    expect((await file.prendre(M, 's'))?.type).toBe('essai');
  });

  it('refuse un bail inférieur à trois renouvellements', async () => {
    const { file } = banc();
    await file.enfiler(M, U, 'essai', {});
    await expect(file.prendre(M, 's', 40, 15)).rejects.toThrow();
  });

  it('un échec transitoire reprogramme avec un délai exponentiel, jusqu’aux tentatives max', async () => {
    const { file, horloge, travailleur } = banc();
    await file.enfiler(M, U, 'essai', { echec: 'transitoire' });
    await travailleur.passer();
    expect(file.taches[0]).toMatchObject({ etat: 'prete', tentatives: 1 });
    expect(file.taches[0]!.disponibleLe.getTime() - horloge.t).toBe(15_000);
    expect(await travailleur.passer()).toBe(0);
    horloge.t += 15_000;
    await travailleur.passer();
    expect(file.taches[0]!.disponibleLe.getTime() - horloge.t).toBe(30_000);
    for (let i = 0; i < 6; i += 1) {
      horloge.t += 3_600_000;
      await travailleur.passer();
    }
    expect(file.taches[0]).toMatchObject({ etat: 'echouee', cause: 'ECHEC', action: 'relancer' });
    expect((await file.historique(M, U, file.taches[0]!.id)).length).toBe(file.taches[0]!.tentatives);
  });

  it('un échec définitif n’est pas retenté ; une exception inattendue est opaque en base', async () => {
    const { file, travailleur } = banc({ essai: { executer: async () => { throw new Error('/chemin/secret échec'); } } });
    await file.enfiler(M, U, 'essai', {});
    await travailleur.passer();
    expect(file.taches[0]!.cause).toBe('ECHEC');
    expect(JSON.stringify(file.taches[0])).not.toContain('secret');
    const b = banc({ essai: { executer: async () => { throw new ErreurTache('ECHEC', 'relancer', false); } } });
    await b.file.enfiler(M, U, 'essai', {});
    await b.travailleur.passer();
    expect(b.file.taches[0]).toMatchObject({ etat: 'echouee', tentatives: 1 });
  });

  it('un type sans exécutant échoue sans boucler', async () => {
    const { file, travailleur } = banc({});
    await file.enfiler(M, U, 'essai', {});
    await travailleur.passer();
    expect(file.taches[0]).toMatchObject({ etat: 'echouee', cause: 'TYPE_SANS_EXECUTANT' });
  });

  it('reprise après crash : une reprise puis RESULTAT_INCONNU ; jamais de reprise après le point de non-retour', async () => {
    const { file, horloge } = banc();
    await file.enfiler(M, U, 'essai', {});
    await file.prendre(M, 'mort');
    horloge.t += 61_000;
    expect(await file.recuperer(M)).toBe(1);
    expect(file.taches[0]).toMatchObject({ etat: 'prete', reprises: 1 });
    await file.prendre(M, 'mort2');
    horloge.t += 61_000;
    await file.recuperer(M);
    expect(file.taches[0]).toMatchObject({ etat: 'echouee', cause: 'RESULTAT_INCONNU', action: 'verifier' });

    const r = await file.enfiler(M, U, 'montage', {});
    await file.prendre(M, 'mort3');
    await file.pointDeNonRetour(M, r.id, 'mort3');
    horloge.t += 61_000;
    await file.recuperer(M);
    expect(file.taches[1]).toMatchObject({ etat: 'echouee', cause: 'RESULTAT_INCONNU' });
  });

  it('un type à reprise interdite n’est jamais repris', async () => {
    const { file, horloge } = banc();
    await file.enfiler(M, U, 'reseau', {});
    await file.prendre(M, 'mort');
    horloge.t += 61_000;
    await file.recuperer(M);
    expect(file.taches[0]).toMatchObject({ etat: 'echouee', cause: 'RESULTAT_INCONNU' });
  });

  it('le délai de garde coupe une tâche qui renouvelle sans fin', async () => {
    const { file, horloge } = banc();
    await file.enfiler(M, U, 'essai', {}, { delaiGardeS: 100 });
    const t = (await file.prendre(M, 's'))!;
    horloge.t += 90_000;
    expect(await file.renouveler(M, t.id, 's')).toBe(true);
    horloge.t += 20_000;
    expect(await file.renouveler(M, t.id, 's')).toBe(false);
    await file.recuperer(M);
    expect(file.taches[0]).toMatchObject({ etat: 'echouee', cause: 'DELAI_DEPASSE' });
  });

  it('un seul GPU à la fois', async () => {
    const { file } = banc();
    await file.enfiler(M, U, 'transcription', {});
    await file.enfiler(M, U, 'voix', {});
    await file.enfiler(M, U, 'essai', {});
    expect((await file.prendre(M, 'a'))?.type).toBe('transcription');
    expect((await file.prendre(M, 'b'))?.type).toBe('essai');
    expect(await file.prendre(M, 'c')).toBeUndefined();
  });

  it('annulation, gel et relance sont bornés au propriétaire', async () => {
    const { file } = banc();
    const t = await file.enfiler(M, U, 'montage', {});
    expect(await file.geler(M, 'autre', t.id)).toBe(false);
    expect(await file.geler(M, U, t.id)).toBe(true);
    expect(await file.prendre(M, 's')).toBeUndefined();
    expect(await file.degeler(M, U, t.id)).toBe(true);
    expect(await file.annuler(M, 'autre', t.id)).toBe(false);
    expect(await file.annuler(M, U, t.id)).toBe(true);
    expect(await file.relancer(M, U, t.id)).toBe(false);
    expect(await file.lire(M, 'autre', t.id)).toBeUndefined();
  });
});
