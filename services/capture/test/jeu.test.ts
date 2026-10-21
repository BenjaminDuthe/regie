// Le jeu d'un script avec un faux pilote : rien ne s'ouvre, rien n'appelle Internet.

import { describe, expect, it } from 'vitest';
import { EtapeScript } from '@regie/contrats';
import { lireDemande, lireEtapeJeu, type EntreeJournal, type EtapeJeu } from '../src/demande.ts';
import { jouerScript, type DemandeJeu, type EnvironnementJeu, type PiloteNavigateur } from '../src/jeu.ts';
import { jouerDemande, type LancerNavigateurJeu } from '../src/jouer.ts';
import { piloteDePlaywright, type LocateurJeu, type PageJeu } from '../src/pilote-playwright.ts';

type Reglages = {
  /** Étapes (verbe, cible) qui échouent. */
  echecs?: string[];
  /** Après ce clic, la page change d'adresse. */
  redirections?: Record<string, string>;
  hoteCoupe?: string;
  connexion?: 'trouver' | 'saisir' | 'valider';
  png?: Uint8Array;
  film?: { octets: number };
};

function fauxPilote(r: Reglages = {}) {
  const appels: string[] = [];
  let url = 'about:blank';
  const pilote: PiloteNavigateur = {
    aller: async (adresse) => {
      appels.push(`aller ${adresse}`);
      if (r.echecs?.includes(`aller ${adresse}`) === true) throw new Error('net::ERR');
      url = adresse;
    },
    cliquer: async (cible) => {
      appels.push(`cliquer ${cible}`);
      if (r.echecs?.includes(`cliquer ${cible}`) === true) throw new Error('introuvable');
      const vers = r.redirections?.[cible];
      if (vers !== undefined) url = vers;
      return { x: 500, y: 250 };
    },
    saisir: async (cible, valeur) => {
      appels.push(`saisir ${cible}=${valeur}`);
      return { x: 100, y: 200 };
    },
    survoler: async (cible) => {
      appels.push(`survoler ${cible}`);
      return { x: 300, y: 300 };
    },
    attendre: async (cible) => {
      appels.push(`attendre ${cible}`);
      if (r.echecs?.includes(`attendre ${cible}`) === true) throw new Error('délai');
    },
    defiler: async (cible, pixels) => void appels.push(`defiler ${cible ?? '-'} ${pixels ?? '-'}`),
    seConnecter: async () => {
      appels.push('connexion');
      return r.connexion;
    },
    urlCourante: () => url,
    hoteRefuse: () => r.hoteCoupe,
    capturer: async () => {
      appels.push('capturer');
      return r.png ?? new Uint8Array([137, 80, 78, 71]);
    },
    terminer: async () => r.film,
  };
  return { pilote, appels };
}

function fauxTemps(): { env: EnvironnementJeu; avancer: (ms: number) => void; pauses: number[] } {
  let t = 0;
  const pauses: number[] = [];
  return {
    env: {
      maintenant: () => t,
      dormir: async (ms) => {
        pauses.push(ms);
        t += ms;
      },
    },
    avancer: (ms) => void (t += ms),
    pauses,
  };
}

const base: Omit<DemandeJeu, 'etapes'> = { url: 'https://demo.exemple.fr/', hotes: ['demo.exemple.fr', 'cdn.exemple.fr'], delaiMs: 60_000 };

async function jouer(etapes: EtapeJeu[], r: Reglages = {}, plus: Partial<DemandeJeu> = {}) {
  const f = fauxPilote(r);
  const t = fauxTemps();
  const journal: EntreeJournal[] = [];
  const resultat = await jouerScript({ ...base, etapes, ...plus }, f.pilote, (e) => journal.push(e), t.env);
  return { resultat, journal, appels: f.appels, ...t };
}

