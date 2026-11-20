import { sql } from '@/lib/db';
import type { DateRange } from '@/lib/date-ranges';

// Wspolne definicje liczb Status Meeting (kafelki "Liczby" + panel "Analiza okresu").
// ownerId = null -> wszyscy rekruterzy; w przeciwnym razie tylko projekty p.owner_id = ownerId.

export type PeriodNumbers = {
  stages_closed: number;   // Etapy zrealizowane
  success_count: number;   // Projekty zamkniete (status sukcesu)
  success_points: number;  // Punkty zdobyte
  new_projects: number;    // Nowe projekty
  freelancer_recs: number; // Rekomendacje freelancerow
  freelancer_meetings: number; // Spotkania z klientem (Etap 2) wg stage2_at
  freelancer_selected: number; // Wybrani (zatrudnienia) wg selected_at
  freelancer_estimate: number; // Szacunek wynagrodzen freelancerow (zl) za zdarzenia z okresu
};

export const EMPTY_PERIOD_NUMBERS: PeriodNumbers = {
  stages_closed: 0,
  success_count: 0,
  success_points: 0,
  new_projects: 0,
  freelancer_recs: 0,
  freelancer_meetings: 0,
  freelancer_selected: 0,
  freelancer_estimate: 0,
};

// Zdarzenia z kandydatami freelancerow (is_external) w projektach rekrutera — JEDNO ZRODLO
// PRAWDY dla tabeli "Rekomendacje freelancerow", jej dymkow i panelu "Analiza okresu".
// Jeden wiersz = jedno zdarzenie w okresie, wg wlasnej daty:
//   submitted (created_at), stage1 (stage1_at), stage2 (stage2_at), selected (selected_at).
//
// Kwota zdarzenia (Szacunek, zgodnie z zasada z lib/freelancer-earnings.ts, ale per zdarzenie):
// - selected => wartosc projektu (project_value, brak => points)
// - stage1 / stage2 => cv_rate / meeting_rate, tylko gdy freelancer NIE ma w tym projekcie
//   zadnego kandydata 'selected' (w ogole, nie tylko w okresie); w przeciwnym razie
//   kwota 0 i included = TRUE ("wliczone w kwote za wybranego")
// - submitted => brak kwoty (NULL)
// Stawki: brak lub wartosc niepoprawna => 0; zero zostaje zerem (bez falsy-fallbackow).
const rateSql = (key: string, fallback: string) =>
  `CASE WHEN jsonb_typeof(p.freelancer_rates->'${key}') = 'number'
             AND (p.freelancer_rates->>'${key}')::numeric >= 0
        THEN (p.freelancer_rates->>'${key}')::numeric
        ELSE ${fallback} END`;

const FREELANCER_EVENTS_CTE = `
  fe_base AS (
    SELECT
      fc.user_id,
      u.name,
      fc.full_name AS candidate_name,
      p.title AS project_title,
      fc.created_at::date AS submitted_on,
      fc.stage1_at,
      fc.stage2_at,
      fc.selected_at,
      EXISTS (
        SELECT 1 FROM freelancer_candidates fs
        WHERE fs.user_id = fc.user_id AND fs.project_id = fc.project_id AND fs.status = 'selected'
      ) AS pair_has_selected,
      ${rateSql('cv_rate', '0')} AS cv_rate,
      ${rateSql('meeting_rate', '0')} AS meeting_rate,
      ${rateSql('project_value', 'COALESCE(p.points, 0)::numeric')} AS project_value
    FROM freelancer_candidates fc
    JOIN users u ON u.id = fc.user_id
    JOIN projects p ON p.id = fc.project_id
    WHERE u.is_external = TRUE
      AND ($1::uuid IS NULL OR p.owner_id = $1::uuid)
      AND (fc.created_at::date BETWEEN $2::date AND $3::date
           OR fc.stage1_at BETWEEN $2::date AND $3::date
           OR fc.stage2_at BETWEEN $2::date AND $3::date
           OR fc.selected_at BETWEEN $2::date AND $3::date)
  ),
  fe_events AS (
    SELECT b.user_id, b.name, b.candidate_name, b.project_title, e.kind, e.event_date, e.amount, e.included
    FROM fe_base b
    CROSS JOIN LATERAL (VALUES
      ('submitted', b.submitted_on, NULL::numeric, FALSE),
      ('stage1', b.stage1_at,
         CASE WHEN b.pair_has_selected THEN 0 ELSE b.cv_rate END, b.pair_has_selected),
      ('stage2', b.stage2_at,
         CASE WHEN b.pair_has_selected THEN 0 ELSE b.meeting_rate END, b.pair_has_selected),
      ('selected', b.selected_at, b.project_value, FALSE)
    ) AS e(kind, event_date, amount, included)
    WHERE e.event_date BETWEEN $2::date AND $3::date
  )`;

