// regie — exécutant de capture, dans le conteneur Chromium jetable (histoire 4.2, AD-10, FR-13). Lit UNE demande sur
// l'entrée standard, ouvre la page d'accueil de l'application par le proxy de sortie, rend sur la sortie standard une
// ligne JSON : l'hôte, le titre et une miniature PNG (base64). Rien n'est écrit sur disque (racine en lecture seule).
// Playwright est installé dans l'image, pas dans le cœur : il est chargé à l'exécution, sa version est épinglée
// dans deploiement/versions.json. Le jeu de scripts complet arrive avec l'histoire 4.5.

import { optionsContexte, optionsLancement } from './chromium.ts';
import { lireDemande, type DemandeCapture, type ResultatCapture } from './demande.ts';

/** Surface de Playwright utilisée ici : un faux la remplace dans les tests. */
export type PageMinimale = Readonly<{
  goto: (url: string, options: { timeout: number; waitUntil: 'load' }) => Promise<unknown>;
  title: () => Promise<string>;
  url: () => string;
  screenshot: (options: { type: 'png' }) => Promise<Uint8Array>;
  route: (motif: string, gestionnaire: (route: { request: () => { url: () => string }; abort: (code?: string) => Promise<void>; continue: () => Promise<void> }) => Promise<void>) => Promise<void>;
}>;
export type NavigateurMinimal = Readonly<{
  newContext: (options: ReturnType<typeof optionsContexte>) => Promise<{ newPage: () => Promise<PageMinimale>; close: () => Promise<void> }>;
  close: () => Promise<void>;
}>;
export type LancerNavigateur = (options: ReturnType<typeof optionsLancement>) => Promise<NavigateurMinimal>;

const MINIATURE_MAX_OCTETS = 200_000;

function hoteDe(adresse: string): string | undefined {
  try {
    const u = new URL(adresse);
    return u.protocol === 'https:' ? u.hostname.toLowerCase() : undefined;
  } catch {
    return undefined;
  }
}

export async function capturer(demande: DemandeCapture, lancer: LancerNavigateur): Promise<ResultatCapture> {
  const hoteDemande = hoteDe(demande.url);
  if (hoteDemande === undefined || !demande.hotes.includes(hoteDemande)) return { ok: false, cause: 'HOTE_REFUSE', ...(hoteDemande !== undefined ? { hote: hoteDemande } : {}) };
  const navigateur = await lancer(optionsLancement(demande.proxy));
  try {
    const contexte = await navigateur.newContext(optionsContexte(demande.viewport));
    const page = await contexte.newPage();
    // Seconde garde : même si le proxy était contourné, une requête hors liste est coupée par le navigateur.
    let refuse: string | undefined;
    await page.route('**/*', async (route) => {
      const hote = hoteDe(route.request().url());
      if (hote === undefined || !demande.hotes.includes(hote)) {
        refuse ??= hote ?? 'adresse non https';
        await route.abort('blockedbyclient');
      } else {
        await route.continue();
      }
    });
    try {
      await page.goto(demande.url, { timeout: demande.delaiMs, waitUntil: 'load' });
    } catch {
      return refuse !== undefined ? { ok: false, cause: 'HOTE_REFUSE', hote: refuse } : { ok: false, cause: 'PAGE_INJOIGNABLE', hote: hoteDemande };
    }
    const hoteFinal = hoteDe(page.url());
    if (hoteFinal === undefined || !demande.hotes.includes(hoteFinal)) return { ok: false, cause: 'HOTE_REFUSE', ...(hoteFinal !== undefined ? { hote: hoteFinal } : {}) };
    const png = await page.screenshot({ type: 'png' });
    if (png.byteLength > MINIATURE_MAX_OCTETS) return { ok: false, cause: 'CAPTURE_ECHEC' };
    return { ok: true, hote: hoteFinal, titre: (await page.title()).slice(0, 200), miniature: Buffer.from(png).toString('base64') };
  } finally {
    await navigateur.close().catch(() => undefined);
  }
}

async function lireEntree(): Promise<string> {
  const morceaux: Buffer[] = [];
  let total = 0;
  for await (const m of process.stdin) {
    total += (m as Buffer).length;
    if (total > 16_384) throw new Error('demande trop longue');
    morceaux.push(m as Buffer);
  }
  return Buffer.concat(morceaux).toString('utf8');
}

if (import.meta.main) {
  let resultat: ResultatCapture;
  try {
    const demande = lireDemande(await lireEntree());
    const nom = 'playwright';
    const { chromium } = (await import(nom)) as { chromium: { launch: LancerNavigateur } };
    resultat = await capturer(demande, (options) => chromium.launch(options));
  } catch {
    // Aucun détail : un message brut pourrait citer le laissez-passer ou une adresse interne.
    resultat = { ok: false, cause: 'CAPTURE_ECHEC' };
  }
  process.stdout.write(`${JSON.stringify(resultat)}\n`);
  process.exit(0);
}
