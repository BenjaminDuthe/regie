-- regie — bibliothèque de vidéos : archiver et supprimer (histoire 3.9, FR-45, AR-12).
-- ARCHIVER pose `archivee_le` sur toutes les versions d'une vidéo (série) : la vidéo sort de la liste par défaut, rien
-- n'est effacé. SUPPRIMER efface la vidéo entière (rendus, légendes, voix, montages, puis films et rendus) dans UNE
-- transaction, après quoi les octets sont effacés du disque ; la suppression s'inscrit dans `suppressions`, que la
-- restauration rejouera pour qu'aucune donnée supprimée ne revienne (AR-24). Une version ne se modifie toujours pas :
-- seul le drapeau d'archivage bouge, et DELETE n'est accordé que pour supprimer une vidéo en entier (le code ne
-- supprime jamais une version seule). Cloisonné par marque (RLS forcée). Exécutée par regie_migrations.

ALTER TABLE montages ADD COLUMN archivee_le timestamptz;

GRANT UPDATE (archivee_le) ON montages TO regie_coeur;
GRANT DELETE ON montages TO regie_coeur;
GRANT DELETE ON rendus TO regie_coeur;
GRANT DELETE ON fichiers TO regie_coeur;
GRANT DELETE ON legendes TO regie_coeur;

-- Une ligne par suppression : des identifiants opaques, jamais de contenu. `objet_id` est l'identifiant de la vidéo
-- (sa série) ; `fichiers` compte les fichiers retirés de la base (donc à effacer du disque).
CREATE TABLE suppressions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  marque_id uuid NOT NULL REFERENCES marques (id),
  utilisateur_id uuid NOT NULL,
  genre text NOT NULL CHECK (genre IN ('video')),
  objet_id uuid NOT NULL,
  fichiers integer NOT NULL CHECK (fichiers >= 0),
  supprimee_le timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX suppressions_marque ON suppressions (marque_id, supprimee_le);

ALTER TABLE suppressions ENABLE ROW LEVEL SECURITY;
ALTER TABLE suppressions FORCE ROW LEVEL SECURITY;

CREATE POLICY suppressions_de_la_marque ON suppressions TO regie_coeur
  USING (marque_id = nullif(current_setting('app.marque_id', true), '')::uuid)
  WITH CHECK (marque_id = nullif(current_setting('app.marque_id', true), '')::uuid);

GRANT SELECT, INSERT ON suppressions TO regie_coeur;