describe('jouerScript', () => {
  it('rejoue les étapes dans l’ordre et tient un journal horodaté', async () => {
    const { resultat, journal, appels, pauses } = await jouer([
      { verbe: 'filmer', mode: 'demarrer' },
      { verbe: 'cliquer', cible: 'Nouvelle recette' },
      { verbe: 'saisir', cible: 'css=#nom', valeur: 'Poulet rôti' },
      { verbe: 'pause', secondes: 2 },
      { verbe: 'narration', texte: 'On ajoute une recette' },
      { verbe: 'filmer', mode: 'arreter' },
    ]);
    expect(resultat).toMatchObject({ ok: true, etapes: 6, hote: 'demo.exemple.fr', dureeMs: 2000 });
    expect(appels).toEqual(['aller https://demo.exemple.fr/', 'cliquer Nouvelle recette', 'saisir css=#nom=Poulet rôti']);
    expect(pauses).toEqual([2000]);
    expect(journal.map((e) => [e.etape, e.genre])).toEqual([[0, 'navigation'], [1, 'film_debut'], [2, 'clic'], [3, 'saisie'], [4, 'pause'], [5, 'narration'], [6, 'film_fin'], [0, 'fin']]);
    expect(journal[2]).toMatchObject({ cible: 'Nouvelle recette', x: 500, y: 250 });
    // Horodatage croissant, en millisecondes depuis le début.
    const temps = journal.map((e) => e.t);
    expect([...temps].sort((a, b) => a - b)).toEqual(temps);
    expect(temps.at(-1)).toBe(2000);
  });

  it('n’écrit jamais la valeur saisie ni le compte dans le journal', async () => {
    const { journal } = await jouer(
      [{ verbe: 'connexion' }, { verbe: 'saisir', cible: 'css=#mdp', valeur: 'Secret-Tr3s-Long' }],
      {},
      { compte: { identifiant: 'demo@exemple.fr', motDePasse: 'M0t-de-passe-secret' } },
    );
    const texte = JSON.stringify(journal);
    for (const interdit of ['Secret-Tr3s-Long', 'demo@exemple.fr', 'M0t-de-passe-secret']) expect(texte).not.toContain(interdit);
    expect(journal.some((e) => e.genre === 'connexion')).toBe(true);
  });

  it('coupe le jeu à une destination hors liste, avant d’ouvrir la page', async () => {
    const { resultat, journal, appels } = await jouer([
      { verbe: 'cliquer', cible: 'Menu' },
      { verbe: 'aller', url: 'https://pistage.exemple.com/x' },
      { verbe: 'cliquer', cible: 'Jamais joué' },
    ]);
    expect(resultat).toEqual({ ok: false, cause: 'HOTE_REFUSE', etape: 2, hote: 'pistage.exemple.com' });
    expect(appels).not.toContain('aller https://pistage.exemple.com/x');
    expect(appels).not.toContain('cliquer Jamais joué');
    expect(journal.at(-1)).toMatchObject({ genre: 'refus', etape: 2, cible: 'pistage.exemple.com' });
  });

  it('coupe le jeu quand un clic mène la page hors liste, et le trace', async () => {
    const { resultat, journal, appels } = await jouer(
      [{ verbe: 'cliquer', cible: 'Partenaire' }, { verbe: 'cliquer', cible: 'Suite' }],
      { redirections: { Partenaire: 'https://partenaire.exemple.org/offre' } },
    );
    expect(resultat).toEqual({ ok: false, cause: 'HOTE_REFUSE', etape: 1, hote: 'partenaire.exemple.org' });
    expect(appels).not.toContain('cliquer Suite');
    expect(journal.map((e) => e.genre)).toEqual(['navigation', 'clic', 'refus']);
  });

  it('une requête coupée par le navigateur arrête le jeu, même si la page reste sur un hôte déclaré', async () => {
    const { resultat } = await jouer([{ verbe: 'cliquer', cible: 'Bouton' }], { hoteCoupe: 'pixel.exemple.com' });
    expect(resultat).toMatchObject({ ok: false, cause: 'HOTE_REFUSE', hote: 'pixel.exemple.com' });
  });

  it('un échec d’étape rend son numéro et une capture d’écran', async () => {
    const { resultat, journal } = await jouer([{ verbe: 'cliquer', cible: 'Menu' }, { verbe: 'cliquer', cible: 'Absent' }, { verbe: 'pause', secondes: 1 }], { echecs: ['cliquer Absent'] });
    expect(resultat).toEqual({ ok: false, cause: 'ETAPE_ECHEC', etape: 2, capture: Buffer.from([137, 80, 78, 71]).toString('base64') });
    expect(journal.at(-1)).toMatchObject({ genre: 'echec', etape: 2, cible: 'Absent' });
  });

  it('une capture d’échec trop lourde est omise, l’échec reste dit', async () => {
    const { resultat } = await jouer([{ verbe: 'attendre', cible: 'Absent' }], { echecs: ['attendre Absent'], png: new Uint8Array(300_000) });
    expect(resultat).toEqual({ ok: false, cause: 'ETAPE_ECHEC', etape: 1 });
  });

  it('une adresse qui ne s’ouvre pas est une page injoignable', async () => {
    const { resultat } = await jouer([{ verbe: 'aller', url: 'https://cdn.exemple.fr/p' }], { echecs: ['aller https://cdn.exemple.fr/p'] });
    expect(resultat).toMatchObject({ ok: false, cause: 'PAGE_INJOIGNABLE', etape: 1 });
  });

  it('un accueil hors liste est refusé sans rien ouvrir ; un accueil injoignable est dit', async () => {
    const a = await jouer([{ verbe: 'pause', secondes: 1 }], {}, { url: 'https://autre.exemple.fr/' });
    expect(a.resultat).toEqual({ ok: false, cause: 'HOTE_REFUSE', etape: 0, hote: 'autre.exemple.fr' });
    expect(a.appels).toEqual([]);
    const b = await jouer([{ verbe: 'pause', secondes: 1 }], { echecs: ['aller https://demo.exemple.fr/'] });
    expect(b.resultat).toMatchObject({ ok: false, cause: 'PAGE_INJOIGNABLE', etape: 0 });
  });

  it('l’étape connexion : succès, échec sans capture, ou compte absent', async () => {
    const compte = { identifiant: 'a@b.fr', motDePasse: 'x1y2z3' };
    expect((await jouer([{ verbe: 'connexion' }], {}, { compte })).resultat).toMatchObject({ ok: true });
    const echec = await jouer([{ verbe: 'connexion' }], { connexion: 'valider' }, { compte });
    expect(echec.resultat).toEqual({ ok: false, cause: 'CONNEXION_ECHEC', etape: 1, etapeConnexion: 'valider' });
    expect(echec.appels).not.toContain('capturer');
    expect((await jouer([{ verbe: 'connexion' }])).resultat).toMatchObject({ ok: false, cause: 'ETAPE_ECHEC', etape: 1 });
  });

  it('le délai global arrête le jeu', async () => {
    const { resultat } = await jouer([{ verbe: 'pause', secondes: 30 }, { verbe: 'pause', secondes: 30 }, { verbe: 'cliquer', cible: 'Trop tard' }], {}, { delaiMs: 40_000 });
    expect(resultat).toMatchObject({ ok: false, cause: 'DELAI_DEPASSE', etape: 3 });
  });

  it('rend la taille du film quand il y en a un', async () => {
    const { resultat } = await jouer([{ verbe: 'pause', secondes: 1 }], { film: { octets: 123_456 } });
    expect(resultat).toMatchObject({ ok: true, video: { octets: 123_456 } });
  });
});

