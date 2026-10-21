-- regie — notifications d'interface (histoire 2.6, FR-32, AR-25). Une notification dit à une personne qu'un événement
-- la concerne (ici : une étape en échec, un journal d'audit rompu pour l'administrateur). Elle est créée dans la même
-- transaction que l'événement : pour une tâche, par un déclencheur sur le passage à « echouee », donc jamais sans
-- elle et jamais deux fois (cle unique). Le courriel n'existe pas en V1 (passe en V1.1) : aucune table de courriels.
-- Cloisonnée par marque (RLS forcée) ; la personne est filtrée par les requêtes (comme `taches`). Exécutée par regie_migrations.

CREATE TABLE notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  marque_id uuid NOT NULL REFERENCES marques (id),
  utilisateur_id uuid NOT NULL,
  -- etape_echouee | chaine_rompue (série prête s'y ajoute avec l'histoire 2.12)
  genre text NOT NULL CHECK (genre ~ '^[a-z][a-z_]{0,40}$'),
  -- Étape concernée (type de tâche) et tâche : de quoi relancer sans chercher.
  etape text CHECK (etape IS NULL OR etape ~ '^[a-z][a-z0-9_]{0,40}$'),
  tache_id uuid REFERENCES taches (id),
  cause text CHECK (cause IS NULL OR cause ~ '^[A-Z][A-Z0-9_]{0,40}$'),
  action text CHECK (action IS NULL OR action ~ '^[a-z][a-z_]{0,30}$'),
  -- Une même notification n'est jamais créée deux fois (tâche + tentative, ou contrôle + jour).
  cle text NOT NULL CHECK (length(cle) BETWEEN 1 AND 120),
  cree_le timestamptz NOT NULL DEFAULT now(),
  acquittee_le timestamptz,
  UNIQUE (marque_id, cle)
);
CREATE INDEX notifications_personne ON notifications (marque_id, utilisateur_id, cree_le DESC);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications FORCE ROW LEVEL SECURITY;

CREATE POLICY notifications_de_la_marque ON notifications TO regie_coeur
  USING (marque_id = nullif(current_setting('app.marque_id', true), '')::uuid)
  WITH CHECK (marque_id = nullif(current_setting('app.marque_id', true), '')::uuid);

-- Jamais de DELETE : une notification s'acquitte. Seule la date d'acquittement change.
GRANT SELECT, INSERT ON notifications TO regie_coeur;
GRANT UPDATE (acquittee_le) ON notifications TO regie_coeur;

-- Une tâche qui passe en échec définitif prévient sa propriétaire, dans la même transaction. Le déclencheur s'exécute
-- avec les droits de l'appelant : la RLS par marque s'applique. regie ne relance jamais seul une étape en échec.
CREATE FUNCTION notifier_echec_tache() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO notifications (marque_id, utilisateur_id, genre, etape, tache_id, cause, action, cle)
  VALUES (NEW.marque_id, NEW.utilisateur_id, 'etape_echouee', NEW.type, NEW.id, NEW.cause, NEW.action, 'echec:' || NEW.id::text || ':' || NEW.tentatives::text)
  ON CONFLICT (marque_id, cle) DO NOTHING;
  RETURN NEW;
END $$;

CREATE TRIGGER taches_echec_notifie AFTER UPDATE OF etat ON taches
  FOR EACH ROW WHEN (NEW.etat = 'echouee' AND OLD.etat IS DISTINCT FROM 'echouee')
  EXECUTE FUNCTION notifier_echec_tache();
