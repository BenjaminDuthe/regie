import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { lireEnvironnement } from '../src/env.ts';
import { ErreurDemarrage, FICHIERS_SECRETS, demarrerBase } from '../src/infra/demarrage.ts';
import { Masqueur } from '../src/infra/masquage.ts';
import { calculerSante } from '../src/infra/sante.ts';

let dossier: string;
beforeEach(() => {
  dossier = mkdtempSync(join(tmpdir(), 'regie-secrets-'));
});
afterEach(() => {
  rmSync(dossier, { recursive: true, force: true });
});

/** Secrets de test tirés au hasard à chaque exécution : rien de fixe dans le dépôt. */
function poserSecrets(sauf: readonly string[] = []) {
  const valeurs = {
    cle: randomBytes(32).toString('hex'),
    coeur: randomBytes(18).toString('hex'),
    migrations: randomBytes(18).toString('hex'),
  };
  const ecrire = (nom: string, valeur: string) => {
    if (!sauf.includes(nom)) writeFileSync(join(dossier, nom), valeur);
  };
  ecrire(FICHIERS_SECRETS.cleMaitresse, valeurs.cle);
  ecrire(FICHIERS_SECRETS.baseCoeur, valeurs.coeur);
  ecrire(FICHIERS_SECRETS.baseMigrations, `${valeurs.migrations}\n`);
  return valeurs;
}

// Port 9 (discard) : rien n'y écoute, la connexion est refusée tout de suite.
const environnement = () => lireEnvironnement({ DOSSIER_SECRETS: dossier, BASE_HOTE: '127.0.0.1', BASE_PORT: '9' });

async function refus(masqueur = new Masqueur()): Promise<ErreurDemarrage> {
  const erreur = await demarrerBase(environnement(), { masqueur }).catch((e: unknown) => e);
  expect(erreur).toBeInstanceOf(ErreurDemarrage);
  return erreur as ErreurDemarrage;
}

describe('démarrage sûr', () => {
  it('refuse sans clé maîtresse, en nommant la cause', async () => {
    poserSecrets([FICHIERS_SECRETS.cleMaitresse]);
    const erreur = await refus();
    expect(erreur.etape).toBe('cle');
    expect(erreur.message).toMatch(/clé maîtresse absente/);
  });

  it('refuse une clé invalide sans écrire sa valeur ni celle des autres secrets', async () => {
    const valeurs = poserSecrets();
    const mauvaise = randomBytes(20).toString('hex');
    writeFileSync(join(dossier, FICHIERS_SECRETS.cleMaitresse), mauvaise);
    const erreur = await refus();
    expect(erreur.etape).toBe('cle');
    for (const secret of [mauvaise, valeurs.coeur, valeurs.migrations]) expect(erreur.message).not.toContain(secret);
  });

  it('refuse un mot de passe de base absent ou vide, en nommant le fichier', async () => {
    poserSecrets([FICHIERS_SECRETS.baseCoeur]);
    let erreur = await refus();
    expect(erreur.etape).toBe('secrets');
    expect(erreur.message).toContain(FICHIERS_SECRETS.baseCoeur);
    writeFileSync(join(dossier, FICHIERS_SECRETS.baseCoeur), '\n');
    erreur = await refus();
    expect(erreur.message).toMatch(/vide/);
  });

  it('refuse une base injoignable sans écrire aucun secret, et inscrit les secrets au masqueur', async () => {
    const valeurs = poserSecrets();
    const masqueur = new Masqueur();
    const erreur = await refus(masqueur);
    expect(erreur.etape).toBe('base');
    expect(erreur.message).toMatch(/base injoignable/);
    for (const secret of Object.values(valeurs)) expect(erreur.message).not.toContain(secret);
    expect(masqueur.masquerTexte(`x ${valeurs.cle} ${valeurs.coeur} ${valeurs.migrations}`)).not.toMatch(/[0-9a-f]{18}/);
  });

  it('l’environnement refuse un nom de base ou de rôle qui n’est pas un identifiant simple', () => {
    expect(() => lireEnvironnement({ BASE_NOM: 'regie; DROP TABLE x' })).toThrow(/BASE_NOM/);
    expect(() => lireEnvironnement({ BASE_PORT: '0' })).toThrow(/BASE_PORT/);
  });
});

describe('/sante sans contexte', () => {
  it('annonce la base et le coffre indisponibles, sans détail', async () => {
    const sante = await calculerSante(undefined, '/');
    expect(sante.etat).toBe('degrade');
    expect(sante.base).toBe('indisponible');
    expect(sante.coffre).toBe('indisponible');
    expect(Object.keys(sante).sort()).toEqual(['base', 'coffre', 'disque', 'etat']);
  });
});
