// Tests du planificateur (histoire 2.2) : heures de Paris au changement d'heure, règle de retard, gestionnaires.
// Le déroulé complet contre la base (déclenchement unique, rattrapage, RLS) est dans postgres.integration.test.ts.

import { describe, expect, it, vi } from 'vitest';
import { RECURRENCES, TYPES_ECHEANCE } from '@regie/contrats';
import { chainer, type Audit, type LigneAudit } from '../src/infra/audit.ts';
import { prochainHoraireParis, parisVersUtc } from '../src/services/horaires.ts';
import { decider } from '../src/services/planificateur.ts';
import { verifierJournal } from '../src/services/gestionnaires.ts';
import { programmerEcheance } from '../src/services/echeances.ts';

const iso = (d: Date) => d.toISOString();

describe('heures de Paris', () => {
  it('03:00 reste 03:00 à Paris avant, pendant et après les deux changements d’heure', () => {
    // Hiver → été (dimanche 29 mars 2026, 02:00 → 03:00 à Paris, 01:00Z).
    expect(iso(prochainHoraireParis(new Date('2026-03-27T12:00:00Z'), '03:00').instant)).toBe('2026-03-28T02:00:00.000Z');
    expect(iso(prochainHoraireParis(new Date('2026-03-28T12:00:00Z'), '03:00').instant)).toBe('2026-03-29T01:00:00.000Z');
    expect(iso(prochainHoraireParis(new Date('2026-03-29T12:00:00Z'), '03:00').instant)).toBe('2026-03-30T01:00:00.000Z');
    // Été → hiver (dimanche 25 octobre 2026, 03:00 → 02:00 à Paris, 01:00Z).
    expect(iso(prochainHoraireParis(new Date('2026-10-23T12:00:00Z'), '03:00').instant)).toBe('2026-10-24T01:00:00.000Z');
    expect(iso(prochainHoraireParis(new Date('2026-10-24T12:00:00Z'), '03:00').instant)).toBe('2026-10-25T02:00:00.000Z');
    expect(iso(prochainHoraireParis(new Date('2026-10-25T12:00:00Z'), '03:00').instant)).toBe('2026-10-26T02:00:00.000Z');
  });

  it('est strictement après l’instant donné et nomme le jour de Paris', () => {
    const exact = new Date('2026-10-21T01:00:00Z'); // 03:00 à Paris (heure d'été)
    const p = prochainHoraireParis(exact, '03:00');
    expect(iso(p.instant)).toBe('2026-10-22T01:00:00.000Z');
    expect(p.jour).toBe('2026-10-22');
    // 23:30 à Paris le 20 octobre (21:30Z) : le prochain 03:00 est le 21.
    expect(prochainHoraireParis(new Date('2026-10-20T21:30:00Z'), '03:00').jour).toBe('2026-10-21');
  });

  it('une heure qui n’existe pas (02:30 le jour du saut de printemps) est décalée d’une heure, jamais perdue', () => {
    expect(iso(parisVersUtc(2026, 3, 29, 2, 30))).toBe('2026-03-29T01:30:00.000Z');
    expect(() => prochainHoraireParis(new Date(), '25:00')).toThrow();
  });

  it('chaque récurrence tombe la nuit à Paris, hors des heures de changement', () => {
    for (const r of RECURRENCES) {
      expect(TYPES_ECHEANCE[r.type]).toBeDefined();
      expect(Number(r.heureParis.slice(0, 2))).toBeGreaterThanOrEqual(3);
    }
  });
});

describe('règle de retard', () => {
  const maintenant = new Date('2026-10-21T10:00:00Z');
  const il_y_a = (minutes: number) => new Date(maintenant.getTime() - minutes * 60_000);

  it('moins de 2 h de retard : toujours rattrapée', () => {
    for (const type of Object.keys(TYPES_ECHEANCE)) expect(decider({ type, instant: il_y_a(119) }, maintenant)).toBe('declencher');
  });

  it('plus de 2 h : selon la règle du type', () => {
    expect(decider({ type: 'purge', instant: il_y_a(600) }, maintenant)).toBe('declencher');
    expect(decider({ type: 'verification_audit', instant: il_y_a(3000) }, maintenant)).toBe('declencher');
    expect(decider({ type: 'publication', instant: il_y_a(121) }, maintenant)).toBe('echouer');
    expect(decider({ type: 'rappel', instant: il_y_a(121) }, maintenant)).toBe('echouer');
    expect(decider({ type: 'inconnu', instant: il_y_a(1) }, maintenant)).toBe('echouer');
  });

  it('programmer refuse un type inconnu avant toute écriture', async () => {
    const client = { query: vi.fn() };
    await expect(programmerEcheance(client as never, 'm', { type: 'inconnu', objet: 'x', instant: new Date() })).rejects.toThrow(/inconnu/);
    expect(client.query).not.toHaveBeenCalled();
  });
});

describe('vérification nocturne du journal', () => {
  function auditEn(lignes: LigneAudit[]): Audit & { ajoutees: unknown[] } {
    const ajoutees: unknown[] = [];
    return {
      ajoutees,
      lire: async () => lignes,
      ajouter: async (_m, e) => void ajoutees.push(e),
    };
  }
  const chaine = (): LigneAudit[] => {
    const a = chainer('m', { acteur: 's', action: 'connexion', objet: 'session' }, undefined, new Date('2026-10-20T10:00:00Z'));
    const b = chainer('m', { acteur: 's', action: 'deconnexion', objet: 'session' }, a.hache, new Date('2026-10-20T11:00:00Z'));
    return [a, b];
  };
  const journal = () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() });

  it('chaîne intacte : trace avec la tête et le nombre de lignes', async () => {
    const lignes = chaine();
    const audit = auditEn(lignes);
    const j = journal();
    await verifierJournal(audit, j, 'm');
    expect(audit.ajoutees[0]).toMatchObject({ acteur: 'systeme', action: 'verification_chaine', details: { lignes: 2, tete: lignes[1]!.hache, resultat: 'intacte' } });
    expect(j.error).not.toHaveBeenCalled();
  });

  it('chaîne rompue : écrit l’écart, alerte dans les journaux et échoue avec CHAINE_ROMPUE', async () => {
    const lignes = chaine();
    lignes[0] = { ...lignes[0]!, objet: 'falsifie' };
    const audit = auditEn(lignes);
    const j = journal();
    await expect(verifierJournal(audit, j, 'm')).rejects.toMatchObject({ cause_: 'CHAINE_ROMPUE' });
    expect(audit.ajoutees[0]).toMatchObject({ details: { resultat: 'rompue', position: 0 } });
    expect(j.error).toHaveBeenCalled();
  });
});
