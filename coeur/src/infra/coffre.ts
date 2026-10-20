// regie — coffre : clé maîtresse, sous-clés HKDF, chiffrement AES-256-GCM versionné (AD-9, AR-11).
// Aucun message d'erreur ne contient la clé ni un secret : on nomme la cause, jamais la valeur (NFR-15).

import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';

export class ErreurCoffre extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ErreurCoffre';
  }
}

const LONGUEUR_CLE = 32;
const LONGUEUR_IV = 12;
const LONGUEUR_ETIQUETTE = 16;
/** Premier octet de tout chiffré : permet de changer de format sans perdre les anciens secrets. */
export const VERSION_FORMAT = 1;

export type SousCle = 'coffre' | 'hmac-adresses' | 'liens';

/** Contexte lié au chiffré (AAD) : un chiffré déplacé vers un autre secret, une autre marque ou un autre type ne se déchiffre plus. */
export type ContexteSecret = Readonly<{ secretId: string; marqueId: string; type: string }>;

/** Lit la clé maîtresse : 64 caractères hexadécimaux (32 octets) dans un fichier, typiquement un secret Podman. */
export function lireCleMaitresse(chemin: string): Buffer {
  let contenu: string;
  try {
    contenu = readFileSync(chemin, 'utf8');
  } catch (erreur) {
    const code = (erreur as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') throw new ErreurCoffre(`clé maîtresse absente (fichier ${chemin} introuvable)`);
    throw new ErreurCoffre(`clé maîtresse illisible (fichier ${chemin}, erreur ${code ?? 'inconnue'})`);
  }
  const texte = contenu.trim();
  if (!/^[0-9a-fA-F]{64}$/.test(texte)) {
    throw new ErreurCoffre(`clé maîtresse invalide (fichier ${chemin}) : 64 caractères hexadécimaux attendus`);
  }
  const cle = Buffer.from(texte, 'hex');
  if (cle.every((octet) => octet === cle[0])) {
    throw new ErreurCoffre(`clé maîtresse invalide (fichier ${chemin}) : clé constante, sans aléa`);
  }
  return cle;
}

/** Sous-clé de 32 octets dérivée de la clé maîtresse par HKDF-SHA-256, une par usage. */
export function deriverSousCle(cleMaitresse: Buffer, nom: SousCle): Buffer {
  return Buffer.from(hkdfSync('sha256', cleMaitresse, Buffer.alloc(0), `regie:${nom}:v1`, LONGUEUR_CLE));
}

/** AAD sans ambiguïté : chaque partie est précédée de sa longueur (secret_id ‖ espace_id ‖ type). */
function donneesAssociees(contexte: ContexteSecret): Buffer {
  const parties = [contexte.secretId, contexte.marqueId, contexte.type].map((partie) => Buffer.from(partie, 'utf8'));
  return Buffer.concat(
    parties.flatMap((partie) => {
      const longueur = Buffer.alloc(4);
      longueur.writeUInt32BE(partie.length);
      return [longueur, partie];
    }),
  );
}

export class Coffre {
  readonly #cle: Buffer;

  constructor(cleMaitresse: Buffer) {
    this.#cle = deriverSousCle(cleMaitresse, 'coffre');
  }

  /** Format : version (1 octet) ‖ iv (12) ‖ étiquette GCM (16) ‖ chiffré. */
  chiffrer(clair: string | Buffer, contexte: ContexteSecret): Buffer {
    const iv = randomBytes(LONGUEUR_IV);
    const chiffreur = createCipheriv('aes-256-gcm', this.#cle, iv, { authTagLength: LONGUEUR_ETIQUETTE });
    chiffreur.setAAD(donneesAssociees(contexte));
    const chiffre = Buffer.concat([chiffreur.update(clair), chiffreur.final()]);
    return Buffer.concat([Buffer.from([VERSION_FORMAT]), iv, chiffreur.getAuthTag(), chiffre]);
  }

  dechiffrer(blob: Buffer, contexte: ContexteSecret): Buffer {
    const entete = 1 + LONGUEUR_IV + LONGUEUR_ETIQUETTE;
    if (blob.length < entete) throw new ErreurCoffre('secret chiffré tronqué');
    if (blob[0] !== VERSION_FORMAT) throw new ErreurCoffre(`format de secret chiffré inconnu (version ${blob[0]})`);
    const iv = blob.subarray(1, 1 + LONGUEUR_IV);
    const etiquette = blob.subarray(1 + LONGUEUR_IV, entete);
    const dechiffreur = createDecipheriv('aes-256-gcm', this.#cle, iv, { authTagLength: LONGUEUR_ETIQUETTE });
    dechiffreur.setAAD(donneesAssociees(contexte));
    dechiffreur.setAuthTag(etiquette);
    try {
      return Buffer.concat([dechiffreur.update(blob.subarray(entete)), dechiffreur.final()]);
    } catch {
      throw new ErreurCoffre('déchiffrement impossible : clé maîtresse ou contexte (secret, marque, type) incorrect');
    }
  }
}

/** Contexte du témoin : un chiffré connu qui prouve, au démarrage, que la clé est celle du coffre. */
export const CONTEXTE_TEMOIN: ContexteSecret = Object.freeze({
  secretId: 'temoin',
  marqueId: 'coffre',
  type: 'temoin',
});
const CLAIR_TEMOIN = 'regie-coffre-temoin';

export function creerTemoin(coffre: Coffre): Buffer {
  return coffre.chiffrer(CLAIR_TEMOIN, CONTEXTE_TEMOIN);
}

export function verifierTemoin(coffre: Coffre, temoin: Buffer): void {
  let clair: string;
  try {
    clair = coffre.dechiffrer(temoin, CONTEXTE_TEMOIN).toString('utf8');
  } catch {
    throw new ErreurCoffre('la clé maîtresse ne correspond pas à celle qui a chiffré le coffre');
  }
  if (clair !== CLAIR_TEMOIN) throw new ErreurCoffre('le témoin du coffre est altéré');
}

/** Rechiffre un secret de l'ancien coffre vers le nouveau, sans le laisser hors mémoire. */
export function rechiffrer(blob: Buffer, contexte: ContexteSecret, ancien: Coffre, nouveau: Coffre): Buffer {
  return nouveau.chiffrer(ancien.dechiffrer(blob, contexte), contexte);
}
