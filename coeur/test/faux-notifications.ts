// Double de test des notifications (histoire 2.6) : mêmes règles que la table `notifications` (clé unique, filtre par personne).

import type { Notification, NouvelleNotification, Notifications } from '../src/infra/notifications.ts';
import type { Tache } from '../src/infra/file.ts';

export class NotificationsMemoire implements Notifications {
  readonly lignes: { -readonly [K in keyof Notification]: Notification[K] }[] = [];
  readonly #cles = new Set<string>();
  maintenant: () => number = Date.now;

  async creer(marqueId: string, n: NouvelleNotification): Promise<boolean> {
    const cle = `${marqueId}:${n.cle}`;
    if (this.#cles.has(cle)) return false;
    this.#cles.add(cle);
    this.lignes.push({
      id: crypto.randomUUID(), marqueId, utilisateurId: n.utilisateurId, genre: n.genre, etape: n.etape, tacheId: n.tacheId,
      cause: n.cause, action: n.action, creeLe: new Date(this.maintenant()), acquitteeLe: undefined,
    });
    return true;
  }

  async lister(marqueId: string, utilisateurId: string, limite: number): Promise<Notification[]> {
    return this.lignes
      .filter((l) => l.marqueId === marqueId && l.utilisateurId === utilisateurId)
      .sort((a, b) => b.creeLe.getTime() - a.creeLe.getTime())
      .slice(0, limite)
      .map((l) => ({ ...l }));
  }

  async acquitter(marqueId: string, utilisateurId: string, id: string): Promise<boolean> {
    const l = this.lignes.find((x) => x.id === id && x.marqueId === marqueId && x.utilisateurId === utilisateurId && x.acquitteeLe === undefined);
    if (l === undefined) return false;
    l.acquitteeLe = new Date(this.maintenant());
    return true;
  }

  /** Ce que fait le déclencheur SQL d'échec de tâche. */
  surEchec = (t: Tache): void => {
    void this.creer(t.marqueId, {
      utilisateurId: t.utilisateurId, genre: 'etape_echouee', etape: t.type, tacheId: t.id, cause: t.cause, action: t.action,
      cle: `echec:${t.id}:${t.tentatives}`,
    });
  };
}
