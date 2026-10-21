// regie — adaptateur du `PiloteNavigateur` sur une page Playwright (histoire 4.5). Il traduit une cible de script (le texte
// visible d'un élément, ou `css=` suivi d'un sélecteur) en locateur, lit la position du pointeur pour l'aperçu, et
// pose la seconde garde : toute requête hors liste d'hôtes est coupée par le navigateur lui-même, après le proxy.
// La surface de Playwright utilisée est minimale et typée ici : un faux la remplace dans les tests.

import type { EtapeConnexion } from './demande.ts';
import { seConnecter, type LocateurMinimal, type PageMinimale } from './executer.ts';
import { hoteDe, type PiloteNavigateur, type Point } from './jeu.ts';

type Delai = Readonly<{ timeout: number }>;
export type LocateurJeu = LocateurMinimal &
  Readonly<{
    click: (options: Delai) => Promise<void>;
    hover: (options: Delai) => Promise<void>;
    scrollIntoViewIfNeeded: (options: Delai) => Promise<void>;
    boundingBox: (options: Delai) => Promise<Readonly<{ x: number; y: number; width: number; height: number }> | null>;
  }>;

export type PageJeu = Omit<PageMinimale, 'locator'> &
  Readonly<{
    locator: (selecteur: string) => LocateurJeu;
    getByText: (texte: string) => LocateurJeu;
    mouse: Readonly<{ move: (x: number, y: number, options?: { steps: number }) => Promise<void>; wheel: (dx: number, dy: number) => Promise<void> }>;
    viewportSize: () => Readonly<{ width: number; height: number }> | null;
    close: () => Promise<void>;
    video: () => Readonly<{ path: () => Promise<string> }> | null;
  }>;

/** Défilement quand l'étape ne dit ni cible ni distance : un écran de téléphone, à peu près. */
export const DEFILEMENT_PAR_DEFAUT_PX = 600;

export type OptionsPilote = Readonly<{
  hotes: readonly string[];
  /** Taille d'un fichier ; injectée (la capture lit le film, ne l'ouvre jamais). */
  tailleFichier: (chemin: string) => Promise<number>;
}>;

export async function piloteDePlaywright(page: PageJeu, o: OptionsPilote): Promise<PiloteNavigateur> {
  let refuse: string | undefined;
  await page.route('**/*', async (route) => {
    const hote = hoteDe(route.request().url());
    if (hote === undefined || !o.hotes.includes(hote)) {
      refuse ??= hote ?? 'adresse non https';
      await route.abort('blockedbyclient');
    } else {
      await route.continue();
    }
  });

  const cibler = (cible: string): LocateurJeu => (cible.startsWith('css=') ? page.locator(cible.slice(4)).first() : page.getByText(cible).first()) as LocateurJeu;
  const enMilliemes = (b: Readonly<{ x: number; y: number; width: number; height: number }> | null): Point | undefined => {
    const vue = page.viewportSize();
    if (b === null || vue === null || vue.width <= 0 || vue.height <= 0) return undefined;
    const borne = (v: number): number => Math.min(1000, Math.max(0, Math.round(v)));
    return { x: borne(((b.x + b.width / 2) / vue.width) * 1000), y: borne(((b.y + b.height / 2) / vue.height) * 1000) };
  };
  /** Amène l'élément à l'écran, lit où il est et y glisse le pointeur (le film montre le trajet). */
  const viser = async (l: LocateurJeu, timeout: number): Promise<Point | undefined> => {
    await l.scrollIntoViewIfNeeded({ timeout });
    const boite = await l.boundingBox({ timeout });
    if (boite !== null) await page.mouse.move(boite.x + boite.width / 2, boite.y + boite.height / 2, { steps: 12 });
    return enMilliemes(boite);
  };

  return {
    aller: async (url, timeout) => {
      await page.goto(url, { timeout, waitUntil: 'load' });
    },
    cliquer: async (cible, timeout) => {
      const l = cibler(cible);
      const point = await viser(l, timeout);
      await l.click({ timeout });
      return point;
    },
    survoler: async (cible, timeout) => {
      const l = cibler(cible);
      const point = await viser(l, timeout);
      await l.hover({ timeout });
      return point;
    },
    saisir: async (cible, valeur, timeout) => {
      const l = cibler(cible);
      const point = await viser(l, timeout);
      await l.fill(valeur, { timeout });
      return point;
    },
    attendre: async (cible, timeout) => {
      await cibler(cible).waitFor({ state: 'visible', timeout });
    },
    defiler: async (cible, pixels, timeout) => {
      if (cible !== undefined) await cibler(cible).scrollIntoViewIfNeeded({ timeout });
      if (pixels !== undefined || cible === undefined) await page.mouse.wheel(0, pixels ?? DEFILEMENT_PAR_DEFAUT_PX);
    },
    seConnecter: (compte, timeout): Promise<EtapeConnexion | undefined> => seConnecter(page, compte, timeout),
    urlCourante: () => page.url(),
    hoteRefuse: () => refuse,
    capturer: () => page.screenshot({ type: 'png' }),
    terminer: async () => {
      const film = page.video();
      await page.close();
      if (film === null) return undefined;
      try {
        return { octets: await o.tailleFichier(await film.path()) };
      } catch {
        return undefined;
      }
    },
  };
}
