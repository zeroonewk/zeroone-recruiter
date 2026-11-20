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

// Kandydaci freelancerow (is_external) w projektach rekrutera, z flagami zdarzen w okresie.
// Kazde zdarzenie liczone wg wlasnej daty: zgloszenie (created_at), Etap 1 (stage1_at),
// Etap 2 (stage2_at), Wybrany (selected_at).
//
// Szacunek (zl) — zgodnie z zasada z lib/freelancer-earnings.ts, ale per zdarzenie:
// - wybrany z selected_at w okresie => wartosc projektu (project_value, brak => points)
// - Etap 1 / Etap 2 w okresie => cv_rate / meeting_rate, tylko gdy freelancer NIE ma w tym
//   projekcie zadnego kandydata 'selected' (w ogole, nie tylko w okresie)
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
      (fc.created_at::date BETWEEN $2::date AND $3::date) AS is_submitted,
      COALESCE(fc.stage1_at BETWEEN $2::date AND $3::date, FALSE) AS is_stage1,
      COALESCE(fc.stage2_at BETWEEN $2::date AND $3::date, FALSE) AS is_stage2,
      COALESCE(fc.selected_at BETWEEN $2::date AND $3::date, FALSE) AS is_selected,
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
  ),
  fe AS (
    SELECT
      user_id, name, is_submitted, is_stage1, is_stage2, is_selected,
      (CASE WHEN is_selected THEN project_value ELSE 0 END
       + CASE WHEN pair_has_selected THEN 0
              ELSE (CASE WHEN is_stage1 THEN cv_rate ELSE 0 END)
                 + (CASE WHEN is_stage2 THEN meeting_rate ELSE 0 END)
         END) AS estimate
    FROM fe_base
    WHERE is_submitted OR is_stage1 OR is_stage2 OR is_selected
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
       (SELECT COUNT(*) FILTER (WHERE is_submitted)::int FROM fe) AS freelancer_recs,
       (SELECT COUNT(*) FILTER (WHERE is_stage2)::int FROM fe) AS freelancer_meetings,
       (SELECT COUNT(*) FILTER (WHERE is_selected)::int FROM fe) AS freelancer_selected,
       (SELECT COALESCE(SUM(estimate), 0)::float8 FROM fe) AS freelancer_estimate`,
    [ownerId, range.start, range.end]
  )) as PeriodNumbers[];
  return rows[0] ?? EMPTY_PERIOD_NUMBERS;
}

export type FreelancerRecommendation = {
  user_id: string;
  name: string;
  submitted: number; // zgloszone w okresie (created_at)
  accepted: number;  // Etap 1 osiagniety w okresie (stage1_at)
  meetings: number;  // Etap 2 osiagniety w okresie (stage2_at)
  selected: number;  // wybrani w okresie (selected_at)
  estimate: number;  // szacunek wynagrodzenia (zl) za zdarzenia z okresu
};

export async function fetchFreelancerRecommendations(
  ownerId: string | null,
  range: DateRange
): Promise<FreelancerRecommendation[]> {
  return (await sql.query(
    `WITH ${FREELANCER_EVENTS_CTE}
     SELECT
       user_id,
       name,
       COUNT(*) FILTER (WHERE is_submitted)::int AS submitted,
       COUNT(*) FILTER (WHERE is_stage1)::int AS accepted,
       COUNT(*) FILTER (WHERE is_stage2)::int AS meetings,
       COUNT(*) FILTER (WHERE is_selected)::int AS selected,
       COALESCE(SUM(estimate), 0)::float8 AS estimate
     FROM fe
     GROUP BY user_id, name
     ORDER BY submitted DESC, accepted DESC, meetings DESC, selected DESC, name ASC`,
    [ownerId, range.start, range.end]
  )) as FreelancerRecommendation[];
}
