// regie — vérificateur des appels sortants (NFR-26, AD-17, AR-23).
// Compare le dépôt à la liste versionnée deploiement/sorties-autorisees.json :
//   1. le code (coeur, paquets, services) n'ouvre aucune connexion hors des fichiers déclarés ;
//   2. tout hôte écrit en toutes lettres est déclaré, avec la raison et les fichiers qui le portent ;
//   3. les pages construites (coeur/dist) ne chargent aucune ressource d'un autre domaine ;
//   4. une unité Quadlet hors de la liste du socle n'a de réseau que `Internal=true`.
// La comparaison avec des connexions réellement observées arrive avec les conteneurs (histoire 1.4).
// Chaque faute nomme le fichier, la ligne et la cause.

import { existsSync, readFileSync } from 'node:fs';
import { basename, extname, join } from 'node:path';
import { RACINE_DEPOT, cheminRelatif, listerFichiers, rapporter } from './commun.mjs';

export const FICHIER_SORTIES = 'deploiement/sorties-autorisees.json';

const DOSSIERS_CODE = ['coeur', 'paquets', 'services'];
const EXTENSIONS_CODE = new Set(['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs', '.astro', '.svelte', '.py', '.css', '.html']);
const EXTENSIONS_CONSTRUIT = new Set(['.html', '.css', '.js', '.mjs']);

