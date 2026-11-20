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
};

export const EMPTY_PERIOD_NUMBERS: PeriodNumbers = {
  stages_closed: 0,
  success_count: 0,
  success_points: 0,
  new_projects: 0,
  freelancer_recs: 0,
  freelancer_meetings: 0,
};

// Kandydaci freelancerow (is_external) w projektach rekrutera. Filtr dat dokladany osobno:
// kazde zdarzenie (zgloszenie, Etap 1, Etap 2) liczone wg wlasnej daty.
const FREELANCER_CANDIDATES_BASE = `
  FROM freelancer_candidates fc
  JOIN users u ON u.id = fc.user_id
  JOIN projects p ON p.id = fc.project_id
  WHERE u.is_external = TRUE
    AND ($1::uuid IS NULL OR p.owner_id = $1::uuid)`;

const IN_RANGE = (expr: string) => `${expr} BETWEEN $2::date AND $3::date`;
const SUBMITTED_IN_RANGE = IN_RANGE('fc.created_at::date');
const STAGE1_IN_RANGE = IN_RANGE('fc.stage1_at');
const STAGE2_IN_RANGE = IN_RANGE('fc.stage2_at');

export async function fetchPeriodNumbers(ownerId: string | null, range: DateRange): Promise<PeriodNumbers> {
  const rows = (await sql.query(
    `SELECT
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
       (SELECT COUNT(*)::int ${FREELANCER_CANDIDATES_BASE}
          AND ${SUBMITTED_IN_RANGE}) AS freelancer_recs,
       (SELECT COUNT(*)::int ${FREELANCER_CANDIDATES_BASE}
          AND ${STAGE2_IN_RANGE}) AS freelancer_meetings`,
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
};

export async function fetchFreelancerRecommendations(
  ownerId: string | null,
  range: DateRange
): Promise<FreelancerRecommendation[]> {
  return (await sql.query(
    `SELECT
       u.id AS user_id,
       u.name,
       COUNT(*) FILTER (WHERE ${SUBMITTED_IN_RANGE})::int AS submitted,
       COUNT(*) FILTER (WHERE ${STAGE1_IN_RANGE})::int AS accepted,
       COUNT(*) FILTER (WHERE ${STAGE2_IN_RANGE})::int AS meetings
     ${FREELANCER_CANDIDATES_BASE}
       AND (${SUBMITTED_IN_RANGE} OR ${STAGE1_IN_RANGE} OR ${STAGE2_IN_RANGE})
     GROUP BY u.id, u.name
     ORDER BY submitted DESC, accepted DESC, meetings DESC, u.name ASC`,
    [ownerId, range.start, range.end]
  )) as FreelancerRecommendation[];
}
