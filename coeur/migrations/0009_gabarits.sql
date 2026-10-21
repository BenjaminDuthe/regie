-- regie — gabarits (histoires 2.7 et 2.8, FR-55, FR-6). Un gabarit appartient à un espace : couleurs, polices, style des
-- sous-titres, carte de fin, légende et mots-clics par défaut (colonne `definition`, validée par le cœur). Pas de limite
-- du nombre de gabarits par espace (ajustement du tableau de la V1). Pas de DELETE en V1 : la suppression est reportée.
-- Cloisonné par marque (RLS forcée) ET par espace visible : la sous-requête sur `espaces` applique à son tour la RLS
-- de l'utilisateur (`app.utilisateur_id`), donc un gabarit n'est visible que depuis un espace de la personne.
-- Exécutée par regie_migrations.

CREATE TABLE gabarits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  marque_id uuid NOT NULL REFERENCES marques (id),
  espace_id uuid NOT NULL REFERENCES espaces (id),
  nom text NOT NULL CHECK (length(nom) BETWEEN 1 AND 80),
  definition jsonb NOT NULL CHECK (jsonb_typeof(definition) = 'object'),
  -- Un seul gabarit par défaut par espace : celui que les vidéos prennent si on n'en choisit pas.
  par_defaut boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1,
  cree_le timestamptz NOT NULL DEFAULT now(),
  modifie_le timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX gabarits_espace ON gabarits (marque_id, espace_id, cree_le);
CREATE UNIQUE INDEX gabarits_un_defaut ON gabarits (espace_id) WHERE par_defaut;

ALTER TABLE gabarits ENABLE ROW LEVEL SECURITY;
ALTER TABLE gabarits FORCE ROW LEVEL SECURITY;

CREATE POLICY gabarits_de_la_marque ON gabarits TO regie_coeur
  USING (marque_id = nullif(current_setting('app.marque_id', true), '')::uuid AND EXISTS (SELECT 1 FROM espaces e WHERE e.id = gabarits.espace_id))
  WITH CHECK (marque_id = nullif(current_setting('app.marque_id', true), '')::uuid AND EXISTS (SELECT 1 FROM espaces e WHERE e.id = gabarits.espace_id));

-- Jamais de DELETE ; seules la définition, le nom et la version changent.
GRANT SELECT, INSERT ON gabarits TO regie_coeur;
GRANT UPDATE (nom, definition, version, modifie_le) ON gabarits TO regie_coeur;
