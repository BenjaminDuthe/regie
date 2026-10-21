// regie — vérificateur des licences (NFR-26, AD-17, AR-23).
// Toute dépendance npm (package-lock.json), pip (requirements.lock), police, modèle et
// musique doit porter une licence libre autorisant l'usage commercial. Les licences des
// composants tiers sont regroupées dans LICENCES-TIERS.md, régénéré par
// `node outils/ci/verifier-licences.mjs --ecrire` et vérifié à jour par la CI.
// Chaque faute nomme le composant et la cause.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import { RACINE_DEPOT, cheminRelatif, listerFichiers, rapporter } from './commun.mjs';

export const FICHIER_LICENCES = 'deploiement/licences-tiers.json';
export const FICHIER_RECAPITULATIF = 'LICENCES-TIERS.md';

/** Identifiants SPDX libres et compatibles avec un usage commercial (liste fermée). */
export const LICENCES_LIBRES = new Set([
  '0BSD',
  'AGPL-3.0-only',
  'AGPL-3.0-or-later',
  'Apache-2.0',
  'Artistic-2.0',
  'BlueOak-1.0.0',
  'BSD-2-Clause',
  'BSD-3-Clause',
  'CC-BY-3.0',
  'CC-BY-4.0',
  'CC0-1.0',
  'GPL-2.0-only',
  'GPL-2.0-or-later',
  'GPL-3.0-only',
  'GPL-3.0-or-later',
  'ISC',
  'LGPL-2.1-only',
  'LGPL-2.1-or-later',
  'LGPL-3.0-only',
  'LGPL-3.0-or-later',
  'MIT',
  'MIT-0',
  'MPL-2.0',
  'OFL-1.1',
  'PSF-2.0',
  'Python-2.0',
  'Unlicense',
  'WTFPL',
  'Zlib',
]);

/** Extensions de polices : chaque fichier versionné doit être déclaré avec sa licence. */
const EXTENSIONS_POLICES = new Set(['.woff', '.woff2', '.ttf', '.otf', '.eot']);

/**
 * Évalue une expression SPDX (« MIT », « (MIT OR Apache-2.0) », « A AND B », « GPL-2.0-only WITH exception »).
 * `OR` : une alternative libre suffit ; `AND` : toutes doivent l'être.
 */
export function licenceLibre(expression) {
  if (typeof expression !== 'string' || expression.trim() === '') return false;
  const jetons = expression.replace(/\(/g, ' ( ').replace(/\)/g, ' ) ').trim().split(/\s+/);
  let position = 0;
  const lireOu = () => {
    let valeur = lireEt();
    while (jetons[position] === 'OR') {
      position += 1;
      const suite = lireEt();
      valeur = valeur || suite;
    }
    return valeur;
  };
  const lireEt = () => {
    let valeur = lireTerme();
    while (jetons[position] === 'AND') {
      position += 1;
      const suite = lireTerme();
      valeur = valeur && suite;
    }
    return valeur;
  };
  const lireTerme = () => {
    const jeton = jetons[position];
    position += 1;
    if (jeton === undefined) return false;
    if (jeton === '(') {
      const valeur = lireOu();
      if (jetons[position] !== ')') return false;
      position += 1;
      return valeur;
    }
    const libre = LICENCES_LIBRES.has(jeton) || LICENCES_LIBRES.has(jeton.replace(/\+$/, ''));
    // Une exception (« WITH … ») ne change pas la licence de base.
    if (jetons[position] === 'WITH') position += 2;
    return libre;
  };
  const resultat = lireOu();
  return position === jetons.length && resultat;
}

function lireJson(racine, fichier) {
  const chemin = join(racine, fichier);
  return existsSync(chemin) ? JSON.parse(readFileSync(chemin, 'utf8')) : null;
}

/** Nom de paquet npm d'une entrée « node_modules/a/node_modules/@b/c » → « @b/c ». */
function nomNpm(cle) {
  return cle.slice(cle.lastIndexOf('node_modules/') + 'node_modules/'.length);
}

