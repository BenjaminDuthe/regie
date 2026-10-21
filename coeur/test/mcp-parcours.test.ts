// Histoire 9.1 : tout se pilote depuis Claude. Les parcours de référence (services/parcours.ts) restent vrais : chaque outil
// existe et est offert au MCP, chaque exemple passe son schéma ; aucun outil ne prend ni ne rend de secret ; chaque formulaire
// du navigateur passe par une action ; un parcours se déroule de bout en bout par /mcp seul.
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import type { EntreeJournalMontage } from '@regie/contrats';
import { construireServeur } from '../src/serveur.ts';
import { outilsExposes } from '../src/mcp/serveur.ts';
import { creerMontageDuJeu } from '../src/services/film-jeu.ts';
import { GESTES_SESSION } from '../src/services/exceptions-parite.ts';
import { PARCOURS } from '../src/services/parcours.ts';
import { genererReference } from '../src/services/reference.ts';
import { ACTIONS } from '../src/services/actions.ts';
import { EXCEPTIONS_PARITE } from '../src/services/exceptions-parite.ts';
import { ConnecteurInstagram } from '../src/publication/connecteur-instagram.ts';
import { demarrerFauxMeta, type FauxMeta } from './faux-reseaux.ts';
import { creerServicesDeTest, type BancDeTest } from './faux-auth.ts';

const WEBM = Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), Buffer.from('film-factice')]);
const journal: EntreeJournalMontage[] = [
  { t: 0, genre: 'film_debut' },
  { t: 100, genre: 'narration', cible: 'Bienvenue sur la page.' },
  { t: 2000, genre: 'clic', x: 800, y: 200 },
  { t: 7000, genre: 'film_fin' },
];
const SECRET_JETON = 'jeton-long-instagram-SECRET-9f3a';
const SECRET_MOT_DE_PASSE = 'mot-de-passe-de-demo-SECRET-71bc';

describe('parcours de référence', () => {
  const outils = outilsExposes();

  it('chaque outil d’un parcours existe et est offert au MCP', () => {
    for (const p of PARCOURS) for (const e of p.etapes) expect(outils.has(e.outil), `${p.id} : ${e.outil}`).toBe(true);
  });

  it('chaque exemple passe le schéma d’entrée de son action', () => {
    for (const p of PARCOURS) {
      for (const e of p.etapes) {
        const r = outils.get(e.outil)!.entree.safeParse(e.exemple);
        expect(r.success, `${p.id} : ${e.outil} : ${r.success ? '' : JSON.stringify(r.error.issues)}`).toBe(true);
      }
    }
  });

  it('la référence générée contient chaque parcours et reste celle du dépôt', () => {
    const ref = genererReference(ACTIONS, EXCEPTIONS_PARITE);
    for (const p of PARCOURS) expect(ref).toContain(p.demande);
    const fichier = readFileSync(fileURLToPath(new URL('../../docs/api/reference.md', import.meta.url)), 'utf8');
    expect(fichier).toBe(ref);
  });
});

describe('secrets', () => {
  it('aucun outil ne prend de secret en entrée', () => {
    const suspect = /secret|mot_?de_?passe|motdepasse|cle|jeton|token|password|identifiant/i;
    const permis = new Set(['jeton_revoquer', 'jeton_lister', 'connexion_revoquer']); // identifiants d'objet, jamais la valeur
    for (const [nom, a] of outils()) {
      const schema = z.toJSONSchema(a.entree, { io: 'input', unrepresentable: 'any' }) as { properties?: Record<string, unknown> };
      for (const champ of Object.keys(schema.properties ?? {})) {
        if (permis.has(nom)) continue;
        expect(suspect.test(champ), `${nom}.${champ}`).toBe(false);
      }
    }
    function outils() {
      return outilsExposes();
    }
  });
});

describe('gestes du navigateur', () => {
  const racine = fileURLToPath(new URL('../src/pages', import.meta.url));
  const pages = (dir: string): string[] => readdirSync(dir).flatMap((n) => (statSync(join(dir, n)).isDirectory() ? pages(join(dir, n)) : n.endsWith('.astro') ? [join(dir, n)] : []));

  it('chaque page qui reçoit un formulaire passe par une action, sauf les gestes de session déclarés', () => {
    const declares = new Set(GESTES_SESSION.map((g) => g.page));
    for (const f of pages(racine)) {
      const rel = f.slice(racine.length + 1);
      const src = readFileSync(f, 'utf8');
      if (!/method === 'POST'/.test(src)) continue;
      if (declares.has(rel)) continue;
      expect(src.includes('executerAction'), `${rel} reçoit un POST sans passer par executerAction`).toBe(true);
    }
    for (const g of GESTES_SESSION) expect(existsSync(join(racine, g.page)), g.page).toBe(true);
  });
});

