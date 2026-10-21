// La tâche « capture » : arguments Podman, lanceur et exécutant, avec un faux lanceur. Rien ne lance de conteneur.

import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { verifierLaissezPasser } from '@regie/contrats';
import type { Application, Applications } from '../src/infra/applications.ts';
import type { Tache } from '../src/infra/file.ts';
import { argumentsPodman, creerExecutantCapture, LanceurPodman, type DemandeLanceur, type LanceurCapture, type Lancement } from '../src/services/capture.ts';
import { ErreurTache } from '../src/services/travailleur.ts';
import { lireEnvironnement } from '../src/env.ts';

const reglages = { socket: '/run/user/1500/podman/podman.sock', image: 'localhost/regie-capture:test', reseau: 'capture-interne' };
const ID_APP = '4f2f4d3a-3a0f-4b1b-9e11-0c2f9b5f7a10';
const cle = randomBytes(32);

describe('argumentsPodman', () => {
  const args = argumentsPodman(reglages, 'regie-capture-t1', 90);
  it('jetable, sans privilège, racine en lecture seule, réseau interne sans DNS', () => {
    expect(args).toEqual(expect.arrayContaining(['--rm', '--cap-drop=ALL', '--read-only', '--dns', 'none', '--pull=never']));
    expect(args.join(' ')).toContain('--security-opt no-new-privileges');
    expect(args.join(' ')).toContain('--network capture-interne');
    expect(args.join(' ')).toContain(`--url unix://${reglages.socket}`);
    expect(args.at(-1)).toBe(reglages.image);
  });
  it('aucun volume, montage, privilège, périphérique, réseau hôte ni variable d’environnement', () => {
    for (const interdit of ['-v', '--volume', '--mount', '--privileged', '--device', '--env', '-e', '--env-file', '--userns=host', '--pid', '--ipc', '--cap-add', '--network=host', 'host']) {
      expect(args.some((a) => a === interdit || a.startsWith(`${interdit}=`))).toBe(false);
    }
    expect(args.join(' ')).not.toMatch(/--network (host|slirp|pasta|bridge)/);
  });
  it('plafonne les ressources', () => {
    for (const option of ['--pids-limit', '--memory', '--cpus', '--timeout']) expect(args).toContain(option);
  });
});

describe('LanceurPodman', () => {
  function faux(sortie: string, code = 0) {
    const vus: { commande: string; args: string[]; entree: string } = { commande: '', args: [], entree: '' };
    const lancement: Lancement = (commande, args) => {
      vus.commande = commande;
      vus.args = args;
      let fermer: (c?: number | null) => void = () => undefined;
      return {
        stdin: { end: (e: string) => { vus.entree = e; setTimeout(() => fermer(code), 0); }, on: () => undefined },
        stdout: { on: (_e, f) => void setTimeout(() => f(Buffer.from(sortie)), 0) },
        on: (e, f) => { if (e === 'close') fermer = f; },
        kill: () => true,
      };
    };
    return { vus, lancement };
  }
  const demande = (extra: Partial<DemandeLanceur> = {}): DemandeLanceur => ({ nom: 'regie-capture-t1', entree: '{"secret":"LAISSEZ-PASSER"}', delaiMs: 1000, signal: new AbortController().signal, ...extra });

  it('passe la demande par l’entrée standard, jamais par les arguments', async () => {
    const f = faux('{"ok":true}\n');
    expect(await new LanceurPodman(reglages, f.lancement).lancer(demande())).toBe('{"ok":true}\n');
    expect(f.vus.commande).toBe('podman');
    expect(f.vus.entree).toContain('LAISSEZ-PASSER');
    expect(f.vus.args.join(' ')).not.toContain('LAISSEZ-PASSER');
  });
  it('rejette un code de sortie non nul, une sortie trop longue et une annulation', async () => {
    await expect(new LanceurPodman(reglages, faux('', 125).lancement).lancer(demande())).rejects.toThrow(/SORTIE_125/);
    await expect(new LanceurPodman(reglages, faux('x'.repeat(500_000)).lancement).lancer(demande())).rejects.toThrow(/SORTIE_TROP_LONGUE/);
    const c = new AbortController();
    c.abort();
    await expect(new LanceurPodman(reglages, faux('{}').lancement).lancer(demande({ signal: c.signal }))).rejects.toThrow(/ANNULE/);
  });
});

const application: Application = { id: ID_APP, espaceId: 'e', nom: 'Démo', accueil: 'https://demo.exemple.fr/', hotes: ['demo.exemple.fr', 'cdn.exemple.fr'], version: 1, creeLe: new Date(), modifieLe: new Date() };
const applications = (a: Application | undefined): Applications => ({ lister: async () => [], lire: async (_m, _u, id) => (id === ID_APP ? a : undefined), creer: async () => undefined, remplacer: async () => undefined });
const tache = (entree: Record<string, unknown>): Tache => ({ id: 'tache-1', marqueId: 'm', utilisateurId: 'u', type: 'capture', entree }) as unknown as Tache;
const aide = (signal = new AbortController().signal) => ({ signal, pointDeNonRetour: async () => undefined });

