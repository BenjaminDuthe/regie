// L'exécutant de capture avec un faux Chromium : rien ne s'ouvre, rien n'appelle Internet.

import { describe, expect, it } from 'vitest';
import { argumentsChromium, exigerBacASableActif, optionsContexte, optionsLancement } from '../src/chromium.ts';
import { lireDemande, type DemandeCapture } from '../src/demande.ts';
import { capturer, type LancerNavigateur, type PageMinimale } from '../src/executer.ts';

const demande: DemandeCapture = {
  url: 'https://demo.exemple.fr/',
  hotes: ['demo.exemple.fr', 'cdn.exemple.fr'],
  proxy: { serveur: 'http://10.89.77.2:3128', laissezPasser: 'v1.x.y' },
  viewport: { largeur: 360, hauteur: 640 },
  delaiMs: 30_000,
};

type Formulaire = { motDePasse?: boolean; identifiant?: boolean; echecSaisie?: boolean; echecValidation?: boolean };
type Reglages = { urlFinale?: string; echecGoto?: boolean; requetes?: string[]; png?: Uint8Array; formulaire?: Formulaire };

function faux(r: Reglages = {}): { lancer: LancerNavigateur; options: unknown[]; fermetures: string[]; abandonnees: string[]; saisies: string[]; captures: number[] } {
  const options: unknown[] = [];
  const fermetures: string[] = [];
  const abandonnees: string[] = [];
  const saisies: string[] = [];
  const captures: number[] = [];
  const form: Formulaire = { motDePasse: true, identifiant: true, ...r.formulaire };
  const lancer: LancerNavigateur = async (o) => {
    options.push(o);
    return {
      newContext: async () => ({
        newPage: async () => {
          let gestionnaire: Parameters<PageMinimale['route']>[1] | undefined;
          const locateur = (present: boolean | undefined, nom: string): ReturnType<PageMinimale['locator']> => {
            const l: ReturnType<PageMinimale['locator']> = {
              count: async () => (present === true ? 1 : 0),
              first: () => l,
              fill: async (valeur) => {
                if (form.echecSaisie === true) throw new Error('champ non modifiable');
                saisies.push(`${nom}=${valeur}`);
              },
              press: async () => undefined,
              waitFor: async () => {
                if (form.echecValidation === true) throw new Error('délai');
              },
            };
            return l;
          };
          return {
            locator: (selecteur) => (selecteur.includes('password') ? locateur(form.motDePasse, 'mdp') : locateur(form.identifiant, 'id')),
            route: async (_m, g) => void (gestionnaire = g),
            goto: async (url) => {
              for (const requete of [url, ...(r.requetes ?? [])]) {
                await gestionnaire!({ request: () => ({ url: () => requete }), abort: async () => void abandonnees.push(requete), continue: async () => undefined });
              }
              if (r.echecGoto === true) throw new Error('net::ERR');
            },
            title: async () => 'Accueil',
            url: () => r.urlFinale ?? 'https://demo.exemple.fr/',
            screenshot: async () => {
              captures.push(1);
              return r.png ?? new Uint8Array([137, 80, 78, 71]);
            },
          };
        },
        close: async () => void fermetures.push('contexte'),
      }),
      close: async () => void fermetures.push('navigateur'),
    };
  };
  return { lancer, options, fermetures, abandonnees, saisies, captures };
}

