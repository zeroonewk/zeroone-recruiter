import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { sql } from '@/lib/db';
import { toDateString } from '@/lib/dates';
import { normalizeFunnel } from '@/lib/funnel';
import AppShell from '@/components/layout/AppShell';
import DashboardClient from '@/components/dashboard/DashboardClient';
import type { DashboardData, Period } from '@/components/dashboard/DashboardClient';

// ── Raw row types (Neon returns Date objects for date columns) ─────────────────

type RedProjectRaw = {
  id: string;
  title: string;
  client_name: string;
  owner_name: string;
  stage_name: string;
  stage_deadline: unknown;
  days_overdue: number;
};

type WorkloadRow = { id: string; name: string; active_count: number };
type StageOverviewRow = { stage_name: string; position: number; project_count: number };
type PointTotalRow = { total: number };
type PointRankingRow = { id: string; name: string; points: number };
type PerfAvgRow = { avg_days: number | null };
type PerfCountRow = { success: number; total: number };
type SplitTypeRow = { id: string; name: string; count: number };
type SplitStatusRow = { id: string; name: string; color: string; count: number };
type ActiveTotalRow = { total_points: number; total_count: number };

// ── Helpers ───────────────────────────────────────────────────────────────────

// SQL fragment reused across prev_month queries
const PREV_MONTH_START = `date_trunc('month', NOW() - INTERVAL '1 month')`;
const PREV_MONTH_END   = `date_trunc('month', NOW())`;

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await getSession();
  if (!session) redirect('/zaloguj');

  const sp = await searchParams;
  const okres = typeof sp.okres === 'string' ? sp.okres : '';
  const period: Period =
    okres === 'kwartal'           ? 'quarter'    :
    okres === 'rok'               ? 'year'       :
    okres === 'wszystko'          ? 'all'        :
    okres === 'poprzedni_miesiac' ? 'prev_month' :
    'month';

  // date_trunc unit for month / quarter / year (not used for all / prev_month)
  const truncUnit = (period !== 'all' && period !== 'prev_month') ? period : null;

  const isPrevMonth = period === 'prev_month';

  // ── Period-dependent query groups ──────────────────────────────────────────

  // Points + ranking
  const pointsPromise = truncUnit
    ? Promise.all([
        sql.query(
          `SELECT (COALESCE(SUM(points), 0))::int AS total
           FROM point_transactions
           WHERE awarded_at >= date_trunc($1, NOW())`,
          [truncUnit]
        ),
        sql.query(
          `SELECT u.id, u.name, (COALESCE(SUM(pt.points), 0))::int AS points
           FROM users u
           LEFT JOIN point_transactions pt
             ON pt.user_id = u.id AND pt.awarded_at >= date_trunc($1, NOW())
           WHERE u.is_active = TRUE
           GROUP BY u.id, u.name
           HAVING (COALESCE(SUM(pt.points), 0)) > 0
           ORDER BY points DESC
           LIMIT 10`,
          [truncUnit]
        ),
      ])
    : isPrevMonth
    ? Promise.all([
        sql.query(
          `SELECT (COALESCE(SUM(points), 0))::int AS total
           FROM point_transactions
           WHERE awarded_at >= ${PREV_MONTH_START}
             AND awarded_at < ${PREV_MONTH_END}`,
          []
        ),
        sql.query(
          `SELECT u.id, u.name, (COALESCE(SUM(pt.points), 0))::int AS points
           FROM users u
           LEFT JOIN point_transactions pt
             ON pt.user_id = u.id
             AND pt.awarded_at >= ${PREV_MONTH_START}
             AND pt.awarded_at < ${PREV_MONTH_END}
           WHERE u.is_active = TRUE
           GROUP BY u.id, u.name
           HAVING (COALESCE(SUM(pt.points), 0)) > 0
           ORDER BY points DESC
           LIMIT 10`,
          []
        ),
      ])
    : Promise.all([
        sql`SELECT (COALESCE(SUM(points), 0))::int AS total FROM point_transactions`,
        sql`
          SELECT u.id, u.name, (COALESCE(SUM(pt.points), 0))::int AS points
          FROM users u
          LEFT JOIN point_transactions pt ON pt.user_id = u.id
          WHERE u.is_active = TRUE
          GROUP BY u.id, u.name
          HAVING (COALESCE(SUM(pt.points), 0)) > 0
          ORDER BY points DESC
          LIMIT 10
        `,
      ]);

  // Performance: avg days + success rate
  const perfPromise = truncUnit
    ? Promise.all([
        sql.query(
          `SELECT AVG(p.closed_at - p.opened_at)::int AS avg_days
           FROM projects p
           JOIN result_statuses rs ON rs.id = p.status_id
           WHERE p.closed_at IS NOT NULL AND rs.is_success = TRUE
             AND p.closed_at >= date_trunc($1, NOW())`,
          [truncUnit]
        ),
        sql.query(
          `SELECT (COUNT(*) FILTER (WHERE rs.is_success = TRUE))::int AS success,
                  (COUNT(*))::int AS total
           FROM projects p
           JOIN result_statuses rs ON rs.id = p.status_id
           WHERE p.closed_at IS NOT NULL
             AND p.closed_at >= date_trunc($1, NOW())`,
          [truncUnit]
        ),
      ])
    : isPrevMonth
    ? Promise.all([
        sql.query(
          `SELECT AVG(p.closed_at - p.opened_at)::int AS avg_days
           FROM projects p
           JOIN result_statuses rs ON rs.id = p.status_id
           WHERE p.closed_at IS NOT NULL AND rs.is_success = TRUE
             AND p.closed_at >= ${PREV_MONTH_START}
             AND p.closed_at < ${PREV_MONTH_END}`,
          []
        ),
        sql.query(
          `SELECT (COUNT(*) FILTER (WHERE rs.is_success = TRUE))::int AS success,
                  (COUNT(*))::int AS total
           FROM projects p
           JOIN result_statuses rs ON rs.id = p.status_id
           WHERE p.closed_at IS NOT NULL
             AND p.closed_at >= ${PREV_MONTH_START}
             AND p.closed_at < ${PREV_MONTH_END}`,
          []
        ),
      ])
    : Promise.all([
        sql`
          SELECT AVG(p.closed_at - p.opened_at)::int AS avg_days
          FROM projects p
          JOIN result_statuses rs ON rs.id = p.status_id
          WHERE p.closed_at IS NOT NULL AND rs.is_success = TRUE
        `,
        sql`
          SELECT (COUNT(*) FILTER (WHERE rs.is_success = TRUE))::int AS success,
                 (COUNT(*))::int AS total
          FROM projects p
          JOIN result_statuses rs ON rs.id = p.status_id
          WHERE p.closed_at IS NOT NULL
        `,
      ]);

  // Workload: active projects per owner
  // prev_month: projects opened in previous month per owner
  const workloadPromise = isPrevMonth
    ? sql.query(
        `SELECT u.id, u.name, COUNT(p.id)::int AS active_count
         FROM users u
         LEFT JOIN projects p ON p.owner_id = u.id
           AND p.is_archived = FALSE
           AND p.opened_at >= ${PREV_MONTH_START}
           AND p.opened_at < ${PREV_MONTH_END}
         WHERE u.is_active = TRUE
         GROUP BY u.id, u.name
         HAVING COUNT(p.id) > 0
         ORDER BY active_count DESC`,
        []
      )
    : sql`
        SELECT u.id, u.name, COUNT(p.id)::int AS active_count
        FROM users u
        LEFT JOIN projects p ON p.owner_id = u.id
          AND p.is_archived = FALSE
          AND p.status_id IN (SELECT id FROM result_statuses WHERE is_success = FALSE)
        WHERE u.is_active = TRUE
        GROUP BY u.id, u.name
        HAVING COUNT(p.id) > 0
        ORDER BY active_count DESC
      `;

  // Stages overview: active projects per current stage
  // prev_month: stages whose deadline fell in the previous month
  const stagesPromise = isPrevMonth
    ? sql.query(
        `SELECT cur_stage.name AS stage_name, cur_stage.position, COUNT(*)::int AS project_count
         FROM projects p
         JOIN result_statuses rs ON rs.id = p.status_id
         JOIN LATERAL (
           SELECT name, position
           FROM project_stages
           WHERE project_id = p.id
             AND done_at IS NULL
             AND deadline >= ${PREV_MONTH_START}
             AND deadline < ${PREV_MONTH_END}
           ORDER BY position ASC
           LIMIT 1
         ) cur_stage ON true
         WHERE p.is_archived = FALSE AND rs.is_success = FALSE
         GROUP BY cur_stage.name, cur_stage.position
         ORDER BY cur_stage.position ASC`,
        []
      )
    : sql`
        SELECT cur_stage.name AS stage_name, cur_stage.position, COUNT(*)::int AS project_count
        FROM projects p
        JOIN result_statuses rs ON rs.id = p.status_id
        JOIN LATERAL (
          SELECT name, position
          FROM project_stages
          WHERE project_id = p.id AND done_at IS NULL
          ORDER BY position ASC
          LIMIT 1
        ) cur_stage ON true
        WHERE p.is_archived = FALSE AND rs.is_success = FALSE
        GROUP BY cur_stage.name, cur_stage.position
        ORDER BY cur_stage.position ASC
      `;

  // Split: per type and per status
  // prev_month: projects opened in previous month
  const splitPromise = isPrevMonth
    ? Promise.all([
        sql.query(
          `SELECT pt.id, pt.name, COUNT(p.id)::int AS count
           FROM project_types pt
           LEFT JOIN projects p ON p.project_type_id = pt.id
             AND p.is_archived = FALSE
             AND p.opened_at >= ${PREV_MONTH_START}
             AND p.opened_at < ${PREV_MONTH_END}
           WHERE pt.is_archived = FALSE
           GROUP BY pt.id, pt.name
           HAVING COUNT(p.id) > 0
           ORDER BY count DESC`,
          []
        ),
        sql.query(
          `SELECT rs.id, rs.name, rs.color, COUNT(p.id)::int AS count
           FROM result_statuses rs
           LEFT JOIN projects p ON p.status_id = rs.id
             AND p.is_archived = FALSE
             AND p.opened_at >= ${PREV_MONTH_START}
             AND p.opened_at < ${PREV_MONTH_END}
           WHERE rs.is_archived = FALSE
           GROUP BY rs.id, rs.name, rs.color
           HAVING COUNT(p.id) > 0
           ORDER BY rs.position ASC`,
          []
        ),
      ])
    : Promise.all([
        sql`
          SELECT pt.id, pt.name, COUNT(p.id)::int AS count
          FROM project_types pt
          LEFT JOIN projects p ON p.project_type_id = pt.id AND p.is_archived = FALSE
          WHERE pt.is_archived = FALSE
          GROUP BY pt.id, pt.name
          HAVING COUNT(p.id) > 0
          ORDER BY count DESC
        `,
        sql`
          SELECT rs.id, rs.name, rs.color, COUNT(p.id)::int AS count
          FROM result_statuses rs
          LEFT JOIN projects p ON p.status_id = rs.id AND p.is_archived = FALSE
          WHERE rs.is_archived = FALSE
          GROUP BY rs.id, rs.name, rs.color
          HAVING COUNT(p.id) > 0
          ORDER BY rs.position ASC
        `,
      ]);

  // Active pipeline totals
  // prev_month: projects opened in previous month
  const activeTotalPromise = isPrevMonth
    ? sql.query(
        `SELECT
           COALESCE(SUM(p.points), 0)::int AS total_points,
           COUNT(p.id)::int AS total_count
         FROM projects p
         WHERE p.is_archived = FALSE
           AND p.opened_at >= ${PREV_MONTH_START}
           AND p.opened_at < ${PREV_MONTH_END}`,
        []
      )
    : sql`
        SELECT
          COALESCE(SUM(p.points), 0)::int AS total_points,
          COUNT(p.id)::int AS total_count
        FROM projects p
        JOIN result_statuses rs ON rs.id = p.status_id
        WHERE p.is_archived = FALSE AND rs.is_success = FALSE
      `;

  // Funnel totals
  // prev_month: projects opened in previous month
  const funnelPromise = isPrevMonth
    ? sql.query(
        `SELECT
           COALESCE(SUM((funnel->>'sourcing')::int), 0)::int AS sourcing,
           COALESCE(SUM((funnel->>'screening')::int), 0)::int AS screening,
           COALESCE(SUM((funnel->>'weryfikacja')::int), 0)::int AS weryfikacja,
           COALESCE(SUM((funnel->>'rekomendacje')::int), 0)::int AS rekomendacje,
           COALESCE(SUM((funnel->>'spotkania')::int), 0)::int AS spotkania,
           COALESCE(SUM((funnel->>'oferta')::int), 0)::int AS oferta,
           COALESCE(SUM((funnel->>'zatrudnienie')::int), 0)::int AS zatrudnienie
         FROM projects p
         WHERE p.is_archived = FALSE
           AND p.opened_at >= ${PREV_MONTH_START}
           AND p.opened_at < ${PREV_MONTH_END}`,
        []
      )
    : sql`
        SELECT
          COALESCE(SUM((funnel->>'sourcing')::int), 0)::int AS sourcing,
          COALESCE(SUM((funnel->>'screening')::int), 0)::int AS screening,
          COALESCE(SUM((funnel->>'weryfikacja')::int), 0)::int AS weryfikacja,
          COALESCE(SUM((funnel->>'rekomendacje')::int), 0)::int AS rekomendacje,
          COALESCE(SUM((funnel->>'spotkania')::int), 0)::int AS spotkania,
          COALESCE(SUM((funnel->>'oferta')::int), 0)::int AS oferta,
          COALESCE(SUM((funnel->>'zatrudnienie')::int), 0)::int AS zatrudnienie
        FROM projects p
        JOIN result_statuses rs ON rs.id = p.status_id
        WHERE p.is_archived = FALSE AND rs.is_success = FALSE
      `;

  // Freelancer project count
  // prev_month: projects opened in previous month with at least one freelancer
  const freelancerCountPromise = isPrevMonth
    ? sql.query(
        `SELECT COUNT(DISTINCT p.id)::int AS count
         FROM projects p
         WHERE p.is_archived = FALSE
           AND p.opened_at >= ${PREV_MONTH_START}
           AND p.opened_at < ${PREV_MONTH_END}
           AND EXISTS (SELECT 1 FROM project_freelancers pf WHERE pf.project_id = p.id)`,
        []
      )
    : sql`
        SELECT COUNT(DISTINCT p.id)::int AS count
        FROM projects p
        JOIN result_statuses rs ON rs.id = p.status_id
        WHERE p.closed_at IS NULL
          AND rs.is_success = FALSE
          AND EXISTS (SELECT 1 FROM project_freelancers pf WHERE pf.project_id = p.id)
      `;

  // ── Outer Promise.all ──────────────────────────────────────────────────────

  const [
    redRaw,
    workloadRaw,
    stagesRaw,
    pointsResult,
    perfResult,
    splitResult,
    activeTotalRaw,
    funnelTotalsRaw,
    freelancerCountRaw,
  ] = await Promise.all([
    // Red (overdue) projects — operational, always current state
    sql`
      SELECT
        p.id, p.title, c.name AS client_name, u.name AS owner_name,
        cur_stage.name AS stage_name, cur_stage.deadline AS stage_deadline,
        (CURRENT_DATE - cur_stage.deadline)::int AS days_overdue
      FROM projects p
      JOIN clients c ON c.id = p.client_id
      JOIN users u ON u.id = p.owner_id
      JOIN result_statuses rs ON rs.id = p.status_id
      JOIN LATERAL (
        SELECT name, deadline
        FROM project_stages
        WHERE project_id = p.id
          AND done_at IS NULL
          AND deadline < CURRENT_DATE
        ORDER BY deadline ASC
        LIMIT 1
      ) cur_stage ON true
      WHERE p.is_archived = FALSE
        AND rs.is_success = FALSE
      ORDER BY cur_stage.deadline ASC
      LIMIT 100
    `,
    workloadPromise,
    stagesPromise,
    pointsPromise,
    perfPromise,
    splitPromise,
    activeTotalPromise,
    funnelPromise,
    freelancerCountPromise,
  ]);

  // ── Process results ────────────────────────────────────────────────────────

  const redRows = redRaw as RedProjectRaw[];
  const redProjects = {
    total: redRows.length,
    items: redRows.slice(0, 3).map((r) => ({
      id: r.id,
      title: r.title,
      client_name: r.client_name,
      owner_name: r.owner_name,
      stage_name: r.stage_name,
      stage_deadline: toDateString(r.stage_deadline) ?? '',
      days_overdue: r.days_overdue,
    })),
  };

  const ptTotalRaw = pointsResult[0] as PointTotalRow[];
  const ptRankingRaw = pointsResult[1] as PointRankingRow[];

  const perfAvgRaw = perfResult[0] as PerfAvgRow[];
  const perfCountRaw = perfResult[1] as PerfCountRow[];

  const splitTypesRaw = splitResult[0] as SplitTypeRow[];
  const splitStatusesRaw = splitResult[1] as SplitStatusRow[];
  const activeTotalRow = (activeTotalRaw as ActiveTotalRow[])[0];
  const funnelTotals = normalizeFunnel((funnelTotalsRaw as unknown[])[0]);
  const freelancerProjectCount = ((freelancerCountRaw as { count: number }[])[0]?.count) ?? 0;

  const initialData: DashboardData = {
    redProjects,
    workload: workloadRaw as WorkloadRow[],
    freelancerProjectCount,
    stagesOverview: stagesRaw as StageOverviewRow[],
    points: {
      total: ptTotalRaw[0]?.total ?? 0,
      ranking: ptRankingRaw,
    },
    performance: {
      avg_days: perfAvgRaw[0]?.avg_days ?? null,
      success_count: perfCountRaw[0]?.success ?? 0,
      total_count: perfCountRaw[0]?.total ?? 0,
    },
    split: {
      types: splitTypesRaw,
      statuses: splitStatusesRaw,
      active_total: {
        points: activeTotalRow?.total_points ?? 0,
        count: activeTotalRow?.total_count ?? 0,
      },
    },
    funnelTotals,
  };

  return (
    <AppShell user={{ name: session.name, email: session.email, role: session.role }}>
      <DashboardClient initialData={initialData} period={period} />
    </AppShell>
  );
}
