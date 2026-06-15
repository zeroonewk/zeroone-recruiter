-- Migration: 003_funnel_snapshots.sql
-- Tabela funnel_snapshots: codzienny snapshot stanu lejka per projekt.
-- Max 1 wpis per (project_id, snapshot_date). Wielokrotne edycje w ciagu dnia
-- nadpisuja wpis (zostaje stan z konca dnia).

CREATE TABLE funnel_snapshots (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  snapshot_date DATE NOT NULL,
  funnel        JSONB NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (project_id, snapshot_date)
);

CREATE INDEX idx_funnel_snapshots_project_date 
  ON funnel_snapshots(project_id, snapshot_date DESC);

-- Trigger 1: snapshot przy zmianie funnel
CREATE OR REPLACE FUNCTION snapshot_funnel_on_change()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.funnel IS DISTINCT FROM OLD.funnel THEN
    INSERT INTO funnel_snapshots (project_id, snapshot_date, funnel)
    VALUES (NEW.id, CURRENT_DATE, NEW.funnel)
    ON CONFLICT (project_id, snapshot_date) 
    DO UPDATE SET funnel = EXCLUDED.funnel;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_snapshot_funnel_update
  AFTER UPDATE OF funnel ON projects
  FOR EACH ROW EXECUTE FUNCTION snapshot_funnel_on_change();

-- Trigger 2: initial snapshot przy utworzeniu projektu
CREATE OR REPLACE FUNCTION snapshot_funnel_on_create()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO funnel_snapshots (project_id, snapshot_date, funnel)
  VALUES (NEW.id, CURRENT_DATE, NEW.funnel)
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_snapshot_funnel_create
  AFTER INSERT ON projects
  FOR EACH ROW EXECUTE FUNCTION snapshot_funnel_on_create();

-- Backfill: dla wszystkich istniejacych projektow utworz baseline z dzisiejsza data
INSERT INTO funnel_snapshots (project_id, snapshot_date, funnel)
SELECT id, CURRENT_DATE, funnel FROM projects
ON CONFLICT DO NOTHING;
