// regie — lecture d'un fichier par adresse signée (histoire 4.6, 2.12, 7.3, FR-72). `/v/session/<marque>/<personne>/<fichier>` :
// la signature (HMAC, moins d'une heure) a déjà été vérifiée sur le chemin entier ; ici on lit le fichier AU NOM de la
// personne signée (RLS : sa marque, ses espaces). Tout ce qui manque — fichier absent, d'un autre espace, purgé, hors
// stockage — donne la même réponse « introuvable » : on ne révèle pas ce qui existe. Plage d'octets prise en charge
// (lecteur vidéo), type fixe tiré de la base, jamais de la requête. `/v/publication/…` est l'adresse remise à un réseau
// pour qu'il vienne chercher la vidéo : en plus, le fichier doit être celui d'une publication EN COURS D'ENVOI, donc
// l'adresse ne sert plus rien dès que la publication est finie, annulée ou incertaine (même signée, même non expirée).

import type { Readable } from 'node:stream';
import type { MimeFichier } from '../infra/montages.ts';
import type { Services } from '../auth/services.ts';

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const FORME = new RegExp(`^(session|publication)/(${UUID})/(${UUID})/(${UUID})$`);
const MIMES_SERVIS: ReadonlySet<MimeFichier> = new Set(['video/mp4', 'video/webm', 'audio/wav']);

export type LectureAdresse =
  | Readonly<{ statut: 404 }>
  | Readonly<{ statut: 416; octets: number }>
  | Readonly<{ statut: 200 | 206; mime: MimeFichier; octets: number; debut: number; fin: number; flux: Readable }>;

/** Une seule plage, `bytes=a-b`, `bytes=a-` ou `bytes=-n` ; `undefined` = pas de plage, `'invalide'` = 416. */
export function lirePlage(entete: string | undefined, octets: number): { debut: number; fin: number } | 'invalide' | undefined {
  if (entete === undefined) return undefined;
  const m = /^bytes=(\d*)-(\d*)$/.exec(entete.trim());
  if (m === null || (m[1] === '' && m[2] === '')) return 'invalide';
  if (octets === 0) return 'invalide';
  let debut: number;
  let fin: number;
  if (m[1] === '') {
    const n = Number(m[2]);
    if (n === 0) return 'invalide';
    debut = Math.max(0, octets - n);
    fin = octets - 1;
  } else {
    debut = Number(m[1]);
    fin = m[2] === '' ? octets - 1 : Math.min(Number(m[2]), octets - 1);
  }
  if (!Number.isSafeInteger(debut) || !Number.isSafeInteger(fin) || debut > fin || debut >= octets) return 'invalide';
  return { debut, fin };
}

export async function lireParAdresse(services: Services, suffixe: string, entetePlage: string | undefined): Promise<LectureAdresse> {
  const forme = FORME.exec(suffixe);
  if (forme === null) return { statut: 404 };
  const [, usage, marqueId, utilisateurId, fichierId] = forme as unknown as [string, string, string, string, string];
  if (usage === 'publication' && !(await services.publications.fichierEnEnvoi(marqueId, utilisateurId, fichierId))) return { statut: 404 };
  const fichier = await services.montages.lireFichier(marqueId, utilisateurId, fichierId);
  if (fichier === undefined || fichier.purgeLe !== null || !MIMES_SERVIS.has(fichier.mime)) return { statut: 404 };
  const plage = lirePlage(entetePlage, fichier.octets);
  if (plage === 'invalide') return { statut: 416, octets: fichier.octets };
  const lecture = await services.stockage.ouvrir(marqueId, fichierId, plage);
  if (lecture === undefined || lecture.octets !== fichier.octets) {
    lecture?.flux.destroy();
    return { statut: 404 };
  }
  const debut = plage?.debut ?? 0;
  const fin = plage?.fin ?? fichier.octets - 1;
  return { statut: plage === undefined ? 200 : 206, mime: fichier.mime, octets: fichier.octets, debut, fin, flux: lecture.flux };
}