export async function fetchPeriodNumbers(ownerId: string | null, range: DateRange): Promise<PeriodNumbers> {
  const rows = (await sql.query(
    `WITH ${FREELANCER_EVENTS_CTE}
     SELECT
       (SELECT COUNT(*)::int FROM project_stages ps
        JOIN projects p ON p.id = ps.project_id
        WHERE ps.done_at BETWEEN $2::date AND $3::date
          AND ($1::uuid IS NULL OR p.owner_id = $1::uuid)) AS stages_closed,
       (SELECT COUNT(*)::int FROM projects p
        JOIN result_statuses rs ON rs.id = p.status_id
        WHERE p.closed_at BETWEEN $2::date AND $3::date
          AND rs.is_success = TRUE
          AND ($1::uuid IS NULL OR p.owner_id = $1::uuid)) AS success_count,
       (SELECT COALESCE(SUM(p.points), 0)::int FROM projects p
        JOIN result_statuses rs ON rs.id = p.status_id
        WHERE p.closed_at BETWEEN $2::date AND $3::date
          AND rs.is_success = TRUE
          AND ($1::uuid IS NULL OR p.owner_id = $1::uuid)) AS success_points,
       (SELECT COUNT(*)::int FROM projects p
        WHERE p.opened_at BETWEEN $2::date AND $3::date
          AND p.is_archived = FALSE
          AND ($1::uuid IS NULL OR p.owner_id = $1::uuid)) AS new_projects,
       (SELECT COUNT(*) FILTER (WHERE kind = 'submitted')::int FROM fe_events) AS freelancer_recs,
       (SELECT COUNT(*) FILTER (WHERE kind = 'stage2')::int FROM fe_events) AS freelancer_meetings,
       (SELECT COUNT(*) FILTER (WHERE kind = 'selected')::int FROM fe_events) AS freelancer_selected,
       (SELECT COALESCE(SUM(amount), 0)::float8 FROM fe_events) AS freelancer_estimate`,
    [ownerId, range.start, range.end]
  )) as PeriodNumbers[];
  return rows[0] ?? EMPTY_PERIOD_NUMBERS;
}

export type FreelancerEventKind = 'submitted' | 'stage1' | 'stage2' | 'selected';

export type FreelancerEvent = {
  candidate_name: string;
  project_title: string;
  date: string; // YYYY-MM-DD
  kind: FreelancerEventKind;
  amount?: number;    // tylko pozycje Szacunku (stage1/stage2/selected)
  included?: boolean; // true => wliczone w kwote za wybranego (amount = 0)
};

export type FreelancerEventLists = {
  submitted: FreelancerEvent[];
  stage1: FreelancerEvent[];
  stage2: FreelancerEvent[];
  selected: FreelancerEvent[];
  estimate: FreelancerEvent[]; // pozycje Szacunku: stage1, stage2, selected
};

export type FreelancerRecommendation = {
  user_id: string;
  name: string;
  submitted: number; // zgloszone w okresie (created_at)
  accepted: number;  // Etap 1 osiagniety w okresie (stage1_at)
  meetings: number;  // Etap 2 osiagniety w okresie (stage2_at)
  selected: number;  // wybrani w okresie (selected_at)
  estimate: number;  // szacunek wynagrodzenia (zl) = suma amount z events.estimate
  events: FreelancerEventLists;
};

type EventRow = {
  user_id: string;
  name: string;
  candidate_name: string;
  project_title: string;
  kind: FreelancerEventKind;
  date: string;
  amount: number | null;
  included: boolean;
};

// Liczby w tabeli sa wyliczane z tych samych pozycji, ktore pokazuja dymki,
// wiec liczba = dlugosc listy, a Szacunek = suma kwot pozycji (z definicji).
export async function fetchFreelancerRecommendations(
  ownerId: string | null,
  range: DateRange
): Promise<FreelancerRecommendation[]> {
  const rows = (await sql.query(
    `WITH ${FREELANCER_EVENTS_CTE}
     SELECT
       user_id, name, candidate_name, project_title, kind,
       event_date::text AS date,
       amount::float8 AS amount,
       included
     FROM fe_events
     ORDER BY event_date ASC, candidate_name ASC`,
    [ownerId, range.start, range.end]
  )) as EventRow[];

  const byUser = new Map<string, FreelancerRecommendation>();
  for (const r of rows) {
    let rec = byUser.get(r.user_id);
    if (!rec) {
      rec = {
        user_id: r.user_id,
        name: r.name,
        submitted: 0,
        accepted: 0,
        meetings: 0,
        selected: 0,
        estimate: 0,
        events: { submitted: [], stage1: [], stage2: [], selected: [], estimate: [] },
      };
      byUser.set(r.user_id, rec);
    }
    const ev: FreelancerEvent = {
      candidate_name: r.candidate_name,
      project_title: r.project_title,
      date: r.date,
      kind: r.kind,
    };
    rec.events[r.kind].push(ev);
    if (r.kind !== 'submitted') {
      const amount = typeof r.amount === 'number' ? r.amount : 0;
      rec.events.estimate.push({ ...ev, amount, included: r.included });
    }
  }

  return Array.from(byUser.values())
    .map((rec) => ({
      ...rec,
      submitted: rec.events.submitted.length,
      accepted: rec.events.stage1.length,
      meetings: rec.events.stage2.length,
      selected: rec.events.selected.length,
      estimate: rec.events.estimate.reduce((sum, e) => sum + (e.amount ?? 0), 0),
    }))
    .sort(
      (a, b) =>
        b.submitted - a.submitted ||
        b.accepted - a.accepted ||
        b.meetings - a.meetings ||
        b.selected - a.selected ||
        a.name.localeCompare(b.name, 'pl')
    );
}