describe('réglages de Chromium', () => {
  it('coupe WebRTC direct, QUIC et DoH ; aucune résolution locale', () => {
    const args = argumentsChromium();
    expect(args).toContain('--disable-quic');
    expect(args).toContain('--force-webrtc-ip-handling-policy=disable_non_proxied_udp');
    expect(args.some((a) => a.startsWith('--disable-features=') && a.includes('DnsOverHttps'))).toBe(true);
    expect(args).toContain('--dns-over-https-mode=off');
    expect(args).toContain('--host-resolver-rules=MAP * ~NOTFOUND');
  });
  it('garde le bac à sable : jamais --no-sandbox, chromiumSandbox demandé', () => {
    expect(argumentsChromium().some((a) => a.includes('sandbox'))).toBe(false);
    expect(optionsLancement(demande.proxy).chromiumSandbox).toBe(true);
    for (const mauvais of ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu-sandbox']) expect(() => exigerBacASableActif([mauvais])).toThrow(/bac à sable/);
  });
  it('passe le laissez-passer au proxy par l’authentification, pas par l’adresse', () => {
    const o = optionsLancement(demande.proxy);
    expect(o.proxy).toEqual({ server: 'http://10.89.77.2:3128', username: 'capture', password: 'v1.x.y' });
    expect(o.args.join(' ')).not.toContain('v1.x.y');
  });
  it('refuse les téléchargements et les service workers', () => {
    expect(optionsContexte(demande.viewport)).toMatchObject({ acceptDownloads: false, serviceWorkers: 'block', permissions: [], ignoreHTTPSErrors: false });
  });
});

describe('capturer', () => {
  it('rend l’hôte, le titre et une miniature, et ferme le navigateur', async () => {
    const f = faux();
    const r = await capturer(demande, f.lancer);
    expect(r).toEqual({ ok: true, hote: 'demo.exemple.fr', titre: 'Accueil', miniature: Buffer.from([137, 80, 78, 71]).toString('base64') });
    expect(f.fermetures).toContain('navigateur');
  });
  it('une page d’accueil hors liste est refusée sans lancer de navigateur', async () => {
    const f = faux();
    expect(await capturer({ ...demande, url: 'https://autre.exemple.fr/' }, f.lancer)).toEqual({ ok: false, cause: 'HOTE_REFUSE', hote: 'autre.exemple.fr' });
    expect(await capturer({ ...demande, url: 'http://demo.exemple.fr/' }, f.lancer)).toMatchObject({ ok: false, cause: 'HOTE_REFUSE' });
    expect(f.options).toEqual([]);
  });
  it('une requête vers un hôte non déclaré est coupée par le navigateur', async () => {
    const f = faux({ requetes: ['https://pistage.exemple.com/p.gif', 'https://cdn.exemple.fr/a.js'], echecGoto: true });
    const r = await capturer(demande, f.lancer);
    expect(f.abandonnees).toEqual(['https://pistage.exemple.com/p.gif']);
    expect(r).toEqual({ ok: false, cause: 'HOTE_REFUSE', hote: 'pistage.exemple.com' });
  });
  it('une redirection finale hors liste est refusée', async () => {
    expect(await capturer(demande, faux({ urlFinale: 'https://hors.exemple.net/x' }).lancer)).toEqual({ ok: false, cause: 'HOTE_REFUSE', hote: 'hors.exemple.net' });
  });
  it('page injoignable : cause dédiée', async () => {
    expect(await capturer(demande, faux({ echecGoto: true }).lancer)).toEqual({ ok: false, cause: 'PAGE_INJOIGNABLE', hote: 'demo.exemple.fr' });
  });
  it('une miniature trop lourde est refusée', async () => {
    expect(await capturer(demande, faux({ png: new Uint8Array(300_000) }).lancer)).toEqual({ ok: false, cause: 'CAPTURE_ECHEC' });
  });
});

describe('capturer en mode connexion', () => {
  const avecCompte: DemandeCapture = { ...demande, compte: { identifiant: 'demo@exemple.fr', motDePasse: 'M0t-de-passe-secret' } };

  it('se connecte puis rend la mini capture de l’accueil connecté', async () => {
    const f = faux();
    expect(await capturer(avecCompte, f.lancer)).toMatchObject({ ok: true, hote: 'demo.exemple.fr', titre: 'Accueil' });
    expect(f.saisies).toEqual(['id=demo@exemple.fr', 'mdp=M0t-de-passe-secret']);
    expect(f.fermetures).toContain('navigateur');
  });
  it('nomme l’étape fautive et ne capture rien (le formulaire contient le mot de passe)', async () => {
    const cas: [Formulaire, string][] = [
      [{ motDePasse: false }, 'trouver'],
      [{ identifiant: false }, 'trouver'],
      [{ echecSaisie: true }, 'saisir'],
      [{ echecValidation: true }, 'valider'],
    ];
    for (const [formulaire, etape] of cas) {
      const f = faux({ formulaire });
      const r = await capturer(avecCompte, f.lancer);
      expect(r, etape).toEqual({ ok: false, cause: 'CONNEXION_ECHEC', etape });
      expect(f.captures, etape).toEqual([]);
      expect(JSON.stringify(r)).not.toContain('M0t-de-passe-secret');
    }
  });
  it('une page qui ne s’ouvre pas échoue à l’étape « ouvrir »', async () => {
    expect(await capturer(avecCompte, faux({ echecGoto: true }).lancer)).toEqual({ ok: false, cause: 'CONNEXION_ECHEC', etape: 'ouvrir' });
  });
  it('une redirection vers un hôte non déclaré après la connexion est refusée', async () => {
    expect(await capturer(avecCompte, faux({ urlFinale: 'https://hors.exemple.net/' }).lancer)).toEqual({ ok: false, cause: 'HOTE_REFUSE', hote: 'hors.exemple.net' });
  });
  it('un accueil hors liste est refusé sans rien saisir', async () => {
    const f = faux();
    expect(await capturer({ ...avecCompte, url: 'https://autre.exemple.fr/' }, f.lancer)).toMatchObject({ ok: false, cause: 'HOTE_REFUSE' });
    expect(f.saisies).toEqual([]);
  });
});

describe('lireDemande', () => {
  const brute = JSON.stringify(demande);
  it('accepte une demande valide', () => {
    expect(lireDemande(brute)).toEqual(demande);
  });
  it('lit le compte d’une demande de connexion et refuse un compte incomplet ou hors mode', () => {
    const compte = { identifiant: 'a@b.fr', motDePasse: 'x' };
    expect(lireDemande(JSON.stringify({ ...demande, mode: 'connexion', compte })).compte).toEqual(compte);
    expect(() => lireDemande(JSON.stringify({ ...demande, mode: 'connexion' }))).toThrow();
    expect(() => lireDemande(JSON.stringify({ ...demande, mode: 'connexion', compte: { identifiant: 'a', motDePasse: '' } }))).toThrow();
    expect(() => lireDemande(JSON.stringify({ ...demande, compte }))).toThrow();
    expect(() => lireDemande(JSON.stringify({ ...demande, mode: 'autre' }))).toThrow();
  });
  it('refuse un proxy désigné par un nom, une taille absurde ou un champ manquant', () => {
    expect(() => lireDemande(JSON.stringify({ ...demande, proxy: { serveur: 'http://proxy-capture:3128', laissezPasser: 'x' } }))).toThrow();
    expect(() => lireDemande(JSON.stringify({ ...demande, viewport: { largeur: 99999, hauteur: 10 } }))).toThrow();
    expect(() => lireDemande(JSON.stringify({ ...demande, hotes: undefined }))).toThrow();
    expect(() => lireDemande('pas du json')).toThrow();
  });
});