describe('lireEtapeJeu (même forme que EtapeScript)', () => {
  const valides: unknown[] = [
    { verbe: 'aller', url: 'https://demo.exemple.fr/a' },
    { verbe: 'cliquer', cible: 'OK' },
    { verbe: 'saisir', cible: 'css=#a', valeur: '' },
    { verbe: 'attendre', cible: 'Prêt' },
    { verbe: 'connexion' },
    { verbe: 'filmer', mode: 'demarrer' },
    { verbe: 'survoler', cible: 'Aide' },
    { verbe: 'defiler' },
    { verbe: 'defiler', cible: 'Bas', pixels: -200 },
    { verbe: 'pause', secondes: 0.5 },
    { verbe: 'narration', texte: 'Bonjour' },
  ];
  const invalides: unknown[] = [
    { verbe: 'aller' },
    { verbe: 'aller', url: 'http://demo.exemple.fr/' },
    { verbe: 'cliquer', cible: '' },
    { verbe: 'cliquer', cible: 'OK', en_trop: 1 },
    { verbe: 'saisir', cible: 'a' },
    { verbe: 'filmer', mode: 'autre' },
    { verbe: 'defiler', pixels: 99_999 },
    { verbe: 'defiler', pixels: 1.5 },
    { verbe: 'pause', secondes: 0 },
    { verbe: 'pause', secondes: 31 },
    { verbe: 'narration', texte: '   ' },
    { verbe: 'danser' },
    'texte',
    null,
  ];
  it.each(valides.map((e) => [JSON.stringify(e), e]))('accepte %s comme le paquet contrats', (_n, e) => {
    expect(EtapeScript.safeParse(e).success).toBe(true);
    expect(() => lireEtapeJeu(e)).not.toThrow();
  });
  it.each(invalides.map((e) => [JSON.stringify(e), e]))('refuse %s comme le paquet contrats', (_n, e) => {
    expect(EtapeScript.safeParse(e).success).toBe(false);
    expect(() => lireEtapeJeu(e)).toThrow();
  });
});