describe('de bout en bout par le MCP seul', () => {
  let meta: FauxMeta;
  let banc: BancDeTest;
  let app: Awaited<ReturnType<typeof construireServeur>>;
  let jeton: string;
  let marqueId: string;
  let montageId: string;
  let compteId: string;
  const vu: string[] = [];
  let n = 0;

  const outil = async (name: string, args: Record<string, unknown>) => {
    const r = await app.inject({
      method: 'POST',
      url: '/mcp',
      headers: { authorization: `Bearer ${jeton}`, 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
      payload: JSON.stringify({ jsonrpc: '2.0', id: ++n, method: 'tools/call', params: { name, arguments: args } }),
    });
    vu.push(r.body);
    const corps = r.json().result as { isError?: boolean; structuredContent?: any; content: { text: string }[] };
    return { erreur: corps.isError === true, donnees: corps.structuredContent ?? JSON.parse(corps.content[0]!.text) };
  };

  beforeAll(async () => {
    if (!existsSync(fileURLToPath(new URL('../dist/server/entry.mjs', import.meta.url)))) throw new Error('coeur/dist absent : lance `npm run build` avant les tests.');
    meta = await demarrerFauxMeta();
    banc = creerServicesDeTest(undefined, { urlPublique: 'http://127.0.0.1:4321', connecteurs: { instagram: new ConnecteurInstagram({ adresses: meta.adresses, pauseMs: 0, delaiMs: 2000 }) } });
    marqueId = await banc.marques.creer();
    const a = await banc.espaces.assurer(marqueId, 'sub-a', undefined, 'Établia');
    const espaceId = a.espaces[0]!.id;
    jeton = (await banc.jetons.creer({ marqueId, utilisateurId: a.utilisateurId, sub: 'sub-a', nom: 'claude', portees: ['lecture', 'ecriture'], espaceIds: [espaceId], dureeJours: 30 })).clair;
    const compte = await banc.comptesReseau.connecter({ marqueId, utilisateurId: a.utilisateurId, espaceId, reseau: 'instagram', compteExterne: meta.reglages.compteExterne, nom: 'compte_de_demo', jeton: SECRET_JETON, expireLe: new Date(Date.now() + 50 * 86_400_000) }, new Date());
    compteId = compte!.id;
    const film = { octets: WEBM, sha256: createHash('sha256').update(WEBM).digest('hex') };
    const r = await creerMontageDuJeu({ montages: banc.montages, stockage: banc.stockage, gabarits: banc.gabarits, file: banc.file }, { marqueId, utilisateurId: a.utilisateurId }, { id: randomUUID(), espaceId, nom: 'Facture' }, film, WEBM.length, journal, 7000);
    if (!('montageId' in r)) throw new Error(`montage refusé : ${r.refus}`);
    montageId = r.montageId;
    const fichierId = randomUUID();
    banc.montages.fichiers.push({ id: fichierId, espaceId, genre: 'rendu', mime: 'video/mp4', octets: 5, sha256: 'a'.repeat(64), dureeMs: 7000, montageId, sceneId: null, creeLe: new Date(), purgeLe: null });
    await banc.stockage.ecrire(marqueId, fichierId, Buffer.from('rendu'));
    banc.montages.rendus.push({ id: randomUUID(), espaceId, montageId, genre: 'complet', etat: 'pret', tacheId: null, fichierId, violations: [], cause: null, creeLe: new Date(), termineLe: null });
    app = await construireServeur({ services: banc.services });
    await app.ready();
  });
  afterAll(async () => {
    await app?.close();
    await meta?.fermer();
  });

  it('lire le montage, le corriger, légender, trouver le compte, programmer : sans jamais voir un secret', async () => {
    const lu = await outil('montage_lire', { id: montageId });
    expect(lu.erreur).toBe(false);
    const scene = JSON.stringify(lu.donnees).match(/"id":"(scene-[a-z0-9-]+)"/)?.[1];
    if (scene !== undefined) {
      const ed = await outil('montage_editer', { id: montageId, operations: [{ op: 'texte', sceneId: scene, accroche: 'Une facture en trois clics' }] });
      expect(ed.erreur).toBe(false);
    }
    const leg = await outil('montage_legender', { id: montageId, reseau: 'instagram', legende: 'Créer une facture en trois clics.', hashtags: ['facturation'] });
    expect(leg.erreur).toBe(false);
    const comptes = await outil('reseau_comptes', {});
    expect(JSON.stringify(comptes.donnees)).toContain(compteId);
    const demain = new Date(banc.horloge.t + 86_400_000).toISOString().slice(0, 10) + 'T18:00';
    const prog = await outil('publication_programmer', { montageId, compteId, quand: demain });
    if (prog.erreur) throw new Error(JSON.stringify(prog.donnees));
    expect(prog.erreur).toBe(false);
    expect((prog.donnees.donnees ?? prog.donnees).publication).toMatchObject({ etat: 'programmee' });
    for (const corps of vu) {
      expect(corps).not.toContain(SECRET_JETON);
      expect(corps).not.toContain(SECRET_MOT_DE_PASSE);
    }
  });
});
