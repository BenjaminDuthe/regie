-- regie — fichiers, montages et rendus (histoire 4.6, FR-26, FR-28). Un FILM est le rush tourné par la capture (4.5) ;
-- un MONTAGE est une version immuable de la « timeline » (JSON pur) qui dit comment le monter, avec le gabarit figé
-- au moment de sa création (2.13) ; un RENDU est le résultat d'un passage de FFmpeg sur un montage (allégé pour
-- l'aperçu, complet pour la publication). Rien de tout cela ne se modifie : une nouvelle version est une nouvelle ligne
-- (montages : ni UPDATE ni DELETE), et seul l'état d'un rendu avance. Les octets sont sur disque, par marque
-- (`<REGIE_DONNEES>/<marque>/<fichier>`) ; la base garde la taille, l'empreinte et la date de purge (`purge_le`, rushes
-- purgés : le montage reste mais ne peut plus être refait depuis le film).
-- Cloisonné par marque (RLS forcée) ET par espace visible, comme `scripts`. Exécutée par regie_migrations.

CREATE TABLE fichiers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  marque_id uuid NOT NULL REFERENCES marques (id),
  espace_id uuid NOT NULL REFERENCES espaces (id),
  genre text NOT NULL CHECK (genre IN ('film', 'voix', 'rendu', 'rendu_allege')),
  mime text NOT NULL CHECK (mime IN ('video/webm', 'video/mp4', 'audio/wav')),
  octets bigint NOT NULL CHECK (octets >= 0 AND octets <= 2147483648),
  sha256 text NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  duree_ms integer CHECK (duree_ms IS NULL OR duree_ms >= 0),
  -- Une voix appartient à une scène d'un montage ; les autres fichiers n'ont ni l'un ni l'autre.
  montage_id uuid,
  scene_id text CHECK (scene_id IS NULL OR scene_id ~ '^[a-z0-9-]{1,32}$'),
  cree_le timestamptz NOT NULL DEFAULT now(),
  purge_le timestamptz,
  CHECK ((genre = 'voix') = (montage_id IS NOT NULL AND scene_id IS NOT NULL))
);
CREATE INDEX fichiers_montage ON fichiers (marque_id, montage_id) WHERE montage_id IS NOT NULL;

CREATE TABLE montages (
  id uuid PRIMARY KEY,
  marque_id uuid NOT NULL REFERENCES marques (id),
  espace_id uuid NOT NULL REFERENCES espaces (id),
  script_id uuid REFERENCES scripts (id),
  -- Toutes les versions d'une même vidéo partagent `serie_id` (l'identifiant de la première) ; `numero` les ordonne.
  serie_id uuid NOT NULL,
  numero integer NOT NULL CHECK (numero >= 1),
  parent_id uuid REFERENCES montages (id),
  origine text NOT NULL CHECK (origine IN ('jeu', 'edition', 'gabarit')),
  film_fichier_id uuid NOT NULL REFERENCES fichiers (id),
  timeline jsonb NOT NULL CHECK (jsonb_typeof(timeline) = 'object' AND pg_column_size(timeline) <= 262144),
  -- Le gabarit tel qu'il était à la création : { id, nom, version, definition }. Les rendus passés n'en changent pas.
  gabarit jsonb NOT NULL CHECK (jsonb_typeof(gabarit) = 'object'),
  cree_le timestamptz NOT NULL DEFAULT now(),
  UNIQUE (serie_id, numero)
);
CREATE INDEX montages_serie ON montages (marque_id, serie_id, numero);

ALTER TABLE fichiers ADD CONSTRAINT fichiers_montage_fk FOREIGN KEY (montage_id) REFERENCES montages (id) DEFERRABLE INITIALLY DEFERRED;

CREATE TABLE rendus (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  marque_id uuid NOT NULL REFERENCES marques (id),
  espace_id uuid NOT NULL REFERENCES espaces (id),
  montage_id uuid NOT NULL REFERENCES montages (id),
  genre text NOT NULL CHECK (genre IN ('allege', 'complet')),
  etat text NOT NULL CHECK (etat IN ('en_file', 'en_cours', 'pret', 'bloque', 'echec')),
  tache_id uuid,
  fichier_id uuid REFERENCES fichiers (id),
  -- Violations des gardes (scène, instant, élément, mesure, seuil) ; non vide si et seulement si le rendu est « bloqué ».
  violations jsonb NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(violations) = 'array' AND jsonb_array_length(violations) <= 200),
  cause text CHECK (cause IS NULL OR length(cause) <= 200),
  cree_le timestamptz NOT NULL DEFAULT now(),
  termine_le timestamptz
);
CREATE INDEX rendus_montage ON rendus (marque_id, montage_id, cree_le);

ALTER TABLE fichiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE fichiers FORCE ROW LEVEL SECURITY;

CREATE POLICY fichiers_de_la_marque ON fichiers TO regie_coeur
  USING (marque_id = nullif(current_setting('app.marque_id', true), '')::uuid AND EXISTS (SELECT 1 FROM espaces e WHERE e.id = fichiers.espace_id))
  WITH CHECK (marque_id = nullif(current_setting('app.marque_id', true), '')::uuid AND EXISTS (SELECT 1 FROM espaces e WHERE e.id = fichiers.espace_id));

GRANT SELECT, INSERT ON fichiers TO regie_coeur;

ALTER TABLE montages ENABLE ROW LEVEL SECURITY;
ALTER TABLE montages FORCE ROW LEVEL SECURITY;

CREATE POLICY montages_de_la_marque ON montages TO regie_coeur
  USING (marque_id = nullif(current_setting('app.marque_id', true), '')::uuid AND EXISTS (SELECT 1 FROM espaces e WHERE e.id = montages.espace_id))
  WITH CHECK (marque_id = nullif(current_setting('app.marque_id', true), '')::uuid AND EXISTS (SELECT 1 FROM espaces e WHERE e.id = montages.espace_id));

GRANT SELECT, INSERT ON montages TO regie_coeur;

ALTER TABLE rendus ENABLE ROW LEVEL SECURITY;
ALTER TABLE rendus FORCE ROW LEVEL SECURITY;

CREATE POLICY rendus_de_la_marque ON rendus TO regie_coeur
  USING (marque_id = nullif(current_setting('app.marque_id', true), '')::uuid AND EXISTS (SELECT 1 FROM espaces e WHERE e.id = rendus.espace_id))
  WITH CHECK (marque_id = nullif(current_setting('app.marque_id', true), '')::uuid AND EXISTS (SELECT 1 FROM espaces e WHERE e.id = rendus.espace_id));

GRANT SELECT, INSERT ON rendus TO regie_coeur;

GRANT UPDATE (purge_le) ON fichiers TO regie_coeur;
GRANT UPDATE (etat, tache_id, fichier_id, violations, cause, termine_le) ON rendus TO regie_coeur;