describe('lireDemande en mode jeu', () => {
  const demande = { mode: 'jeu', url: 'https://demo.exemple.fr/', hotes: ['demo.exemple.fr'], proxy: { serveur: 'http://10.89.77.2:3128', laissezPasser: 'v1.x.y' }, viewport: { largeur: 360, hauteur: 640 }, delaiMs: 60_000, etapes: [{ verbe: 'cliquer', cible: 'OK' }] };
  const compte = { identifiant: 'a@b.fr', motDePasse: 'x' };
  it('lit les étapes', () => {
    expect(lireDemande(JSON.stringify(demande)).etapes).toEqual([{ verbe: 'cliquer', cible: 'OK' }]);
  });
  it('exige le compte pour l’étape connexion, et le refuse sinon', () => {
    const avecConnexion = { ...demande, etapes: [{ verbe: 'connexion' }] };
    expect(() => lireDemande(JSON.stringify(avecConnexion))).toThrow();
    expect(lireDemande(JSON.stringify({ ...avecConnexion, compte })).compte).toEqual(compte);
    expect(() => lireDemande(JSON.stringify({ ...demande, compte }))).toThrow();
  });
  it('refuse un jeu sans étapes, trop d’étapes, des étapes hors mode jeu ou une étape invalide', () => {
    expect(() => lireDemande(JSON.stringify({ ...demande, etapes: [] }))).toThrow();
    expect(() => lireDemande(JSON.stringify({ ...demande, etapes: Array.from({ length: 101 }, () => ({ verbe: 'connexion' })), compte }))).toThrow();
    expect(() => lireDemande(JSON.stringify({ ...demande, mode: 'connexion', compte }))).toThrow();
    expect(() => lireDemande(JSON.stringify({ ...demande, etapes: [{ verbe: 'danser' }] }))).toThrow();
    expect(() => lireDemande(JSON.stringify({ ...demande, mode: undefined }))).toThrow();
  });
});

describe('piloteDePlaywright', () => {
  function fausseCopie(r: { boite?: { x: number; y: number; width: number; height: number } | null; film?: boolean; echecTaille?: boolean } = {}) {
    const appels: string[] = [];
    let gestionnaire: Parameters<PageJeu['route']>[1] | undefined;
    const abandonnees: string[] = [];
    const locateur = (nom: string): LocateurJeu => {
      const l: LocateurJeu = {
        count: async () => 1,
        first: () => l,
        fill: async (v) => void appels.push(`${nom}.fill(${v})`),
        press: async () => undefined,
        waitFor: async () => void appels.push(`${nom}.waitFor`),
        click: async () => void appels.push(`${nom}.click`),
        hover: async () => void appels.push(`${nom}.hover`),
        scrollIntoViewIfNeeded: async () => void appels.push(`${nom}.defiler`),
        boundingBox: async () => (r.boite === undefined ? { x: 90, y: 280, width: 180, height: 80 } : r.boite),
      };
      return l;
    };
    const page: PageJeu = {
      locator: (s) => locateur(`css:${s}`),
      getByText: (t) => locateur(`texte:${t}`),
      route: async (_m, g) => void (gestionnaire = g),
      goto: async (url) => void appels.push(`goto ${url}`),
      title: async () => 'x',
      url: () => 'https://demo.exemple.fr/',
      screenshot: async () => new Uint8Array([1]),
      mouse: { move: async (x, y) => void appels.push(`souris ${x},${y}`), wheel: async (dx, dy) => void appels.push(`molette ${dx},${dy}`) },
      viewportSize: () => ({ width: 360, height: 640 }),
      close: async () => void appels.push('page.close'),
      video: () => (r.film === true ? { path: async () => '/tmp/film/a.webm' } : null),
    };
    return { page, appels, abandonnees, demander: async (url: string) => gestionnaire!({ request: () => ({ url: () => url }), abort: async () => void abandonnees.push(url), continue: async () => undefined }) };
  }
  const options = { hotes: ['demo.exemple.fr'], tailleFichier: async () => 4096 };

  it('cible par le texte visible, ou par css= ; rend la position du pointeur en millièmes', async () => {
    const f = fausseCopie();
    const p = await piloteDePlaywright(f.page, options);
    const point = await p.cliquer('Nouvelle recette', 5000);
    expect(point).toEqual({ x: 500, y: 500 });
    await p.cliquer('css=#valider', 5000);
    expect(f.appels).toContain('texte:Nouvelle recette.click');
    expect(f.appels).toContain('css:#valider.click');
    expect(f.appels).toContain('souris 180,320');
  });
  it('défile à la cible, de la distance dite, ou d’un écran par défaut', async () => {
    const f = fausseCopie();
    const p = await piloteDePlaywright(f.page, options);
    await p.defiler('Bas de page', undefined, 5000);
    await p.defiler(undefined, -300, 5000);
    await p.defiler(undefined, undefined, 5000);
    expect(f.appels).toEqual(['texte:Bas de page.defiler', 'molette 0,-300', 'molette 0,600']);
  });
  it('coupe une requête hors liste et la retient', async () => {
    const f = fausseCopie();
    const p = await piloteDePlaywright(f.page, options);
    await f.demander('https://demo.exemple.fr/a.js');
    expect(p.hoteRefuse()).toBeUndefined();
    await f.demander('https://pistage.exemple.com/p.gif');
    await f.demander('http://demo.exemple.fr/clair');
    expect(f.abandonnees).toEqual(['https://pistage.exemple.com/p.gif', 'http://demo.exemple.fr/clair']);
    expect(p.hoteRefuse()).toBe('pistage.exemple.com');
  });
  it('rend la taille du film après avoir fermé la page', async () => {
    const f = fausseCopie({ film: true });
    const p = await piloteDePlaywright(f.page, options);
    expect(await p.terminer()).toEqual({ octets: 4096 });
    expect(f.appels).toEqual(['page.close']);
    expect(await (await piloteDePlaywright(fausseCopie().page, options)).terminer()).toBeUndefined();
    expect(await (await piloteDePlaywright(fausseCopie({ film: true }).page, { ...options, tailleFichier: async () => Promise.reject(new Error('absent')) })).terminer()).toBeUndefined();
  });
});

