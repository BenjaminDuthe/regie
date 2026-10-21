// regie — suivi en direct du jeu d'un script (histoire 4.5, FR-18, AR-8, UX-DR21) : un flux d'événements (SSE) sur la même
// origine, compatible avec la CSP (`connect-src 'self'`). Comme `/flux/taches`, la route contrôle la session elle-même
// (elle figure dans ROUTES_AVEC_SESSION_PROPRE) et relit session ET tâche à chaque tour. Trois événements :
//   - `journal` : une entrée du journal (verbe, cible, position du pointeur), poussée dès qu'elle arrive ;
//   - `etat`    : la vue de la tâche (file, position, fin estimée), quand elle change ;
//   - `fin`     : le résultat du jeu et l'annonce « brouillon prêt vers 18 h 52 dans Relire », puis le flux se ferme.
// Le journal ne contient jamais une valeur saisie. Au plus 2 flux de jeu par personne ; 15 min au plus par flux.

import type { FastifyInstance } from 'fastify';
import { TACHES } from '@regie/contrats';
import type { Services } from '../auth/services.ts';
import { COOKIE_SESSION, lireCookie } from '../auth/cookies.ts';
import { idUtilisateur } from '../infra/espaces.ts';
import { heureEnClair } from '../services/horaires.ts';
import { suivreUneTache } from '../services/suivi.ts';
import type { OptionsFlux } from './routes.ts';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const FLUX_JEU_MAX_PAR_PERSONNE = 2;

/** Ce qui reste à faire après la capture avant qu'un brouillon soit à relire : le montage puis le rendu (durées typiques). */
export const SUITE_APRES_CAPTURE_S = (TACHES['montage']?.dureeTypiqueS ?? 300) + (TACHES['rendu']?.dureeTypiqueS ?? 240);

export function enregistrerRouteFluxJeu(app: FastifyInstance, services: Services, options: OptionsFlux = {}): void {
  const intervalleMs = options.intervalleMs ?? 2000;
  const battementMs = options.battementMs ?? 15_000;
  const dureeMaxMs = options.dureeMaxMs ?? 15 * 60_000;
  const ouverts = new Map<string, number>();
  const fermetures = new Set<() => void>();

  app.get('/flux/jeu', async (requete, reponse) => {
    reponse.header('cache-control', 'no-store');
    const valeur = lireCookie(requete.headers.cookie, COOKIE_SESSION);
    const session = valeur === undefined ? undefined : await services.sessions.trouver(valeur);
    if (valeur === undefined || session === undefined) return reponse.code(401).send({ erreur: 'session_requise' });
    const tacheId = (requete.query as { tache?: unknown } | null)?.tache;
    if (typeof tacheId !== 'string' || !UUID.test(tacheId)) return reponse.code(400).send({ erreur: 'tache_invalide' });
    const personne = idUtilisateur(session.marqueId, session.sub);
    // La tâche doit être à cette personne et être un jeu : sinon elle n'existe pas.
    const tache = await services.file.lire(session.marqueId, personne, tacheId);
    if (tache === undefined || tache.type !== 'jeu_script') return reponse.code(404).send({ erreur: 'tache_introuvable' });
    if ((ouverts.get(personne) ?? 0) >= FLUX_JEU_MAX_PAR_PERSONNE) return reponse.code(429).header('retry-after', '30').send({ erreur: 'trop_de_flux' });
    ouverts.set(personne, (ouverts.get(personne) ?? 0) + 1);

    reponse.hijack();
    const brut = reponse.raw;
    brut.writeHead(200, { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-store', connection: 'keep-alive', 'x-accel-buffering': 'no' });
    brut.write('retry: 5000\n\n');

    let ferme = false;
    let derniere = '';
    let minuterie: NodeJS.Timeout | undefined;
    let battement: NodeJS.Timeout | undefined;
    let echeance: NodeJS.Timeout | undefined;
    let desabonner: () => void = () => undefined;
    const fermer = (): void => {
      if (ferme) return;
      ferme = true;
      clearTimeout(minuterie);
      clearInterval(battement);
      clearTimeout(echeance);
      desabonner();
      fermetures.delete(fermer);
      const reste = (ouverts.get(personne) ?? 1) - 1;
      if (reste <= 0) ouverts.delete(personne);
      else ouverts.set(personne, reste);
      brut.end();
    };
    fermetures.add(fermer);
    requete.raw.on('close', fermer);

    // Les entrées déjà écrites, puis les suivantes : sans attente entre les deux, aucune n'est perdue ni doublée.
    for (const e of services.journauxJeu.lire(session.marqueId, tacheId)) brut.write(`event: journal\ndata: ${JSON.stringify(e)}\n\n`);
    desabonner = services.journauxJeu.abonner(session.marqueId, tacheId, (e) => !ferme && brut.write(`event: journal\ndata: ${JSON.stringify(e)}\n\n`));

    const tour = async (): Promise<void> => {
      if (ferme) return;
      try {
        const courante = await services.sessions.trouver(valeur);
        if (courante === undefined || courante.marqueId !== session.marqueId || courante.sub !== session.sub) return fermer();
        const vue = await suivreUneTache(services, courante.marqueId, personne, tacheId);
        if (vue === undefined) return fermer();
        const message = JSON.stringify({ tache: vue });
        if (message !== derniere && !ferme) {
          derniere = message;
          brut.write(`event: etat\ndata: ${message}\n\n`);
        }
        if (vue.etat === 'terminee' || vue.etat === 'echouee' || vue.etat === 'annulee') {
          const maintenant = new Date(services.maintenant());
          const script = await services.scripts.lire(courante.marqueId, personne, String(tache.entree['scriptId'] ?? ''));
          const jeu = script?.dernierJeu ?? null;
          const secondes = vue.termineeLe === null ? null : Math.max(0, Math.round((new Date(vue.termineeLe).getTime() - new Date(vue.creeLe).getTime()) / 1000));
          const fin = {
            etat: vue.etat,
            cause: vue.cause,
            secondes,
            // Une estimation, jamais une promesse : le montage et le rendu viennent après la capture.
            pretVers: vue.etat === 'terminee' ? heureEnClair(new Date(maintenant.getTime() + SUITE_APRES_CAPTURE_S * 1000), maintenant) : null,
            jeu: jeu === null ? null : jeu.etat === 'echec' ? { etat: jeu.etat, etape: jeu.etape, cause: jeu.cause } : jeu.etat === 'hote_refuse' ? { etat: jeu.etat, hote: jeu.hote, etape: jeu.etape ?? null } : { etat: jeu.etat },
          };
          if (!ferme) brut.write(`event: fin\ndata: ${JSON.stringify(fin)}\n\n`);
          return fermer();
        }
      } catch (erreur) {
        app.log.warn({ erreur: erreur instanceof Error ? erreur.message : String(erreur) }, 'flux du jeu interrompu');
        return fermer();
      }
      if (!ferme) minuterie = setTimeout(() => void tour(), intervalleMs);
    };
    battement = setInterval(() => !ferme && brut.write(': battement\n\n'), battementMs);
    echeance = setTimeout(fermer, dureeMaxMs);
    await tour();
  });

  app.addHook('onClose', async () => {
    for (const fermer of [...fermetures]) fermer();
  });
}
