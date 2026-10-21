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

describe('argumentsPodman pour le rendu', () => {
  const rendu = { ...reglages, image: 'localhost/regie-rendu:test', reseau: 'none', ressources: { memoire: '4g', tmpfs: '1g', cpus: 4 } };
  it('aucun réseau (donc pas de --dns), plus de ressources, jamais de périphérique par défaut', () => {
    const args = argumentsPodman(rendu, 'regie-rendu-t1', 840);
    expect(args.join(' ')).toContain('--network none');
    expect(args).not.toContain('--dns');
    expect(args.join(' ')).toContain('--memory 4g');
    expect(args.join(' ')).toContain('size=1g');
    expect(args).not.toContain('--device');
  });
  it('le GPU n’est donné que sur demande, et un seul périphérique', () => {
    const args = argumentsPodman({ ...rendu, ressources: { ...rendu.ressources, peripherique: '/dev/dri/renderD128' } }, 'regie-rendu-t1', 840);
    expect(args.filter((a) => a === '--device')).toHaveLength(1);
    expect(args).toContain('/dev/dri/renderD128');
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
  it('remet chaque ligne complète à surLigne dès qu’elle arrive, même coupée au milieu d’un caractère ; un écouteur fautif ne casse rien', async () => {
    const octets = Buffer.from('{"journal":"é"}\n{"ok":true}');
    const morceaux = [octets.subarray(0, 12), octets.subarray(12, 16), octets.subarray(16)];
    const lancement: Lancement = () => {
      let fermer: (c?: number | null) => void = () => undefined;
      return {
        stdin: { end: () => setTimeout(() => fermer(0), 10), on: () => undefined },
        stdout: { on: (_e, f) => void morceaux.forEach((m, i) => setTimeout(() => f(m), i)) },
        on: (e, f) => { if (e === 'close') fermer = f; },
        kill: () => true,
      };
    };
    const lignes: string[] = [];
    const sortie = await new LanceurPodman(reglages, lancement).lancer(demande({ surLigne: (l) => { lignes.push(l); throw new Error('écouteur fautif'); } }));
    expect(lignes).toEqual(['{"journal":"é"}', '{"ok":true}']);
    expect(sortie).toBe('{"journal":"é"}\n{"ok":true}');
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

describe('LanceurPodman : lignes du film (histoire 4.6)', () => {
  it('envoie les lignes du film à l’écouteur sans les garder ni les compter dans le plafond de la sortie', async () => {
    const film = '{"film":{"n":0,"d":"' + 'A'.repeat(100_000) + '"}}\n';
    const sortie = film.repeat(10) + '{"ok":true}\n';
    const lancement: Lancement = () => {
      let fermer: (c?: number | null) => void = () => undefined;
      return {
        stdin: { end: () => setTimeout(() => fermer(0), 10), on: () => undefined },
        stdout: { on: (_e, f) => void setTimeout(() => f(Buffer.from(sortie)), 0) },
        on: (e, f) => { if (e === 'close') fermer = f; },
        kill: () => true,
      };
    };
    const vues: string[] = [];
    const rendu = await new LanceurPodman(reglages, lancement).lancer({ nom: 'n', entree: '{}', delaiMs: 1000, signal: new AbortController().signal, surLigne: (l) => vues.push(l) });
    expect(rendu).toBe('{"ok":true}\n');
    expect(vues.filter((l) => l.startsWith('{"film":'))).toHaveLength(10);
  });
  it('refuse une ligne qui n’en finit pas', async () => {
    const lancement: Lancement = () => {
      let fermer: (c?: number | null) => void = () => undefined;
      return {
        stdin: { end: () => setTimeout(() => fermer(0), 10), on: () => undefined },
        stdout: { on: (_e, f) => void setTimeout(() => f(Buffer.from('{"film":' + 'A'.repeat(300_000))), 0) },
        on: (e, f) => { if (e === 'close') fermer = f; },
        kill: () => true,
      };
    };
    await expect(new LanceurPodman(reglages, lancement).lancer({ nom: 'n', entree: '{}', delaiMs: 1000, signal: new AbortController().signal })).rejects.toThrow(/SORTIE_TROP_LONGUE/);
  });
});