/** Paquets npm tiers du verrou : [{ nom, version, licence }]. Les paquets du dépôt (liens) sont exclus. */
function lireNpm(racine, fautes) {
  const verrou = lireJson(racine, 'package-lock.json');
  if (verrou === null) {
    fautes.push('package-lock.json : absent, impossible de contrôler les licences npm');
    return [];
  }
  const paquets = [];
  for (const [cle, entree] of Object.entries(verrou.packages ?? {})) {
    if (cle === '' || entree.link === true || !cle.includes('node_modules/')) continue;
    paquets.push({ nom: nomNpm(cle), version: entree.version ?? '?', licence: entree.license });
  }
  return paquets.sort((a, b) => a.nom.localeCompare(b.nom) || a.version.localeCompare(b.version));
}

/** Paquets pip du verrou haché : [{ nom, version }], noms normalisés (PEP 503). */
function lirePip(racine) {
  const chemin = join(racine, 'requirements.lock');
  if (!existsSync(chemin)) return [];
  const paquets = [];
  for (const ligne of readFileSync(chemin, 'utf8').split('\n')) {
    const trouve = /^([A-Za-z0-9][A-Za-z0-9._-]*)==([^\s;\\]+)/.exec(ligne);
    if (trouve) paquets.push({ nom: trouve[1].toLowerCase().replace(/[-_.]+/g, '-'), version: trouve[2] });
  }
  return paquets.sort((a, b) => a.nom.localeCompare(b.nom));
}

/** Contrôle une liste déclarée (polices, modèles, musiques) : licence libre et source vérifiable. */
function verifierListe(nomListe, liste, fautes) {
  if (!Array.isArray(liste)) {
    fautes.push(`${FICHIER_LICENCES} : « ${nomListe} » doit être une liste`);
    return;
  }
  for (const element of liste) {
    const nom = element?.nom ?? '(sans nom)';
    if (!licenceLibre(element?.licence)) {
      fautes.push(`${FICHIER_LICENCES} : ${nomListe} « ${nom} » sous « ${element?.licence ?? 'aucune licence'} », licence libre commerciale exigée`);
    }
    if (typeof element?.source !== 'string' || element.source.trim() === '') {
      fautes.push(`${FICHIER_LICENCES} : ${nomListe} « ${nom} » sans source vérifiable`);
    }
  }
}

/** Fautes de licence et données du récapitulatif. */
export function analyserLicences(racine = RACINE_DEPOT) {
  const fautes = [];
  const vide = { fautes, npm: [], pip: [], polices: [], modeles: [], musiques: [], images: [] };
  const npm = lireNpm(racine, fautes);
  for (const paquet of npm) {
    if (!licenceLibre(paquet.licence)) {
      fautes.push(`npm : « ${paquet.nom}@${paquet.version} » sous « ${paquet.licence ?? 'aucune licence déclarée'} », licence libre commerciale exigée`);
    }
  }

  let declarations = null;
  try {
    declarations = lireJson(racine, FICHIER_LICENCES);
    if (declarations === null) fautes.push(`${FICHIER_LICENCES} : fichier absent`);
  } catch (erreur) {
    fautes.push(`${FICHIER_LICENCES} : JSON invalide (${erreur.message})`);
  }
  if (declarations === null) return { ...vide, npm };

  const pip = lirePip(racine).map((paquet) => ({ ...paquet, licence: declarations.pip?.[paquet.nom] }));
  for (const paquet of pip) {
    if (paquet.licence === undefined) {
      fautes.push(`pip : « ${paquet.nom}==${paquet.version} » sans licence déclarée dans ${FICHIER_LICENCES}`);
    } else if (!licenceLibre(paquet.licence)) {
      fautes.push(`pip : « ${paquet.nom}==${paquet.version} » sous « ${paquet.licence} », licence libre commerciale exigée`);
    }
  }

  const polices = declarations.polices ?? [];
  const modeles = declarations.modeles ?? [];
  const musiques = declarations.musiques ?? [];
  // Composants installés dans les images de conteneur (hors npm du dépôt) : Playwright et son Chromium, par exemple.
  const images = declarations.images ?? [];
  verifierListe('police', polices, fautes);
  verifierListe('modèle', modeles, fautes);
  verifierListe('musique', musiques, fautes);
  verifierListe('composant d’image', images, fautes);

  // Une police versionnée sans déclaration est une licence non vérifiée.
  const declarees = new Set((Array.isArray(polices) ? polices : []).map((police) => police?.fichier));
  for (const dossier of ['coeur', 'paquets', 'services', 'deploiement']) {
    for (const fichier of listerFichiers(join(racine, dossier))) {
      const relatif = cheminRelatif(racine, fichier);
      if (EXTENSIONS_POLICES.has(extname(fichier).toLowerCase()) && !declarees.has(relatif)) {
        fautes.push(`police : « ${relatif} » sans licence déclarée dans ${FICHIER_LICENCES} (champ « fichier »)`);
      }
    }
  }

  // deploiement/modeles.lock arrive avec le premier modèle : son format n'est pas encore fixé.
  // Sa présence sans déclaration ne doit pas passer inaperçue.
  if (existsSync(join(racine, 'deploiement/modeles.lock')) && Array.isArray(modeles) && modeles.length === 0) {
    fautes.push(`deploiement/modeles.lock existe mais « modeles » est vide dans ${FICHIER_LICENCES} : déclare chaque modèle et sa licence`);
  }

  return { fautes, npm, pip, polices, modeles, musiques, images };
}

