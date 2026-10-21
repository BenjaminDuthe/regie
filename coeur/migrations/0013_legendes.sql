-- regie — légende et hashtags d'une vidéo, par réseau (histoire 3.7, FR-38). Une ligne par vidéo (la série de ses
-- versions) et par réseau : la légende n'appartient pas à une version du montage, elle suit la vidéo.
-- Les bornes (longueur, nombre de hashtags) vivent dans deploiement/bornes.json et sont appliquées par le cœur ;
-- la base ne garde que des garde-fous larges. Cloisonné par marque (RLS forcée) ET par espace visible.
-- Exécutée par regie_migrations.

CREATE TABLE legendes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  marque_id uuid NOT NULL REFERENCES marques (id),
  espace_id uuid NOT NULL REFERENCES espaces (id),
  serie_id uuid NOT NULL,
  reseau text NOT NULL CHECK (reseau IN ('instagram', 'facebook', 'tiktok')),
  legende text NOT NULL CHECK (length(legende) <= 10000),
  hashtags jsonb NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(hashtags) = 'array' AND jsonb_array_length(hashtags) <= 100),
  maj_le timestamptz NOT NULL DEFAULT now(),
  UNIQUE (marque_id, serie_id, reseau)
);

ALTER TABLE legendes ENABLE ROW LEVEL SECURITY;
ALTER TABLE legendes FORCE ROW LEVEL SECURITY;

CREATE POLICY legendes_de_la_marque ON legendes TO regie_coeur
  USING (marque_id = nullif(current_setting('app.marque_id', true), '')::uuid AND EXISTS (SELECT 1 FROM espaces e WHERE e.id = legendes.espace_id))
  WITH CHECK (marque_id = nullif(current_setting('app.marque_id', true), '')::uuid AND EXISTS (SELECT 1 FROM espaces e WHERE e.id = legendes.espace_id));

GRANT SELECT, INSERT ON legendes TO regie_coeur;
GRANT UPDATE (legende, hashtags, maj_le) ON legendes TO regie_coeur;
