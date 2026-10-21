import { randomBytes } from 'node:crypto';
import { Writable } from 'node:stream';
import { pino } from 'pino';
import { describe, expect, it } from 'vitest';
import { MASQUE, Masqueur } from '../src/infra/masquage.ts';

function journalDe(masqueur: Masqueur) {
  const lignes: string[] = [];
  const sortie = new Writable({
    write(morceau, _encodage, suite) {
      lignes.push(String(morceau));
      suite();
    },
  });
  return { journal: pino(masqueur.optionsPino, sortie), lignes };
}

describe('masquage des journaux', () => {
  it('masque la valeur d’un secret connu dans le message, un objet et une erreur', () => {
    const masqueur = new Masqueur();
    const secret = randomBytes(18).toString('hex');
    masqueur.ajouter(secret);
    const { journal, lignes } = journalDe(masqueur);
    journal.info(`connexion avec ${secret}`);
    journal.info({ detail: { url: `https://exemple.test/?x=${secret}` }, liste: [secret] }, 'objet');
    journal.error(new Error(`échec pour ${secret}`));
    const tout = lignes.join('');
    expect(tout).not.toContain(secret);
    expect(tout).toContain(MASQUE);
  });

  it('masque par nom de clé, quelle que soit la valeur', () => {
    const { journal, lignes } = journalDe(new Masqueur());
    const valeur = randomBytes(5).toString('hex');
    journal.info({ motDePasse: valeur, access_token: valeur, client_secret: valeur, Authorization: valeur, utile: 'visible' }, 'x');
    const ligne = lignes.join('');
    expect(ligne).not.toContain(valeur);
    expect(ligne).toContain('visible');
  });

  it('masque les motifs access_token=, Bearer et client_secret dans une chaîne', () => {
    const { journal, lignes } = journalDe(new Masqueur());
    const jeton = randomBytes(16).toString('hex');
    journal.info(`GET /cb?access_token=${jeton}&state=ok client_secret=${jeton} Authorization: Bearer ${jeton}`);
    const ligne = lignes.join('');
    expect(ligne).not.toContain(jeton);
    expect(ligne).toContain('state=ok');
  });

  it('cesse de masquer un secret retiré et ignore les valeurs trop courtes', () => {
    const masqueur = new Masqueur();
    const secret = randomBytes(12).toString('hex');
    masqueur.ajouter(secret);
    masqueur.ajouter('abc');
    expect(masqueur.masquerTexte(`abc ${secret}`)).toBe(`abc ${MASQUE}`);
    masqueur.retirer(secret);
    expect(masqueur.masquerTexte(secret)).toBe(secret);
  });

  it('survit à un objet circulaire', () => {
    const circulaire: Record<string, unknown> = { nom: 'a' };
    circulaire['moi'] = circulaire;
    expect(JSON.stringify(new Masqueur().masquer(circulaire))).toContain('circulaire');
    const { journal, lignes } = journalDe(new Masqueur());
    journal.info(circulaire, 'x');
    expect(lignes.join('')).toContain('"nom":"a"');
  });
});