function executant(sortie: string | Error, a: Application | undefined = application) {
  const vus: DemandeLanceur[] = [];
  const lanceur: LanceurCapture = { lancer: async (d) => { vus.push(d); if (sortie instanceof Error) throw sortie; return sortie; } };
  return { vus, executant: creerExecutantCapture({ applications: applications(a), lanceur, cle, proxy: '10.89.77.2:3128', maintenant: () => 1_000_000 }) };
}
const echec = async (p: Promise<unknown>) => (await p.then(() => undefined, (e: unknown) => e)) as ErreurTache;

describe('exécutant de capture', () => {
  it('rend l’hôte, le titre et la miniature, avec un laissez-passer limité aux hôtes de l’application', async () => {
    const { vus, executant: e } = executant('{"ok":true,"hote":"demo.exemple.fr","titre":"Accueil","miniature":"iVBORw0="}\n');
    expect(await e.executer(tache({ applicationId: ID_APP }), aide())).toEqual({ hote: 'demo.exemple.fr', titre: 'Accueil', miniature: 'iVBORw0=' });
    const demande = JSON.parse(vus[0]!.entree) as { url: string; hotes: string[]; proxy: { serveur: string; laissezPasser: string } };
    expect(demande.url).toBe('https://demo.exemple.fr/');
    expect(demande.proxy.serveur).toBe('http://10.89.77.2:3128');
    const verif = verifierLaissezPasser(cle, demande.proxy.laissezPasser, 1_000_000);
    expect(verif).toMatchObject({ ok: true, contenu: { tache: 'tache-1', hotes: ['demo.exemple.fr', 'cdn.exemple.fr'] } });
    expect(vus[0]!.nom).toBe('regie-capture-tache-1');
  });
  it('refuse une entrée invalide, une application d’autrui et un accueil hors des hôtes', async () => {
    expect((await echec(executant('{}').executant.executer(tache({ applicationId: 'x', en_trop: 1 }), aide()))).cause_).toBe('ENTREE_INVALIDE');
    expect((await echec(executant('{}').executant.executer(tache({ applicationId: '0f2f4d3a-3a0f-4b1b-9e11-0c2f9b5f7a99' }), aide()))).cause_).toBe('APPLICATION_INTROUVABLE');
    const hors = { ...application, accueil: 'https://autre.exemple.fr/' };
    const e = executant('{}', hors);
    expect((await echec(e.executant.executer(tache({ applicationId: ID_APP }), aide()))).cause_).toBe('HOTE_REFUSE');
    expect(e.vus).toEqual([]);
  });
  it('une sortie illisible ou mal formée est un échec réessayable, sans citer la sortie', async () => {
    for (const sortie of ['pas du json', '{"ok":true}', '{"ok":true,"hote":"demo.exemple.fr","titre":"t","miniature":"<script>"}']) {
      const erreur = await echec(executant(sortie).executant.executer(tache({ applicationId: ID_APP }), aide()));
      expect(erreur).toMatchObject({ cause_: 'CAPTURE_ECHEC', reessayer: true });
    }
  });
  it('refuse un hôte vu hors liste, même annoncé comme réussi', async () => {
    const erreur = await echec(executant('{"ok":true,"hote":"pirate.exemple.com","titre":"t","miniature":"AAAA"}').executant.executer(tache({ applicationId: ID_APP }), aide()));
    expect(erreur).toMatchObject({ cause_: 'HOTE_REFUSE', reessayer: false });
  });
  it('relaie les causes du conteneur : hôte refusé sans nouvel essai, page injoignable avec', async () => {
    expect(await echec(executant('{"ok":false,"cause":"HOTE_REFUSE","hote":"x.fr"}').executant.executer(tache({ applicationId: ID_APP }), aide()))).toMatchObject({ cause_: 'HOTE_REFUSE', reessayer: false });
    expect(await echec(executant('{"ok":false,"cause":"PAGE_INJOIGNABLE"}').executant.executer(tache({ applicationId: ID_APP }), aide()))).toMatchObject({ cause_: 'PAGE_INJOIGNABLE', reessayer: true });
  });
  it('un lanceur en panne donne CAPTURE_ECHEC ; une annulation est relayée telle quelle', async () => {
    expect(await echec(executant(new Error('SORTIE_125')).executant.executer(tache({ applicationId: ID_APP }), aide()))).toMatchObject({ cause_: 'CAPTURE_ECHEC' });
    const c = new AbortController();
    c.abort();
    const erreur = await echec(executant(new Error('ANNULE')).executant.executer(tache({ applicationId: ID_APP }), aide(c.signal)));
    expect(erreur).not.toBeInstanceOf(ErreurTache);
  });
});

describe('environnement de la capture', () => {
  it('valeurs par défaut et refus d’un socket relatif ou d’un proxy nommé', () => {
    expect(lireEnvironnement({ REGIE_CAPTURE_SOCKET: '/run/user/1500/podman/podman.sock' })).toMatchObject({ REGIE_CAPTURE_PROXY: '10.89.77.2:3128' });
    expect(() => lireEnvironnement({ REGIE_CAPTURE_SOCKET: 'podman.sock' })).toThrow(/REGIE_CAPTURE_SOCKET/);
    expect(() => lireEnvironnement({ REGIE_CAPTURE_PROXY: 'proxy-capture:3128' })).toThrow(/REGIE_CAPTURE_PROXY/);
  });
});
