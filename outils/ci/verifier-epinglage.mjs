// regie — vérificateur de l'épinglage des dépendances (AR-2, AR-23).
// Chaque manifeste (package.json, pyproject.toml, requirements.lock) doit épingler
// des versions exactes et stables, égales à deploiement/versions.json quand il les nomme.
// Chaque faute nomme le manifeste et le paquet.

import { existsSync, readFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { RACINE_DEPOT, cheminRelatif, listerFichiers, rapporter } from './commun.mjs';

const SECTIONS_NPM = ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies'];

/** Version exacte et stable : X.Y.Z, sans plage ni suffixe -rc, -beta, -alpha, -next, -canary… */
const VERSION_STABLE = /^\d+\.\d+\.\d+$/;

/** Version Python exacte et stable : X.Y[.Z[.W]], sans suffixe a, b, rc, dev. */
const VERSION_STABLE_PY = /^\d+(\.\d+){1,3}$/;

/** Image de conteneur épinglée par empreinte. */
const IMAGE_EPINGLEE = /@sha256:[0-9a-f]{64}\b/;

/** Nom de paquet Python normalisé (PEP 503), extras retirés. */
function nomPython(nom) {
  return nom.replace(/\[.*\]$/, '').toLowerCase().replace(/[-_.]+/g, '-');
}

function lireJson(fichier) {
  return JSON.parse(readFileSync(fichier, 'utf8'));
}

function verifierPackageJson(racine, fichier, versions, verrou, fautes) {
  const relatif = cheminRelatif(racine, fichier);
  const manifeste = lireJson(fichier);
  for (const section of SECTIONS_NPM) {
    for (const [paquet, version] of Object.entries(manifeste[section] ?? {})) {
      if (!VERSION_STABLE.test(version)) {
        fautes.push(`${relatif} : « ${paquet} » en « ${version} » (${section}) n'est pas une version exacte et stable`);
        continue;
      }
      const attendue = versions.npm?.[paquet];
      if (attendue !== undefined && attendue !== version) {
        fautes.push(`${relatif} : « ${paquet} » en ${version}, deploiement/versions.json attend ${attendue}`);
      }
      if (verrou !== null && section !== 'peerDependencies') {
        const dossier = dirname(relatif) === '.' ? '' : `${dirname(relatif)}/`;
        const entree =
          verrou.packages?.[`${dossier}node_modules/${paquet}`] ?? verrou.packages?.[`node_modules/${paquet}`];
        if (entree === undefined) {
          fautes.push(`${relatif} : « ${paquet} » absent de package-lock.json (relance npm install)`);
        } else if (entree.version !== version) {
          fautes.push(`${relatif} : « ${paquet} » en ${version}, package-lock.json verrouille ${entree.version}`);
        }
      }
    }
  }
  if (relatif === 'package.json') {
    const engins = manifeste.engines?.node;
    if (engins !== versions.node?.engines) {
      fautes.push(`package.json : engines.node « ${engins} », deploiement/versions.json attend « ${versions.node?.engines} »`);
    }
  }
}

/** Lecture minimale du TOML : `requires-python` et le tableau `dependencies` de [project]. */
function lirePyproject(texte) {
  const requiresPython = texte.match(/^requires-python\s*=\s*"([^"]*)"/m)?.[1];
  const bloc = texte.match(/^dependencies\s*=\s*\[([\s\S]*?)^\]/m)?.[1] ?? '';
  const dependances = [...bloc.matchAll(/"([^"]+)"/g)].map((m) => m[1].trim());
  return { requiresPython, dependances };
}

function verifierPyproject(racine, fichier, versions, fautes) {
  const relatif = cheminRelatif(racine, fichier);
  const { requiresPython, dependances } = lirePyproject(readFileSync(fichier, 'utf8'));
  if (requiresPython !== versions.python?.requiresPython) {
    fautes.push(`${relatif} : requires-python « ${requiresPython} », deploiement/versions.json attend « ${versions.python?.requiresPython} »`);
  }
  const epinglees = new Map();
  for (const exigence of dependances) {
    const correspondance = exigence.match(/^([A-Za-z0-9_.\-]+(?:\[[^\]]*\])?)\s*==\s*([^\s;,]+)$/);
    if (correspondance === null || !VERSION_STABLE_PY.test(correspondance[2])) {
      fautes.push(`${relatif} : « ${exigence} » n'est pas épinglé en « == » sur une version exacte et stable`);
      continue;
    }
    const paquet = nomPython(correspondance[1]);
    epinglees.set(paquet, correspondance[2]);
    const attendue = Object.entries(versions.python?.paquets ?? {}).find(([nom]) => nomPython(nom) === paquet)?.[1];
    if (attendue !== undefined && attendue !== correspondance[2]) {
      fautes.push(`${relatif} : « ${paquet} » en ${correspondance[2]}, deploiement/versions.json attend ${attendue}`);
    }
  }
  const verrou = join(dirname(fichier), 'requirements.lock');
  if (!existsSync(verrou)) {
    fautes.push(`${relatif} : requirements.lock absent à côté du manifeste`);
    return;
  }
  verifierVerrouPython(racine, verrou, epinglees, fautes);
}

