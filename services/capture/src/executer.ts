// regie — exécutant de capture, dans le conteneur Chromium jetable (histoire 4.2, AD-10, FR-13). Lit UNE demande sur
// l'entrée standard, ouvre la page d'accueil de l'application par le proxy de sortie, rend sur la sortie standard une
// ligne JSON : l'hôte, le titre et une miniature PNG (base64). Rien n'est écrit sur disque (racine en lecture seule).
// Playwright est installé dans l'image, pas dans le cœur : il est chargé à l'exécution, sa version est épinglée
// dans deploiement/versions.json. Le jeu d'un script (histoire 4.5) est dans jeu.ts, jouer.ts et pilote-playwright.ts.

import { optionsContexte, optionsLancement } from './chromium.ts';
import { ELEMENTS_EXPLORATION_MAX, lireDemande, type DemandeCapture, type ElementExplore, type EtapeConnexion, type ResultatCapture, type ResultatJeu } from './demande.ts';

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
  /** Évalue une expression dans la page (exploration, histoire 4.8). */
  evaluate?: (expression: string) => Promise<unknown>;
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

/**
 * Expression évaluée DANS la page explorée : les éléments visibles sur lesquels on peut agir. Rien d'autre n'en sort que
 * le rôle, un texte court et l'hôte d'un lien ; le contenu des champs (valeurs saisies) n'est jamais lu.
 */
export const EXPRESSION_EXPLORATION = `(() => {
  const vus = [];
  const visible = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  for (const e of document.querySelectorAll('a[href], button, [role="button"], input[type="submit"], input[type="text"], input[type="email"], input[type="search"], textarea, select')) {
    if (!visible(e)) continue;
    const balise = e.tagName.toLowerCase();
    const champ = balise === 'input' && e.type !== 'submit' || balise === 'textarea' || balise === 'select';
    const texte = (champ ? (e.getAttribute('aria-label') || e.getAttribute('placeholder') || e.name || '') : (e.innerText || e.getAttribute('aria-label') || e.value || '')).replace(/\\s+/g, ' ').trim();
    if (texte === '') continue;
    let hote;
    if (balise === 'a') { try { const u = new URL(e.href); if (u.protocol === 'https:') hote = u.hostname; } catch (_) {} }
    vus.push({ role: champ ? 'champ' : balise === 'a' ? 'lien' : 'bouton', texte, ...(hote ? { hote } : {}) });
    if (vus.length >= 200) break;
  }
  return vus;
})()`;

/** Ce que la page a rendu est une donnée d'un tiers : forme vérifiée, textes coupés, nombre borné. */
export function nettoyerElements(brut: unknown): ElementExplore[] {
  if (!Array.isArray(brut)) return [];
  const sortis: ElementExplore[] = [];
  const vus = new Set<string>();
  for (const b of brut) {
    if (sortis.length >= ELEMENTS_EXPLORATION_MAX) break;
    if (typeof b !== 'object' || b === null) continue;
    const e = b as Record<string, unknown>;
    if ((e['role'] !== 'lien' && e['role'] !== 'bouton' && e['role'] !== 'champ') || typeof e['texte'] !== 'string') continue;
    const texte = e['texte'].replace(/\s+/g, ' ').trim().slice(0, 80);
    const hote = typeof e['hote'] === 'string' && /^[a-z0-9.-]{1,253}$/i.test(e['hote']) ? e['hote'].toLowerCase() : undefined;
    const cle = `${e['role']}|${texte}|${hote ?? ''}`;
    if (texte === '' || vus.has(cle)) continue;
    vus.add(cle);
    sortis.push({ role: e['role'], texte, ...(hote !== undefined ? { hote } : {}) });
  }
  return sortis;
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
    const miniature = Buffer.from(png).toString('base64');
    const titre = (await page.title()).slice(0, 200);
    if (demande.explorer === true) {
      let elements: ElementExplore[] = [];
      try {
        elements = nettoyerElements(await page.evaluate?.(EXPRESSION_EXPLORATION));
      } catch {
        // Une page qui refuse l'évaluation donne une exploration sans éléments, pas un échec.
      }
      return { ok: true, hote: hoteFinal, titre, miniature, elements };
    }
    return { ok: true, hote: hoteFinal, titre, miniature };
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
      const { diffuserFilm } = await import('./film.ts');
      resultat = await jouerDemande(
        demande,
        chromium.launch as unknown as Parameters<typeof jouerDemande>[1],
        (entree) => void process.stdout.write(`${JSON.stringify({ journal: entree })}\n`),
        async (chemin) => {
          const taille = (await stat(chemin)).size;
          // Le film part sur la sortie standard avant la ligne de résultat (histoire 4.6) ; trop gros, il n'est pas diffusé.
          await diffuserFilm(chemin, (ligne) => void process.stdout.write(`${ligne}\n`));
          return taille;
        },
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
