-- regie — publications sur les réseaux (histoires 7.3 à 7.5, FR-42 à FR-44, AR-22). Une PUBLICATION envoie UN rendu
-- complet d'UNE vidéo sur UN compte relié. Elle fige le montage et le rendu au moment de la demande, avec la légende :
-- ce qui part est ce que la personne a vu. Une seule publication vivante par compte et par vidéo (série) : l'index
-- unique partiel ignore les publications annulées. `cle_idempotence` est transmise au réseau à chaque envoi ; l'envoi
-- ne se fait qu'après le passage `en_file` -> `envoi_en_cours` (compare-and-set), jamais avant, et une tâche rejouée
-- trouve cet état et ne renvoie rien. `incertaine` : l'envoi est parti mais le résultat est inconnu (coupure) ;
-- on ne renvoie jamais, la personne vérifie sur le réseau.
-- Chaque tentative laisse une ligne dans `publication_tentatives` (historique, 7.5) avec qui l'a déclenchée.
-- Aucun jeton ici : il est au coffre. Pas de DELETE accordé : les suppressions d'une vidéo passent par la cascade des
-- clés étrangères. Cloisonné par marque (RLS forcée) ET par espace visible. Exécutée par regie_migrations.

CREATE TABLE publications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  marque_id uuid NOT NULL REFERENCES marques (id),
  espace_id uuid NOT NULL REFERENCES espaces (id),
  utilisateur_id uuid NOT NULL REFERENCES utilisateurs (id),
  compte_id uuid NOT NULL REFERENCES comptes_reseau (id),
  reseau text NOT NULL CHECK (reseau IN ('instagram', 'facebook', 'tiktok')),
  serie_id uuid NOT NULL,
  montage_id uuid NOT NULL REFERENCES montages (id) ON DELETE CASCADE,
  rendu_id uuid NOT NULL REFERENCES rendus (id) ON DELETE CASCADE,
  legende text NOT NULL CHECK (length(legende) <= 5000),
  hashtags text[] NOT NULL DEFAULT '{}' CHECK (cardinality(hashtags) <= 30),
  etat text NOT NULL DEFAULT 'en_file' CHECK (etat IN ('en_file', 'programmee', 'en_attente_confirmation', 'envoi_en_cours', 'publiee', 'en_echec', 'incertaine', 'annulee')),
  cle_idempotence uuid NOT NULL DEFAULT gen_random_uuid(),
  tache_id uuid,
  -- Heure choisie (histoire 7.4), en instant UTC ; la personne la choisit à l'heure de Paris.
  programmee_pour timestamptz,
  id_externe text CHECK (id_externe IS NULL OR length(id_externe) <= 200),
  lien text CHECK (lien IS NULL OR length(lien) <= 500),
  cause text CHECK (cause IS NULL OR cause ~ '^[A-Z][A-Z0-9_]{0,40}$'),
  action text CHECK (action IS NULL OR action ~ '^[a-z][a-z_]{0,30}$'),
  tentatives integer NOT NULL DEFAULT 0,
  cree_le timestamptz NOT NULL DEFAULT now(),
  modifie_le timestamptz NOT NULL DEFAULT now(),
  publiee_le timestamptz,
  CHECK ((etat = 'publiee') = (id_externe IS NOT NULL))
);
CREATE UNIQUE INDEX publications_une_par_compte_et_video ON publications (compte_id, serie_id) WHERE etat <> 'annulee';
CREATE INDEX publications_serie ON publications (marque_id, serie_id);
CREATE INDEX publications_espace ON publications (marque_id, espace_id, cree_le DESC);
CREATE INDEX publications_tache ON publications (marque_id, tache_id) WHERE tache_id IS NOT NULL;

CREATE TABLE publication_tentatives (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  marque_id uuid NOT NULL REFERENCES marques (id),
  espace_id uuid NOT NULL REFERENCES espaces (id),
  publication_id uuid NOT NULL REFERENCES publications (id) ON DELETE CASCADE,
  numero integer NOT NULL CHECK (numero >= 1),
  -- Qui a déclenché cette tentative, et par quelle porte (interface, api, mcp) ; jamais le jeton lui-même.
  origine text NOT NULL CHECK (origine IN ('interface', 'api', 'mcp', 'echeance')),
  utilisateur_id uuid NOT NULL REFERENCES utilisateurs (id),
  pat text CHECK (pat IS NULL OR length(pat) <= 80),
  tache_id uuid,
  debut timestamptz NOT NULL DEFAULT now(),
  fin timestamptz,
  issue text NOT NULL DEFAULT 'en_cours' CHECK (issue IN ('en_cours', 'publiee', 'en_echec', 'incertaine')),
  cause text CHECK (cause IS NULL OR cause ~ '^[A-Z][A-Z0-9_]{0,40}$'),
  UNIQUE (publication_id, numero)
);
CREATE INDEX publication_tentatives_publication ON publication_tentatives (marque_id, publication_id, numero);

ALTER TABLE publications ENABLE ROW LEVEL SECURITY;
ALTER TABLE publications FORCE ROW LEVEL SECURITY;

CREATE POLICY publications_de_la_marque ON publications TO regie_coeur
  USING (marque_id = nullif(current_setting('app.marque_id', true), '')::uuid AND EXISTS (SELECT 1 FROM espaces e WHERE e.id = publications.espace_id))
  WITH CHECK (marque_id = nullif(current_setting('app.marque_id', true), '')::uuid AND EXISTS (SELECT 1 FROM espaces e WHERE e.id = publications.espace_id));

GRANT SELECT, INSERT ON publications TO regie_coeur;
GRANT UPDATE (etat, tache_id, programmee_pour, legende, hashtags, id_externe, lien, cause, action, tentatives, modifie_le, publiee_le, montage_id, rendu_id, cle_idempotence) ON publications TO regie_coeur;

ALTER TABLE publication_tentatives ENABLE ROW LEVEL SECURITY;
ALTER TABLE publication_tentatives FORCE ROW LEVEL SECURITY;

CREATE POLICY publication_tentatives_de_la_marque ON publication_tentatives TO regie_coeur
  USING (marque_id = nullif(current_setting('app.marque_id', true), '')::uuid AND EXISTS (SELECT 1 FROM espaces e WHERE e.id = publication_tentatives.espace_id))
  WITH CHECK (marque_id = nullif(current_setting('app.marque_id', true), '')::uuid AND EXISTS (SELECT 1 FROM espaces e WHERE e.id = publication_tentatives.espace_id));

GRANT SELECT, INSERT ON publication_tentatives TO regie_coeur;
GRANT UPDATE (fin, issue, cause) ON publication_tentatives TO regie_coeur;