function verifierVerrouPython(racine, fichier, epinglees, fautes) {
  const relatif = cheminRelatif(racine, fichier);
  // Regroupe les lignes continuées par « \ » : une exigence et ses empreintes.
  const exigences = readFileSync(fichier, 'utf8')
    .replace(/\\\r?\n/g, ' ')
    .split(/\r?\n/)
    .map((ligne) => ligne.replace(/#.*$/, '').trim())
    .filter((ligne) => ligne !== '' && !ligne.startsWith('--'));
  const verrouillees = new Map();
  for (const exigence of exigences) {
    const correspondance = exigence.match(/^([A-Za-z0-9_.\-]+(?:\[[^\]]*\])?)==(\S+?)(\s|;|$)/);
    if (correspondance === null || !VERSION_STABLE_PY.test(correspondance[2])) {
      fautes.push(`${relatif} : « ${exigence.split(/\s/)[0]} » n'est pas épinglé en « == » sur une version exacte et stable`);
      continue;
    }
    const paquet = nomPython(correspondance[1]);
    verrouillees.set(paquet, correspondance[2]);
    if (!/--hash=sha256:[0-9a-f]{64}/.test(exigence)) {
      fautes.push(`${relatif} : « ${paquet} » n'a pas d'empreinte --hash=sha256 (pip --require-hashes refuserait)`);
    }
  }
  for (const [paquet, version] of epinglees) {
    if (verrouillees.get(paquet) !== version) {
      fautes.push(`${relatif} : « ${paquet} » verrouillé en ${verrouillees.get(paquet) ?? 'rien'}, le manifeste épingle ${version}`);
    }
  }
}

function verifierImages(racine, fichier, fautes) {
  const relatif = cheminRelatif(racine, fichier);
  const lignes = readFileSync(fichier, 'utf8').split('\n');
  lignes.forEach((ligne, index) => {
    const image = ligne.match(/^\s*(?:FROM\s+(?:--\S+\s+)*|-?\s*image:\s*)["']?([^\s"']+)/i)?.[1];
    if (image !== undefined && !image.startsWith('$') && !IMAGE_EPINGLEE.test(image)) {
      fautes.push(`${relatif}:${index + 1} : image « ${image} » non épinglée par empreinte (@sha256:…)`);
    }
  });
}

/** Rend la liste des fautes d'épinglage du dépôt situé à `racine`. */
export function verifierEpinglage(racine = RACINE_DEPOT) {
  const fautes = [];
  const fichierVersions = join(racine, 'deploiement/versions.json');
  if (!existsSync(fichierVersions)) return ['deploiement/versions.json absent'];
  const versions = lireJson(fichierVersions);

  const fichierNodeVersion = join(racine, '.node-version');
  const nodeVersion = existsSync(fichierNodeVersion) ? readFileSync(fichierNodeVersion, 'utf8').trim() : undefined;
  if (nodeVersion !== versions.node?.version) {
    fautes.push(`.node-version : « ${nodeVersion} », deploiement/versions.json attend « ${versions.node?.version} »`);
  }

  const fichierVerrou = join(racine, 'package-lock.json');
  const verrou = existsSync(fichierVerrou) ? lireJson(fichierVerrou) : null;
  if (verrou === null) fautes.push('package-lock.json absent : il doit être versionné');

  for (const fichier of listerFichiers(racine)) {
    const nom = basename(fichier);
    const relatif = cheminRelatif(racine, fichier);
    if (nom === 'package.json') verifierPackageJson(racine, fichier, versions, verrou, fautes);
    else if (nom === 'pyproject.toml') verifierPyproject(racine, fichier, versions, fautes);
    else if (
      nom.endsWith('.Containerfile') ||
      nom === 'Containerfile' ||
      nom === 'Dockerfile' ||
      /^deploiement\/compose[^/]*\.ya?ml$/.test(relatif) ||
      /^\.forgejo\/workflows\/[^/]+\.ya?ml$/.test(relatif)
    ) {
      verifierImages(racine, fichier, fautes);
    }
  }
  return fautes;
}

if (import.meta.main) {
  process.exitCode = rapporter('épinglage des dépendances', verifierEpinglage());
}
