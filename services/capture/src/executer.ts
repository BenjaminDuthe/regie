// regie — exécutant de capture, dans le conteneur Chromium jetable (histoire 4.2, AD-10, FR-13). Lit UNE demande sur
// l'entrée standard, ouvre la page d'accueil de l'application par le proxy de sortie, rend sur la sortie standard une
// ligne JSON : l'hôte, le titre et une miniature PNG (base64). Rien n'est écrit sur disque (racine en lecture seule).
// Playwright est installé dans l'image, pas dans le cœur : il est chargé à l'exécution, sa version est épinglée
// dans deploiement/versions.json. Le jeu d'un script (histoire 4.5) est dans jeu.ts, jouer.ts et pilote-playwright.ts.

import { optionsContexte, optionsLancement } from './chromium.ts';
import { lireDemande, type DemandeCapture, type EtapeConnexion, type ResultatCapture, type ResultatJeu } from './demande.ts';

export type LocateurMinimal = Readonly<{
  count: () => Promise<number>;
  first: () => LocateurMinimal;
  fill: (valeur: string, options: { timeout: number }) => Promise<void>;
  press: (touche: string, options: { timeout: number }) => Promise<void>;
  waitFor: (options: { state: 'detached' | 'visible'; timeout: number }) => Promise<void>;
}>;

/** Surface de Playwright utilisée ici : un faux la remplace dans les tests. */
export type PageMinimale = Readonly<{
  locator: (selecteur: string) => LocateurMinimal;
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

const CHAMP_MOT_DE_PASSE = 'input[type="password"]';
const CHAMP_IDENTIFIANT = 'input[type="email"], input[type="text"], input:not([type])';
const DELAI_SAISIE_MS = 10_000;

/**
 * Se connecte sur la page ouverte : trouve le formulaire (un champ mot de passe et le premier champ texte), saisit,
 * valide par Entrée et attend que le champ mot de passe disparaisse. Rend l'étape fautive, ou `undefined` si tout va bien.
 */
export async function seConnecter(page: PageMinimale, compte: NonNullable<DemandeCapture['compte']>, delaiMs: number): Promise<EtapeConnexion | undefined> {
  const motDePasse = page.locator(CHAMP_MOT_DE_PASSE).first();
  const identifiant = page.locator(CHAMP_IDENTIFIANT).first();
  try {
    if ((await motDePasse.count()) === 0 || (await identifiant.count()) === 0) return 'trouver';
  } catch {
    return 'trouver';
  }
  try {
    await identifiant.fill(compte.identifiant, { timeout: DELAI_SAISIE_MS });
    await motDePasse.fill(compte.motDePasse, { timeout: DELAI_SAISIE_MS });
  } catch {
    return 'saisir';
  }
  try {
    await motDePasse.press('Enter', { timeout: DELAI_SAISIE_MS });
    await motDePasse.waitFor({ state: 'detached', timeout: Math.min(delaiMs, 30_000) });
  } catch {
    return 'valider';
  }
  return undefined;
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
      if (demande.compte !== undefined && refuse === undefined) return { ok: false, cause: 'CONNEXION_ECHEC', etape: 'ouvrir' };
      return refuse !== undefined ? { ok: false, cause: 'HOTE_REFUSE', hote: refuse } : { ok: false, cause: 'PAGE_INJOIGNABLE', hote: hoteDemande };
    }
    if (demande.compte !== undefined) {
      const etape = await seConnecter(page, demande.compte, demande.delaiMs);
      // Un échec ne rend QUE l'étape : ni capture d'écran (le formulaire contient le mot de passe), ni texte de la page.
      if (etape !== undefined) return refuse !== undefined ? { ok: false, cause: 'HOTE_REFUSE', hote: refuse } : { ok: false, cause: 'CONNEXION_ECHEC', etape };
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
  let resultat: ResultatCapture | ResultatJeu;
  try {
    const demande = lireDemande(await lireEntree());
    const nom = 'playwright';
    const { chromium } = (await import(nom)) as { chromium: { launch: LancerNavigateur } };
    if (demande.etapes !== undefined) {
      // Jeu d'un script : une ligne `{"journal": ...}` par entrée, puis la ligne de résultat. Les modules du jeu ne sont
      // chargés que pour ce mode (jouer.ts importe ce fichier : pas de dépendance circulaire à la charge).
      const { jouerDemande } = await import('./jouer.ts');
      const { stat } = await import('node:fs/promises');
      resultat = await jouerDemande(
        demande,
        chromium.launch as unknown as Parameters<typeof jouerDemande>[1],
        (entree) => void process.stdout.write(`${JSON.stringify({ journal: entree })}\n`),
        async (chemin) => (await stat(chemin)).size,
      );
    } else {
      resultat = await capturer(demande, (options) => chromium.launch(options));
    }
  } catch {
    // Aucun détail : un message brut pourrait citer le laissez-passer ou une adresse interne.
    resultat = { ok: false, cause: 'CAPTURE_ECHEC' };
  }
  process.stdout.write(`${JSON.stringify(resultat)}\n`);
  process.exit(0);
}
