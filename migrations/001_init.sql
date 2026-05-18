-- ============================================================================
-- Zeroone Recruiter — Initial schema
-- Migration: 001_init.sql
-- ============================================================================

-- Trigger function: set updated_at to NOW() on UPDATE
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- USERS
-- ============================================================================
CREATE TABLE users (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email           TEXT NOT NULL UNIQUE,
  password_hash   TEXT NOT NULL,
  name            TEXT NOT NULL,
  role            TEXT NOT NULL CHECK (role IN ('admin', 'recruiter')),
  is_active       BOOLEAN NOT NULL DEFAULT true,
  is_external     BOOLEAN NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================================
-- CLIENTS
-- ============================================================================
CREATE TABLE clients (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  notes           TEXT,
  is_archived     BOOLEAN NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_clients_updated_at
  BEFORE UPDATE ON clients
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================================
-- PROJECT TYPES
-- ============================================================================
CREATE TABLE project_types (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  default_points  INTEGER NOT NULL DEFAULT 5 CHECK (default_points BETWEEN 1 AND 25),
  is_archived     BOOLEAN NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_project_types_updated_at
  BEFORE UPDATE ON project_types
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================================
-- WORKFLOW STAGES TEMPLATE (globalne, edytowalne w /ustawienia)
-- Zmiany dotyczą TYLKO nowych projektów (istniejące mają snapshot).
-- ============================================================================
CREATE TABLE workflow_stages_template (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                  TEXT NOT NULL,
  position              INTEGER NOT NULL,
  default_days_offset   INTEGER NOT NULL DEFAULT 7 CHECK (default_days_offset >= 0),
  is_archived           BOOLEAN NOT NULL DEFAULT false,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_workflow_stages_template_updated_at
  BEFORE UPDATE ON workflow_stages_template
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================================
-- RESULT STATUSES (statusy projektu, edytowalne w /ustawienia)
-- is_success=true -> zamknięcie projektu zaliczy punkty rekruterowi
-- ============================================================================
CREATE TABLE result_statuses (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  color           TEXT NOT NULL DEFAULT '#6B7280',
  is_success      BOOLEAN NOT NULL DEFAULT false,
  position        INTEGER NOT NULL,
  is_archived     BOOLEAN NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_result_statuses_updated_at
  BEFORE UPDATE ON result_statuses
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================================
-- PROJECTS
-- ============================================================================
CREATE TABLE projects (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title               TEXT NOT NULL,
  client_id           UUID NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
  project_type_id     UUID NOT NULL REFERENCES project_types(id) ON DELETE RESTRICT,
  owner_id            UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  status_id           UUID NOT NULL REFERENCES result_statuses(id) ON DELETE RESTRICT,
  points              INTEGER NOT NULL CHECK (points BETWEEN 1 AND 25),
  links               JSONB NOT NULL DEFAULT '[]'::jsonb,
  notes               TEXT,
  opened_at           DATE NOT NULL DEFAULT CURRENT_DATE,
  closed_at           DATE,
  is_archived         BOOLEAN NOT NULL DEFAULT false,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_projects_owner_id ON projects(owner_id);
CREATE INDEX idx_projects_client_id ON projects(client_id);
CREATE INDEX idx_projects_status_id ON projects(status_id);
CREATE INDEX idx_projects_is_archived ON projects(is_archived);

CREATE TRIGGER trg_projects_updated_at
  BEFORE UPDATE ON projects
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================================
-- PROJECT STAGES (snapshot etapów per projekt, każdy ze swoim deadline)
-- Tworzone przy zakładaniu projektu z workflow_stages_template.
-- "Czerwone" = deadline < CURRENT_DATE AND done_at IS NULL.
-- Aktualny etap = pierwszy z najniższą position gdzie done_at IS NULL.
-- ============================================================================
CREATE TABLE project_stages (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  position        INTEGER NOT NULL,
  deadline        DATE NOT NULL,
  done_at         DATE,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_project_stages_project_id ON project_stages(project_id);
CREATE INDEX idx_project_stages_deadline_open ON project_stages(deadline) WHERE done_at IS NULL;

CREATE TRIGGER trg_project_stages_updated_at
  BEFORE UPDATE ON project_stages
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================================
-- PROJECT POINT ALLOCATIONS (podział puli punktów między rekruterów)
-- Suma points per project_id powinna == projects.points (walidacja w API).
-- Domyślnie: 1 wiersz z owner_id i całą pulą, edytowalne przy zamknięciu.
-- ============================================================================
CREATE TABLE project_point_allocations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  points          INTEGER NOT NULL CHECK (points > 0),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (project_id, user_id)
);

CREATE INDEX idx_ppa_project_id ON project_point_allocations(project_id);
CREATE INDEX idx_ppa_user_id ON project_point_allocations(user_id);

CREATE TRIGGER trg_ppa_updated_at
  BEFORE UPDATE ON project_point_allocations
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================================
-- POINT TRANSACTIONS (ledger, append-only)
-- Tworzone przy zamknięciu projektu ze statusem is_success=true.
-- Korekta = nowy wpis z ujemnymi punktami. Nigdy UPDATE/DELETE.
-- ============================================================================
CREATE TABLE point_transactions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      UUID NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  points          INTEGER NOT NULL,
  awarded_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reason          TEXT NOT NULL DEFAULT 'project_closed_success'
);

CREATE INDEX idx_pt_user_id ON point_transactions(user_id);
CREATE INDEX idx_pt_project_id ON point_transactions(project_id);
CREATE INDEX idx_pt_awarded_at ON point_transactions(awarded_at);

-- ============================================================================
-- SEED DATA
-- ============================================================================

-- Admin user (Wojciech)
INSERT INTO users (email, password_hash, name, role) VALUES
  ('wojciech.kliniewski@zeroone.pl',
   '$2b$10$PuKYr7W4Mpb9Bii0w53b4uwooYRJAOAN4Wy.eqDf9YEfwKClY5xWC',
   'Wojciech Kliniewski',
   'admin');

-- Result statuses
INSERT INTO result_statuses (name, color, is_success, position) VALUES
  ('Aktywny',     '#3B82F6', false, 1),
  ('Wstrzymany',  '#F59E0B', false, 2),
  ('Zrealizowany','#10B981', true,  3),
  ('Anulowany',   '#EF4444', false, 4);

-- Workflow stages template (7 etapów, edytowalne w /ustawienia)
-- default_days_offset: ile dni od opened_at proponujemy jako deadline
INSERT INTO workflow_stages_template (name, position, default_days_offset) VALUES
  ('Briefing z klientem',  1, 0),
  ('Projekt na produkcji', 2, 3),
  ('Kandydaci',            3, 10),
  ('Rekomendacje',         4, 17),
  ('Spotkania u klienta',  5, 24),
  ('Wybor kandydata',      6, 31),
  ('Zatrudnienie',         7, 38);

