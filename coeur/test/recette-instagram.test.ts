// Histoire 9.3 : la recette sur le compte Instagram de test, jouée par machine contre le faux Meta (127.0.0.1) et jamais contre
// Meta. Elle déroule les trois cas de docs/planning/recette-instagram.md : départ seul et une seule fois avec le lien rendu,
// échec visible avec sa cause puis rejeu après correction, redémarrage avec une publication programmée sans doublon. Le
// déroulé contre le vrai compte de test reste à jouer par Benjamin (ARBITRAGES 9.3).
import { createHash, randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { EntreeJournalMontage } from '@regie/contrats';
import { decider } from '../src/services/planificateur.ts';
import { ConnecteurInstagram } from '../src/publication/connecteur-instagram.ts';
import { gestionnairePublication } from '../src/publication/echeance.ts';
import { executantReseau } from '../src/publication/executant-reseau.ts';
import { construireServeur } from '../src/serveur.ts';
import { creerMontageDuJeu } from '../src/services/film-jeu.ts';
import type { TravailInterne } from '../src/infra/echeances.ts';
import { creerServicesDeTest, type BancDeTest } from './faux-auth.ts';
import { demarrerFauxMeta, type FauxMeta } from './faux-reseaux.ts';

const WEBM = Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), Buffer.from('film-factice')]);
const journal: EntreeJournalMontage[] = [
  { t: 0, genre: 'film_debut' },
  { t: 100, genre: 'narration', cible: 'Bienvenue sur la page.' },
  { t: 2000, genre: 'clic', x: 800, y: 200 },
  { t: 7000, genre: 'film_fin' },
];
const MAINTENANT = Date.parse('2026-10-21T10:00:00Z'); // 12:00 à Paris
const JETON_META = 'jeton-long-instagram';

