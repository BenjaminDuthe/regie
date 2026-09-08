// regie — serveur de la maquette de validation UX.
// Zéro dépendance : sert les fichiers statiques de maquette/public.
// Aucune donnée réelle, aucun appel réseau, aucun comportement applicatif.

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, normalize, extname } from 'node:path';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), 'public');
const PORT = Number(process.env.PORT || 4310);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

function cheminDemande(url) {
  const sansRequete = url.split('?')[0].split('#')[0];
  const decode = decodeURIComponent(sansRequete);
  const relatif = decode === '/' ? '/index.html' : decode;
  const absolu = normalize(join(RACINE, relatif));
  // Garde de traversée : rien en dehors de maquette/public.
  return absolu.startsWith(RACINE) ? absolu : null;
}

const serveur = createServer(async (requete, reponse) => {
  const chemin = cheminDemande(requete.url || '/');
  if (!chemin) {
    reponse.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' });
    reponse.end('Chemin refusé');
    return;
  }
  try {
    const contenu = await readFile(chemin);
    reponse.writeHead(200, {
      'content-type': TYPES[extname(chemin)] || 'application/octet-stream',
      'cache-control': 'no-store',
    });
    reponse.end(contenu);
  } catch {
    reponse.writeHead(404, { 'content-type': 'text/html; charset=utf-8' });
    reponse.end(
      '<!doctype html><meta charset="utf-8"><title>Page absente — maquette regie</title>' +
        '<p style="font:14px system-ui;padding:24px">Cette page n\'existe pas dans la maquette. ' +
        '<a href="/index.html">Retour à la librairie</a>.</p>',
    );
  }
});

serveur.listen(PORT, () => {
  console.log(`Maquette regie servie sur http://localhost:${PORT}`);
});
