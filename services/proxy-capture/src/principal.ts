// regie — point d'entrée du proxy de capture. Aucune lecture de l'environnement (seul coeur/src/env.ts le fait) :
// la configuration est un fichier JSON passé en argument, la clé du laissez-passer un fichier de secret.
//   node services/proxy-capture/src/principal.ts /etc/regie/proxy-capture.json
// { "ecoute": { "hote": "0.0.0.0", "port": 3128 }, "fichierCle": "/run/secrets/regie_capture_cle",
//   "dossierTraces": "/traces", "foyer": ["203.0.113.7"] }

import { readFileSync } from 'node:fs';
import { creerProxy } from './proxy.ts';
import { purgerTraces, traceurFichier } from './traces.ts';

type Configuration = Readonly<{
  ecoute: Readonly<{ hote: string; port: number }>;
  fichierCle: string;
  dossierTraces: string;
  foyer: readonly string[];
}>;

function lireConfiguration(chemin: string | undefined): Configuration {
  if (chemin === undefined) throw new Error('usage : principal.ts <configuration.json>');
  const c = JSON.parse(readFileSync(chemin, 'utf8')) as Configuration;
  if (typeof c.ecoute?.hote !== 'string' || !Number.isInteger(c.ecoute.port) || typeof c.fichierCle !== 'string' || typeof c.dossierTraces !== 'string' || !Array.isArray(c.foyer)) {
    throw new Error('configuration du proxy de capture invalide');
  }
  return c;
}

if (import.meta.main) {
  const configuration = lireConfiguration(process.argv[2]);
  const cle = Buffer.from(readFileSync(configuration.fichierCle, 'utf8').trim(), 'base64url');
  if (cle.byteLength < 32) {
    process.stderr.write('proxy-capture refuse de démarrer : clé de laissez-passer trop courte\n');
    process.exit(1);
  }
  const proxy = creerProxy({ cle, traceur: traceurFichier(configuration.dossierTraces), foyer: configuration.foyer });
  const purger = () => purgerTraces(configuration.dossierTraces);
  purger();
  const minuterie = setInterval(purger, 86_400_000);
  for (const signal of ['SIGTERM', 'SIGINT'] as const) {
    process.once(signal, () => {
      clearInterval(minuterie);
      proxy.close(() => process.exit(0));
      proxy.closeAllConnections();
    });
  }
  proxy.listen(configuration.ecoute.port, configuration.ecoute.hote);
}