describe('jouerDemande', () => {
  it('ferme le contexte et le navigateur, aussi après un échec', async () => {
    const fermetures: string[] = [];
    const options: unknown[] = [];
    const contextes: unknown[] = [];
    const fauxPage = (): PageJeu => {
      const l: LocateurJeu = { count: async () => 1, first: () => l, fill: async () => undefined, press: async () => undefined, waitFor: async () => undefined, click: async () => Promise.reject(new Error('introuvable')), hover: async () => undefined, scrollIntoViewIfNeeded: async () => undefined, boundingBox: async () => null };
      return {
        locator: () => l,
        getByText: () => l,
        route: async () => undefined,
        goto: async () => undefined,
        title: async () => '',
        url: () => 'https://demo.exemple.fr/',
        screenshot: async () => new Uint8Array([1]),
        mouse: { move: async () => undefined, wheel: async () => undefined },
        viewportSize: () => ({ width: 360, height: 640 }),
        close: async () => undefined,
        video: () => null,
      };
    };
    const lancer: LancerNavigateurJeu = async (o) => {
      options.push(o);
      return { newContext: async (c) => (contextes.push(c), { newPage: async () => fauxPage(), close: async () => void fermetures.push('contexte') }), close: async () => void fermetures.push('navigateur') };
    };
    const demande = lireDemande(JSON.stringify({ mode: 'jeu', url: 'https://demo.exemple.fr/', hotes: ['demo.exemple.fr'], proxy: { serveur: 'http://10.89.77.2:3128', laissezPasser: 'v1.x.y' }, viewport: { largeur: 360, hauteur: 640 }, delaiMs: 60_000, etapes: [{ verbe: 'cliquer', cible: 'Absent' }] }));
    const journal: EntreeJournal[] = [];
    const resultat = await jouerDemande(demande, lancer, (e) => journal.push(e), async () => 0);
    expect(resultat).toMatchObject({ ok: false, cause: 'ETAPE_ECHEC', etape: 1 });
    expect(fermetures).toEqual(['contexte', 'navigateur']);
    expect(contextes[0]).toMatchObject({ recordVideo: { dir: '/tmp/film', size: { width: 1080, height: 1920 } }, acceptDownloads: false });
    expect(options[0]).toMatchObject({ chromiumSandbox: true });
  });
});

describe('lireEtapeJeu : adresses', () => {
  it('refuse identifiants et ports dans l’adresse', () => {
    for (const url of ['https://u:p@demo.exemple.fr/', 'https://demo.exemple.fr:8443/']) expect(() => lireEtapeJeu({ verbe: 'aller', url })).toThrow();
  });
});
