-- regie — échéances et travaux internes (histoire 2.2, AR-22). Une échéance est un instant UTC où regie doit faire
-- quelque chose ; elle est inscrite dans la même transaction que l'action qui l'annonce. Quand elle est due, le
-- planificateur crée UN travail interne (echeance_id unique : jamais deux fois). Cloisonné par marque (RLS forcée).

CREATE TABLE echeances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  marque_id uuid NOT NULL REFERENCES marques (id),
  type text NOT NULL CHECK (type ~ '^[a-z][a-z_]{0,40}$'),
  objet text NOT NULL CHECK (length(objet) BETWEEN 1 AND 200),
  instant timestamptz NOT NULL,
  -- Clé d'une échéance qui revient (une par nuit, par exemple) : la même clé n'est jamais inscrite deux fois.
  cle text CHECK (cle IS NULL OR length(cle) BETWEEN 1 AND 100),
  etat text NOT NULL DEFAULT 'programmee' CHECK (etat IN ('programmee', 'declenchee', 'echouee', 'annulee')),
  cause text CHECK (cause IS NULL OR cause ~ '^[A-Z][A-Z0-9_]{0,40}$'),
  cree_le timestamptz NOT NULL DEFAULT now(),
  declenchee_le timestamptz
);
CREATE INDEX echeances_dues ON echeances (instant) WHERE etat = 'programmee';
CREATE UNIQUE INDEX echeances_cle_unique ON echeances (marque_id, type, cle) WHERE cle IS NOT NULL;

CREATE TABLE travaux_internes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  marque_id uuid NOT NULL REFERENCES marques (id),
  echeance_id uuid NOT NULL UNIQUE REFERENCES echeances (id),
  type text NOT NULL CHECK (type ~ '^[a-z][a-z_]{0,40}$'),
  objet text NOT NULL CHECK (length(objet) BETWEEN 1 AND 200),
  etat text NOT NULL DEFAULT 'pret' CHECK (etat IN ('pret', 'en_cours', 'termine', 'echoue')),
  tentatives integer NOT NULL DEFAULT 0,
  -- Un travail pris par un service mort redevient prenable quand son bail expire (les travaux internes sont rejouables).
  bail_jusqua timestamptz,
  cause text CHECK (cause IS NULL OR cause ~ '^[A-Z][A-Z0-9_]{0,40}$'),
  cree_le timestamptz NOT NULL DEFAULT now(),
  termine_le timestamptz
);
CREATE INDEX travaux_internes_a_faire ON travaux_internes (cree_le) WHERE etat IN ('pret', 'en_cours');

ALTER TABLE echeances ENABLE ROW LEVEL SECURITY;
ALTER TABLE echeances FORCE ROW LEVEL SECURITY;
ALTER TABLE travaux_internes ENABLE ROW LEVEL SECURITY;
ALTER TABLE travaux_internes FORCE ROW LEVEL SECURITY;

CREATE POLICY echeances_de_la_marque ON echeances TO regie_coeur
  USING (marque_id = nullif(current_setting('app.marque_id', true), '')::uuid)
  WITH CHECK (marque_id = nullif(current_setting('app.marque_id', true), '')::uuid);
CREATE POLICY travaux_internes_de_la_marque ON travaux_internes TO regie_coeur
  USING (marque_id = nullif(current_setting('app.marque_id', true), '')::uuid)
  WITH CHECK (marque_id = nullif(current_setting('app.marque_id', true), '')::uuid);

-- Jamais de DELETE : une échéance se déclenche, échoue ou s'annule, et reste lisible.
GRANT SELECT, INSERT, UPDATE ON echeances TO regie_coeur;
GRANT SELECT, INSERT, UPDATE ON travaux_internes TO regie_coeur;
