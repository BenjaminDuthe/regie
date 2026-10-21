// regie — suivi des tâches en direct (histoire 2.5, FR-61) : un flux d'événements (SSE) sur la même origine, compatible
// avec la CSP (`connect-src 'self'`), sans aucun service tiers. La route contrôle la session elle-même (elle figure
// dans ROUTES_AVEC_SESSION_PROPRE) et, à chaque tour, relit la session ET les droits : une session révoquée ou une
// tâche qui change de main ne fuit pas dans un flux resté ouvert.
//   - le flux n'envoie que lorsque la vue change ; un battement tous les 15 s garde la connexion en vie ;
//   - au plus 3 flux ouverts par personne ; chaque flux se ferme au bout de 15 min (le navigateur se reconnecte et la
//     session est alors revérifiée) ;
//   - la lecture du flux n'est pas écrite au journal (elle se répète toutes les quelques secondes) ; les actions, elles,
//     le sont.

import type { FastifyInstance } from 'fastify';
import type { Services } from '../auth/services.ts';
import { COOKIE_SESSION, lireCookie } from '../auth/cookies.ts';
import { idUtilisateur } from '../infra/espaces.ts';
import { suivreTaches } from '../services/suivi.ts';
import { enregistrerRouteFluxJeu } from './jeu.ts';

export type OptionsFlux = Readonly<{ intervalleMs?: number; battementMs?: number; dureeMaxMs?: number; maxParPersonne?: number }>;

export const FLUX_PAR_DEFAUT = Object.freeze({ intervalleMs: 3000, battementMs: 15_000, dureeMaxMs: 15 * 60_000, maxParPersonne: 3 });

export function enregistrerRoutesFlux(app: FastifyInstance, services: Services, options: OptionsFlux = {}): void {
  const { intervalleMs, battementMs, dureeMaxMs, maxParPersonne } = { ...FLUX_PAR_DEFAUT, ...options };
  const ouverts = new Map<string, number>();
  const fermetures = new Set<() => void>();

  app.get('/flux/taches', async (requete, reponse) => {
    reponse.header('cache-control', 'no-store');
    const valeur = lireCookie(requete.headers.cookie, COOKIE_SESSION);
    const session = valeur === undefined ? undefined : await services.sessions.trouver(valeur);
    if (valeur === undefined || session === undefined) return reponse.code(401).send({ erreur: 'session_requise' });
    const personne = idUtilisateur(session.marqueId, session.sub);
    if ((ouverts.get(personne) ?? 0) >= maxParPersonne) return reponse.code(429).header('retry-after', '30').send({ erreur: 'trop_de_flux' });
    ouverts.set(personne, (ouverts.get(personne) ?? 0) + 1);

    // On prend la main sur la réponse : le flux dure.
    reponse.hijack();
    const brut = reponse.raw;
    brut.writeHead(200, { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-store', connection: 'keep-alive', 'x-accel-buffering': 'no' });
    brut.write('retry: 5000\n\n');

    let ferme = false;
    let derniere = '';
    let minuterie: NodeJS.Timeout | undefined;
    let battement: NodeJS.Timeout | undefined;
    let echeance: NodeJS.Timeout | undefined;
    const fermer = (): void => {
      if (ferme) return;
      ferme = true;
      clearTimeout(minuterie);
      clearInterval(battement);
      clearTimeout(echeance);
      fermetures.delete(fermer);
      const reste = (ouverts.get(personne) ?? 1) - 1;
      if (reste <= 0) ouverts.delete(personne);
      else ouverts.set(personne, reste);
      brut.end();
    };
    fermetures.add(fermer);
    requete.raw.on('close', fermer);

    const tour = async (): Promise<void> => {
      if (ferme) return;
      try {
        // Droits recalculés à chaque tour : session encore valable ? Sinon on coupe sans rien envoyer.
        const courante = await services.sessions.trouver(valeur);
        if (courante === undefined || courante.marqueId !== session.marqueId || courante.sub !== session.sub) return fermer();
        const taches = await suivreTaches(services, courante.marqueId, personne);
        const message = JSON.stringify({ taches });
        if (message !== derniere && !ferme) {
          derniere = message;
          brut.write(`event: taches\ndata: ${message}\n\n`);
        }
      } catch (erreur) {
        app.log.warn({ erreur: erreur instanceof Error ? erreur.message : String(erreur) }, 'flux des tâches interrompu');
        return fermer();
      }
      if (!ferme) minuterie = setTimeout(() => void tour(), intervalleMs);
    };
    battement = setInterval(() => !ferme && brut.write(': battement\n\n'), battementMs);
    echeance = setTimeout(fermer, dureeMaxMs);
    await tour();
  });

  enregistrerRouteFluxJeu(app, services, options);

  // Arrêt du serveur : aucun flux ne retient la fermeture.
  app.addHook('onClose', async () => {
    for (const fermer of [...fermetures]) fermer();
  });
}
