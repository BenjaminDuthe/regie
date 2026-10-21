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

type Reglages = { urlFinale?: string; echecGoto?: boolean; requetes?: string[]; png?: Uint8Array };

function faux(r: Reglages = {}): { lancer: LancerNavigateur; options: unknown[]; fermetures: string[]; abandonnees: string[] } {
  const options: unknown[] = [];
  const fermetures: string[] = [];
  const abandonnees: string[] = [];
  const lancer: LancerNavigateur = async (o) => {
    options.push(o);
    return {
      newContext: async () => ({
        newPage: async () => {
          let gestionnaire: Parameters<PageMinimale['route']>[1] | undefined;
          return {
            route: async (_m, g) => void (gestionnaire = g),
            goto: async (url) => {
              for (const requete of [url, ...(r.requetes ?? [])]) {
                await gestionnaire!({ request: () => ({ url: () => requete }), abort: async () => void abandonnees.push(requete), continue: async () => undefined });
              }
              if (r.echecGoto === true) throw new Error('net::ERR');
            },
            title: async () => 'Accueil',
            url: () => r.urlFinale ?? 'https://demo.exemple.fr/',
            screenshot: async () => r.png ?? new Uint8Array([137, 80, 78, 71]),
          };
        },
        close: async () => void fermetures.push('contexte'),
      }),
      close: async () => void fermetures.push('navigateur'),
    };
  };
  return { lancer, options, fermetures, abandonnees };
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

describe('lireDemande', () => {
  const brute = JSON.stringify(demande);
  it('accepte une demande valide', () => {
    expect(lireDemande(brute)).toEqual(demande);
  });
  it('refuse un proxy désigné par un nom, une taille absurde ou un champ manquant', () => {
    expect(() => lireDemande(JSON.stringify({ ...demande, proxy: { serveur: 'http://proxy-capture:3128', laissezPasser: 'x' } }))).toThrow();
    expect(() => lireDemande(JSON.stringify({ ...demande, viewport: { largeur: 99999, hauteur: 10 } }))).toThrow();
    expect(() => lireDemande(JSON.stringify({ ...demande, hotes: undefined }))).toThrow();
    expect(() => lireDemande('pas du json')).toThrow();
  });
});