describe('recette Instagram (faux Meta)', () => {
  let meta: FauxMeta;
  let banc: BancDeTest;
  let app: Awaited<ReturnType<typeof construireServeur>>;
  let marqueId: string;
  let utilisateurId: string;
  let espaceId: string;
  let jeton: string;
  let compteId: string;
  let montageId: string;
  const cheminMedia = () => `/v23.0/${meta.reglages.compteExterne}/media`;
  const cheminPublier = () => `${cheminMedia()}_publish`;
  const appeler = (corps: unknown, chemin: string) =>
    app.inject({ method: 'POST', url: `/api/v1/${chemin}`, headers: { authorization: `Bearer ${jeton}`, 'content-type': 'application/json' }, payload: JSON.stringify(corps) });
  const lire = async (id: string) => (await appeler({ id }, 'publication/lire')).json().donnees;
  const envois = () => meta.requetes.filter((r) => r.chemin === cheminPublier()).length;
  const aide = { signal: new AbortController().signal, pointDeNonRetour: async () => undefined };
  const lancer = async (tacheId: string) => executantReseau(banc.services, { attenteLiaisonMs: 1 }).executer(banc.file.taches.find((t) => t.id === tacheId)!, aide);

  /** Une passe du planificateur : on recrée le gestionnaire à chaque passe, comme après un redémarrage de regie. */
  async function passer(maintenant: number) {
    banc.horloge.t = maintenant;
    const gestionnaire = gestionnairePublication(banc.services).publication!;
    for (const e of banc.publications.echeances.filter((x) => x.etat === 'programmee' && x.instant.getTime() <= maintenant)) {
      if (decider(e, new Date(maintenant)) === 'echouer') {
        e.etat = 'echouee';
        continue;
      }
      e.etat = 'declenchee';
      const travail: TravailInterne = { id: randomUUID(), marqueId, echeanceId: randomUUID(), type: e.type, objet: e.objet, etat: 'en_cours', tentatives: 1, cause: undefined };
      await gestionnaire(travail);
    }
  }

  async function nouvelleDemo() {
    const film = { octets: WEBM, sha256: createHash('sha256').update(WEBM).digest('hex') };
    const r = await creerMontageDuJeu({ montages: banc.montages, stockage: banc.stockage, gabarits: banc.gabarits, file: banc.file }, { marqueId, utilisateurId }, { id: randomUUID(), espaceId, nom: 'Démo' }, film, WEBM.length, journal, 7000);
    if (!('montageId' in r)) throw new Error(`montage refusé : ${r.refus}`);
    const fichierId = randomUUID();
    banc.montages.fichiers.push({ id: fichierId, espaceId, genre: 'rendu', mime: 'video/mp4', octets: 5, sha256: 'a'.repeat(64), dureeMs: 7000, montageId: r.montageId, sceneId: null, creeLe: new Date(), purgeLe: null });
    await banc.stockage.ecrire(marqueId, fichierId, Buffer.from('rendu'));
    banc.montages.rendus.push({ id: randomUUID(), espaceId, montageId: r.montageId, genre: 'complet', etat: 'pret', tacheId: null, fichierId, violations: [], cause: null, creeLe: new Date(), termineLe: null });
    return r.montageId;
  }

  beforeAll(async () => {
    if (!existsSync(fileURLToPath(new URL('../dist/server/entry.mjs', import.meta.url)))) throw new Error('coeur/dist absent : lance `npm run build` avant les tests.');
    meta = await demarrerFauxMeta();
    banc = creerServicesDeTest(undefined, { urlPublique: 'http://127.0.0.1:4321', connecteurs: { instagram: new ConnecteurInstagram({ adresses: meta.adresses, pauseMs: 0, delaiMs: 2000 }) } });
    marqueId = await banc.marques.creer();
    const a = await banc.espaces.assurer(marqueId, 'sub-recette', undefined, 'Établia');
    utilisateurId = a.utilisateurId;
    espaceId = a.espaces[0]!.id;
    jeton = (await banc.jetons.creer({ marqueId, utilisateurId, sub: 'sub-recette', nom: 't', portees: ['lecture', 'ecriture'], espaceIds: [espaceId], dureeJours: 30 })).clair;
    const compte = await banc.comptesReseau.connecter({ marqueId, utilisateurId, espaceId, reseau: 'instagram', compteExterne: meta.reglages.compteExterne, nom: 'compte_de_test', jeton: JETON_META, expireLe: new Date(MAINTENANT + 50 * 86_400_000) }, new Date(MAINTENANT));
    compteId = compte!.id;
    app = await construireServeur({ services: banc.services });
    await app.ready();
  });
  afterAll(async () => {
    await app?.close();
    await meta?.fermer();
  });
  beforeEach(async () => {
    banc.horloge.t = MAINTENANT;
    for (const l of [banc.publications.lignes, banc.publications.historique, banc.publications.echeances, banc.file.taches, banc.notifications.lignes, banc.audit.lignes, meta.requetes]) l.length = 0;
    banc.montages.publiees.clear();
    meta.reglages.couper.clear();
    for (const k of Object.keys(meta.reglages.statutsForces)) delete meta.reglages.statutsForces[k];
    meta.reglages.quota = { utilise: 3, total: 100 };
    meta.reglages.etatsTraitement = ['FINISHED'];
    montageId = await nouvelleDemo();
  });

  it('cas 1 : une démo programmée arrive à échéance, part seule, une seule fois, publiée avec son lien', async () => {
    const p = (await appeler({ montageId, compteId, quand: '2026-10-21T14:30' }, 'publication/programmer')).json().donnees.publication;
    await passer(Date.parse('2026-10-21T12:29:00Z'));
    expect(envois()).toBe(0); // rien ne part avant l'heure
    await passer(Date.parse('2026-10-21T12:30:30Z'));
    const tache = banc.file.taches.filter((t) => t.type === 'reseau');
    expect(tache).toHaveLength(1);
    await lancer(tache[0]!.id);
    await passer(Date.parse('2026-10-21T12:31:30Z')); // les passes suivantes ne refont rien
    expect(envois()).toBe(1);
    expect((await lire(p.id)).publication).toMatchObject({ etat: 'publiee', lien: 'https://www.instagram.com/reel/ABC123/' });
    expect(banc.notifications.lignes.map((n) => n.genre)).toEqual(['publication_publiee']);
  });

  it('cas 2 : un échec est visible avec sa cause, rien n’est publié, et « rejouer » relance après correction', async () => {
    meta.reglages.statutsForces[cheminMedia()] = 400; // Meta refuse la création du conteneur
    const p = (await appeler({ montageId, compteId }, 'publication/publier')).json().donnees.publication;
    await lancer(p.tacheId);
    const echec = (await lire(p.id)).publication;
    expect(echec).toMatchObject({ etat: 'en_echec', action: 'rejouer' });
    expect(echec.cause).toMatch(/^[A-Z_]+$/);
    expect(envois()).toBe(0);
    expect(banc.notifications.lignes.map((n) => n.genre)).toEqual(['publication_echec']);
    expect(JSON.stringify([banc.notifications.lignes, banc.audit.lignes, echec])).not.toContain(JETON_META);

    delete meta.reglages.statutsForces[cheminMedia()]; // le compte est reconnecté, le jeton est bon
    const rejeu = (await appeler({ id: p.id }, 'publication/rejouer')).json().donnees.publication;
    await lancer(rejeu.tacheId);
    expect((await lire(p.id)).publication).toMatchObject({ etat: 'publiee', tentatives: 2 });
    expect(envois()).toBe(1);
  });

  it('cas 3 : regie redémarre avant l’heure dite ou pendant la publication, la publication part sans doublon', async () => {
    const p = (await appeler({ montageId, compteId, quand: '2026-10-21T14:30' }, 'publication/programmer')).json().donnees.publication;
    // regie est arrêtée de 14 h 25 à 14 h 40 (heure de Paris) : aucune passe. Elle redémarre, le planificateur rattrape.
    await passer(Date.parse('2026-10-21T12:40:00Z'));
    const tache = banc.file.taches.filter((t) => t.type === 'reseau');
    expect(tache).toHaveLength(1);
    // Nouvel arrêt au milieu de l'envoi : la tâche est reprise et le gestionnaire rejoué, sans second envoi.
    await lancer(tache[0]!.id);
    await passer(Date.parse('2026-10-21T12:41:00Z'));
    const travail: TravailInterne = { id: randomUUID(), marqueId, echeanceId: randomUUID(), type: 'publication', objet: banc.publications.echeances[0]!.objet, etat: 'en_cours', tentatives: 2, cause: undefined };
    await gestionnairePublication(banc.services).publication!(travail);
    await lancer(tache[0]!.id);
    expect(envois()).toBe(1);
    expect(banc.file.taches.filter((t) => t.type === 'reseau')).toHaveLength(1);
    expect((await lire(p.id)).publication.etat).toBe('publiee');
  });
});