/** Ouvertures de connexion, ligne par ligne. */
const APPELS_RESEAU = [
  ['fetch()', /(?<![.\w])fetch\s*\(/],
  ['XMLHttpRequest', /\bXMLHttpRequest\b/],
  ['WebSocket', /\bnew\s+WebSocket\b/],
  ['EventSource', /\bnew\s+EventSource\b/],
  ['sendBeacon', /\bsendBeacon\s*\(/],
  ['module réseau de Node', /\b(?:from|require\s*\()\s*['"`](?:node:)?(?:http|https|http2|net|tls|dgram|dns)['"`]/],
  ['client HTTP tiers', /\b(?:from|require\s*\()\s*['"`](?:undici|axios|got|node-fetch|ky|superagent|nodemailer)['"`]/],
  ['module réseau de Python', /^\s*(?:import|from)\s+(?:requests|httpx|aiohttp|urllib|http\.client|socket|smtplib|ftplib|websockets)\b/],
];

/** Hôte d'une URL absolue écrite en toutes lettres. */
const URL_ABSOLUE = /\b(?:https?|wss?):\/\/([a-z0-9.-]+)/gi;

/** Hôtes locaux : le serveur lui-même, jamais une sortie. */
const HOTES_LOCAUX = new Set(['localhost', '127.0.0.1', '0.0.0.0', '[::1]']);

function lire(racine) {
  const chemin = join(racine, FICHIER_SORTIES);
  if (!existsSync(chemin)) return { erreur: `${FICHIER_SORTIES} : fichier absent` };
  try {
    const liste = JSON.parse(readFileSync(chemin, 'utf8'));
    return { liste };
  } catch (erreur) {
    return { erreur: `${FICHIER_SORTIES} : JSON invalide (${erreur.message})` };
  }
}

/** Les fichiers de test décrivent des violations : ils ne sont pas du code livré. */
function estTest(relatif) {
  return /(^|\/)test\//.test(relatif) || /\.test\.[cm]?[jt]sx?$/.test(relatif) || /(^|\/)test_[^/]*\.py$/.test(relatif);
}

function verifierCode(racine, liste, fautes) {
  const hotes = new Map((liste.hotes ?? []).map((entree) => [entree.hote, entree]));
  const espacesDeNoms = new Set(liste.espacesDeNoms ?? []);
  const fichiersReseau = new Set(liste.fichiersReseau ?? []);
  for (const dossier of DOSSIERS_CODE) {
    for (const fichier of listerFichiers(join(racine, dossier))) {
      if (!EXTENSIONS_CODE.has(extname(fichier))) continue;
      const relatif = cheminRelatif(racine, fichier);
      if (estTest(relatif)) continue;
      const lignes = readFileSync(fichier, 'utf8').split('\n');
      lignes.forEach((ligne, index) => {
        const lieu = `${relatif}:${index + 1}`;
        if (!fichiersReseau.has(relatif)) {
          for (const [nom, motif] of APPELS_RESEAU) {
            if (motif.test(ligne)) fautes.push(`${lieu} — appel sortant « ${nom} » hors de la liste (${FICHIER_SORTIES}, « fichiersReseau »)`);
          }
        }
        for (const correspondance of ligne.matchAll(URL_ABSOLUE)) {
          const hote = correspondance[1].toLowerCase().replace(/\.$/, '');
          if (HOTES_LOCAUX.has(hote) || espacesDeNoms.has(hote)) continue;
          const declaration = hotes.get(hote);
          if (declaration === undefined) {
            fautes.push(`${lieu} — hôte « ${hote} » absent de la liste autorisée (${FICHIER_SORTIES})`);
          } else if (!(declaration.fichiers ?? []).includes(relatif)) {
            fautes.push(`${lieu} — hôte « ${hote} » déclaré pour d'autres fichiers que celui-ci (${FICHIER_SORTIES})`);
          }
        }
      });
    }
  }
}

/** Ressources chargées d'un autre domaine dans les pages construites. */
const CHARGEMENTS_HTML = /<(script|link|img|iframe|video|audio|source|embed|object|form|input|track)\b[^>]*>/gi;
const ATTRIBUT_EXTERNE = /\b(?:src|srcset|href|action|data|poster|formaction)\s*=\s*["']?\s*((?:https?:)?\/\/[^\s"'>]+)/gi;
const CHARGEMENTS_CODE = [
  ['url() externe', /url\(\s*["']?((?:https?:)?\/\/[^)\s"']+)/gi],
  ['@import externe', /@import\s+(?:url\(\s*)?["']((?:https?:)?\/\/[^"']+)/gi],
  ['fetch() ou import() externe', /\b(?:fetch|import)\s*\(\s*["'`]((?:https?:)?\/\/[^"'`]+)/gi],
  ['WebSocket externe', /new\s+(?:WebSocket|EventSource)\s*\(\s*["'`]((?:https?|wss?:)?\/\/[^"'`]+)/gi],
];

function hoteDe(adresse) {
  const trouve = /^(?:[a-z]+:)?\/\/([^/:?#]+)/i.exec(adresse);
  return trouve ? trouve[1].toLowerCase() : '';
}

function verifierConstruit(racine, liste, fautes) {
  const dossier = join(racine, 'coeur/dist');
  const autorises = new Set([...HOTES_LOCAUX, ...(liste.espacesDeNoms ?? [])]);
  for (const fichier of listerFichiers(dossier)) {
    if (!EXTENSIONS_CONSTRUIT.has(extname(fichier))) continue;
    const relatif = cheminRelatif(racine, fichier);
    const texte = readFileSync(fichier, 'utf8');
    const vues = new Set();
    const signaler = (cause, adresse) => {
      // Une même adresse peut répondre à deux motifs (@import url(…)) : une seule faute.
      if (autorises.has(hoteDe(adresse)) || vues.has(adresse)) return;
      vues.add(adresse);
      fautes.push(`${relatif} — ressource tierce (${cause}) : ${adresse}`);
    };
    if (extname(fichier) === '.html') {
      for (const balise of texte.matchAll(CHARGEMENTS_HTML)) {
        // Un lien <a href> n'est pas un chargement : seules les balises ci-dessus le sont.
        if (balise[1].toLowerCase() === 'link' && !/\brel\s*=\s*["']?(?:stylesheet|preload|prefetch|modulepreload|icon|preconnect|dns-prefetch)/i.test(balise[0])) continue;
        for (const attribut of balise[0].matchAll(ATTRIBUT_EXTERNE)) signaler(`<${balise[1]}>`, attribut[1]);
      }
    }
    for (const [cause, motif] of CHARGEMENTS_CODE) {
      for (const correspondance of texte.matchAll(motif)) signaler(cause, correspondance[1]);
    }
  }
}

/** Unités Quadlet : hors des conteneurs autorisés à sortir, seuls des réseaux `Internal=true`. */
function verifierQuadlet(racine, liste, fautes) {
  const dossier = join(racine, 'deploiement');
  const fichiers = listerFichiers(dossier);
  const reseauxInternes = new Set();
  const reseauxConnus = new Set();
  for (const fichier of fichiers.filter((f) => extname(f) === '.network')) {
    const nom = basename(fichier);
    reseauxConnus.add(nom);
    if (/^\s*Internal\s*=\s*true\s*$/im.test(readFileSync(fichier, 'utf8'))) reseauxInternes.add(nom);
  }
  const autorises = new Set(Object.keys(liste.conteneurs ?? {}));
  for (const fichier of fichiers.filter((f) => extname(f) === '.container')) {
    const relatif = cheminRelatif(racine, fichier);
    const service = basename(fichier, '.container');
    if (autorises.has(service)) continue;
    const reseaux = [...readFileSync(fichier, 'utf8').matchAll(/^\s*Network\s*=\s*(\S+)/gim)].map((m) => m[1]);
    if (reseaux.length === 0) {
      fautes.push(`${relatif} — « ${service} » sans réseau interne : il sortirait sur Internet (autorisés : ${[...autorises].join(', ')})`);
    }
    for (const reseau of reseaux) {
      if (!reseauxInternes.has(reseau)) {
        const cause = reseauxConnus.has(reseau) ? 'sans « Internal=true »' : 'inconnu ou hors .network du dépôt';
        fautes.push(`${relatif} — « ${service} » sur le réseau « ${reseau} », ${cause} : sortie Internet non autorisée`);
      }
    }
  }
}

/** Rend la liste des fautes. */
export function verifierSorties(racine = RACINE_DEPOT) {
  const { liste, erreur } = lire(racine);
  if (erreur !== undefined) return [erreur];
  const fautes = [];
  verifierCode(racine, liste, fautes);
  verifierConstruit(racine, liste, fautes);
  verifierQuadlet(racine, liste, fautes);
  return fautes;
}

if (import.meta.main) {
  process.exitCode = rapporter('appels sortants', verifierSorties());
}