/** Contenu de LICENCES-TIERS.md, déterministe. */
export function produireRecapitulatif({ npm, pip, polices, modeles, musiques, images = [] }) {
  const lignes = [
    '# Licences des composants tiers',
    '',
    '<!-- Fichier généré par `node outils/ci/verifier-licences.mjs --ecrire` : ne pas modifier à la main. -->',
    '',
    'regie est publié sous AGPL-3.0-only. Les composants ci-dessous ont tous une licence libre',
    'autorisant l’usage commercial (NFR-26) ; la CI refuse tout autre cas et vérifie que ce fichier est à jour.',
    '',
  ];
  const tableau = (titre, colonnes, rangs) => {
    lignes.push(`## ${titre}`, '');
    if (rangs.length === 0) {
      lignes.push('Aucun pour l’instant.', '');
      return;
    }
    lignes.push(`| ${colonnes.join(' | ')} |`, `| ${colonnes.map(() => '---').join(' | ')} |`);
    for (const rang of rangs) lignes.push(`| ${rang.join(' | ')} |`);
    lignes.push('');
  };
  tableau('npm', ['Paquet', 'Version', 'Licence'], npm.map((p) => [p.nom, p.version, p.licence ?? '?']));
  tableau('pip', ['Paquet', 'Version', 'Licence'], pip.map((p) => [p.nom, p.version, p.licence ?? '?']));
  tableau('Polices', ['Nom', 'Licence', 'Source'], polices.map((p) => [p.nom, p.licence, p.source]));
  tableau('Modèles', ['Nom', 'Licence', 'Source'], modeles.map((p) => [p.nom, p.licence, p.source]));
  tableau('Composants des images', ['Nom', 'Licence', 'Source'], images.map((p) => [p.nom, p.licence, p.source]));
  tableau('Musiques', ['Nom', 'Licence', 'Source'], musiques.map((p) => [p.nom, p.licence, p.source]));
  return lignes.join('\n');
}

/** Rend la liste des fautes : licences refusées, puis récapitulatif absent ou périmé. */
export function verifierLicences(racine = RACINE_DEPOT) {
  const analyse = analyserLicences(racine);
  const fautes = [...analyse.fautes];
  if (fautes.length > 0) return fautes;
  const chemin = join(racine, FICHIER_RECAPITULATIF);
  if (!existsSync(chemin)) {
    fautes.push(`${FICHIER_RECAPITULATIF} : absent ; lance « node outils/ci/verifier-licences.mjs --ecrire »`);
  } else if (readFileSync(chemin, 'utf8') !== produireRecapitulatif(analyse)) {
    fautes.push(`${FICHIER_RECAPITULATIF} : périmé ; lance « node outils/ci/verifier-licences.mjs --ecrire »`);
  }
  return fautes;
}

if (import.meta.main) {
  if (process.argv.includes('--ecrire')) {
    const analyse = analyserLicences();
    if (analyse.fautes.length > 0) {
      process.exitCode = rapporter('licences', analyse.fautes);
    } else {
      writeFileSync(join(RACINE_DEPOT, FICHIER_RECAPITULATIF), produireRecapitulatif(analyse));
      process.stdout.write(`✔ ${FICHIER_RECAPITULATIF} écrit\n`);
    }
  } else {
    process.exitCode = rapporter('licences', verifierLicences());
  }
}
