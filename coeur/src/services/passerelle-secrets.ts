// regie — passerelle de lecture des secrets (histoire 4.3, AR-11, AD-9). Un service technique ne lit pas le coffre
// à sa guise : il lit UN secret, pour UNE tâche qu'il exécute, si la matrice (type de tâche, type de secret) le permet
// et si son bail est encore valide. Aujourd'hui la passerelle est appelée dans le processus du cœur par les
// exécutants ; la route `POST /interne/secrets/lire` des services séparés reprendra cette même vérification.

import type { Pool } from 'pg';
import type { Coffre } from '../infra/coffre.ts';
import { lireSecretParNom } from '../infra/base.ts';
import type { File, Tache } from '../infra/file.ts';
import { TYPE_SECRET_COMPTE_DEMO } from '../infra/comptes-demo.ts';

/** Qui peut lire quoi : type de tâche → types de secret. Tout ce qui n'y figure pas est refusé. */
export const MATRICE_SECRETS: Readonly<Record<string, readonly string[]>> = Object.freeze({
  test_connexion: [TYPE_SECRET_COMPTE_DEMO],
});

export class SecretRefuse extends Error {
  readonly raison: 'MATRICE' | 'TACHE_NON_EN_COURS' | 'BAIL';
  constructor(raison: SecretRefuse['raison']) {
    super(`lecture de secret refusée (${raison})`);
    this.name = 'SecretRefuse';
    this.raison = raison;
  }
}

export interface PasserelleSecrets {
  /** Lit le secret `(type, nom)` de la marque de la tâche ; `undefined` s'il n'existe pas. Lève `SecretRefuse` sinon. */
  lire(tache: Pick<Tache, 'id' | 'marqueId' | 'utilisateurId' | 'type'>, typeSecret: string, nom: string): Promise<string | undefined>;
}

export type LecteurSecrets = (marqueId: string, type: string, nom: string) => Promise<string | undefined>;

export class PasserelleSecretsCoffre implements PasserelleSecrets {
  readonly #file: File;
  readonly #service: string;
  readonly #lecteur: LecteurSecrets;
  readonly #maintenant: () => number;

  /** `service` : l'identité sous laquelle ce processus prend ses tâches (`verrouPar`). */
  constructor(options: { file: File; service: string; lecteur: LecteurSecrets; maintenant?: () => number }) {
    this.#file = options.file;
    this.#service = options.service;
    this.#lecteur = options.lecteur;
    this.#maintenant = options.maintenant ?? Date.now;
  }

  async lire(tache: Pick<Tache, 'id' | 'marqueId' | 'utilisateurId' | 'type'>, typeSecret: string, nom: string): Promise<string | undefined> {
    if (!(MATRICE_SECRETS[tache.type] ?? []).includes(typeSecret)) throw new SecretRefuse('MATRICE');
    // On relit la tâche à chaque lecture : un instantané périmé ne vaut pas bail.
    const courante = await this.#file.lire(tache.marqueId, tache.utilisateurId, tache.id);
    if (courante === undefined || courante.type !== tache.type || courante.etat !== 'en_cours' || courante.verrouPar !== this.#service) throw new SecretRefuse('TACHE_NON_EN_COURS');
    if (courante.bailJusqua === undefined || courante.bailJusqua.getTime() <= this.#maintenant()) throw new SecretRefuse('BAIL');
    return this.#lecteur(tache.marqueId, typeSecret, nom);
  }
}

export const lecteurCoffre = (pool: Pool, coffre: Coffre): LecteurSecrets => (marqueId, type, nom) => lireSecretParNom(pool, coffre, marqueId, type, nom);
