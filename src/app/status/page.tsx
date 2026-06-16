export const dynamic = 'force-dynamic';

import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { sql } from '@/lib/db';
import { toDateString } from '@/lib/dates';
import { getDateRange } from '@/lib/date-ranges';
import { normalizeFunnel, FUNNEL_LEVELS } from '@/lib/funnel';
import AppShell from '@/components/layout/AppShell';
import StatusMeetingClient from '@/components/status/StatusMeetingClient';
import type {
  ClosedStage,
  ClosedProject,
  NewProject,
  FunnelDelta,
  OverdueStage,
  UpcomingStage,
  InactiveProject,
  StatusNumbers,
} from '@/components/status/StatusMeetingClient';
import type { PeriodKey } from '@/lib/date-ranges';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ── Raw row types ─────────────────────────────────────────────────────────────

type ClosedStageRaw = {
  id: string;
  stage_name: string;
  done_at: unknown;
  project_id: string;
  project_title: string;
  client_name: string;
  owner_id: string;
  owner_name: string;
};

type ClosedProjectRaw = {
  id: string;
  title: string;
  client_name: string;
  owner_name: string;
  status_name: string;
  is_success: boolean;
  closed_at: unknown;
  points: number;
};

type NewProjectRaw = {
  id: string;
  title: string;
  client_name: string;
  owner_name: string;
  opened_at: unknown;
  points: number;
};

type FunnelDeltaRaw = {
  id: string;
  title: string;
  client_name: string;
  owner_name: string;
  end_funnel: unknown;
  start_funnel: unknown;
};

type OverdueStageRaw = {
  id: string;
  stage_name: string;
  deadline: unknown;
  days_overdue: number;
  project_id: string;
  project_title: string;
  client_name: string;
  owner_name: string;
};

type UpcomingStageRaw = {
  id: string;
  stage_name: string;
  deadline: unknown;
  days_until: number;
  project_id: string;
  project_title: string;
  client_name: string;
  owner_name: string;
};

type InactiveProjectRaw = {
  id: string;
  title: string;
  client_name: string;
  owner_name: string;
  updated_at: unknown;
  opened_at: unknown;
};

type UserRow = { id: string; name: string };

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function StatusPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await getSession();
  if (!session) redirect('/zaloguj');

  const sp = await searchParams;

  // Parse period
  const rawOkres = typeof sp.okres === 'string' ? sp.okres : '';
  const period: PeriodKey =
    rawOkres === 'today' ? 'today' :
    rawOkres === 'last_week' ? 'last_week' :
    rawOkres === 'custom' ? 'custom' :
    'this_week';

  // Parse custom dates
  const customOd = typeof sp.od === 'string' ? sp.od : undefined;
  const customDo = typeof sp.do === 'string' ? sp.do : undefined;

  // Compute date range
  const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
  let range = getDateRange(period, customOd, customDo);
  if (!DATE_RE.test(range.start) || !DATE_RE.test(range.end)) {
    const today = new Date();
    const todayStr = today.toISOString().slice(0, 10);
    const sevenDaysAgo = new Date(today);
    sevenDaysAgo.setDate(today.getDate() - 7);
    range = { start: sevenDaysAgo.toISOString().slice(0, 10), end: todayStr };
  }
  const { start, end } = range;

  // Parse recruiter filter
  const rawRekruter = typeof sp.rekruter === 'string' ? sp.rekruter : 'all';
  const selectedUserId: string =
    rawRekruter === 'me' ? 'me' :
    rawRekruter === 'all' ? 'all' :
    UUID_RE.test(rawRekruter) ? rawRekruter :
    'all';

  const userId: string | null =
    selectedUserId === 'me' ? session.sub :
    selectedUserId === 'all' ? null :
    selectedUserId;

  // ── Queries ──────────────────────────────────────────────────────────────

  const [
    closedStagesRaw,
    closedProjectsRaw,
    newProjectsRaw,
    funnelDeltaRaw,
    overdueRaw,
    upcomingRaw,
    inactiveRaw,
    numbersRaw,
    usersRaw,
  ] = await Promise.all([

    // Etapy zamkniete w okresie
    sql.query(
      `SELECT
        ps.id, ps.name AS stage_name, ps.done_at,
        p.id AS project_id, p.title AS project_title,
        c.name AS client_name,
        u.id AS owner_id, u.name AS owner_name
       FROM project_stages ps
       JOIN projects p ON p.id = ps.project_id
       JOIN clients c ON c.id = p.client_id
       JOIN users u ON u.id = p.owner_id
       WHERE ps.done_at BETWEEN $2::date AND $3::date
         AND ($1::uuid IS NULL OR p.owner_id = $1::uuid)
       ORDER BY ps.done_at DESC`,
      [userId, start, end]
    ),

    // Projekty zamkniete (closed_at w okresie)
    sql.query(
      `SELECT
        p.id, p.title, c.name AS client_name, u.name AS owner_name,
        rs.name AS status_name, rs.is_success, p.closed_at, p.points
       FROM projects p
       JOIN clients c ON c.id = p.client_id
       JOIN users u ON u.id = p.owner_id
       JOIN result_statuses rs ON rs.id = p.status_id
       WHERE p.closed_at BETWEEN $2::date AND $3::date
         AND ($1::uuid IS NULL OR p.owner_id = $1::uuid)
       ORDER BY p.closed_at DESC`,
      [userId, start, end]
    ),

    // Nowe projekty (opened_at w okresie)
    sql.query(
      `SELECT
        p.id, p.title, c.name AS client_name, u.name AS owner_name,
        p.opened_at, p.points
       FROM projects p
       JOIN clients c ON c.id = p.client_id
       JOIN users u ON u.id = p.owner_id
       WHERE p.opened_at BETWEEN $2::date AND $3::date
         AND ($1::uuid IS NULL OR p.owner_id = $1::uuid)
         AND p.is_archived = FALSE
       ORDER BY p.opened_at DESC`,
      [userId, start, end]
    ),

    // Przyrost lejka — porownaj snapshot na koniec okresu vs poczatek
    sql.query(
      `WITH project_filter AS (
         SELECT p.id, p.title, c.name AS client_name, u.id AS owner_id, u.name AS owner_name
         FROM projects p
         JOIN clients c ON c.id = p.client_id
         JOIN users u ON u.id = p.owner_id
         JOIN result_statuses rs ON rs.id = p.status_id
         WHERE p.is_archived = FALSE
           AND rs.is_success = FALSE
           AND ($1::uuid IS NULL OR p.owner_id = $1::uuid)
       ),
       end_snap AS (
         SELECT DISTINCT ON (project_id) project_id, funnel
         FROM funnel_snapshots
         WHERE snapshot_date <= $3::date
         ORDER BY project_id, snapshot_date DESC
       ),
       start_snap AS (
         SELECT DISTINCT ON (project_id) project_id, funnel
         FROM funnel_snapshots
         WHERE snapshot_date < $2::date
         ORDER BY project_id, snapshot_date DESC
       )
       SELECT
         pf.id, pf.title, pf.client_name, pf.owner_name,
         COALESCE(es.funnel, '{}'::jsonb) AS end_funnel,
         COALESCE(ss.funnel, '{}'::jsonb) AS start_funnel
       FROM project_filter pf
       LEFT JOIN end_snap es ON es.project_id = pf.id
       LEFT JOIN start_snap ss ON ss.project_id = pf.id`,
      [userId, start, end]
    ),

    // Przeterminowane etapy
    sql.query(
      `SELECT
        ps.id, ps.name AS stage_name, ps.deadline,
        (CURRENT_DATE - ps.deadline)::int AS days_overdue,
        p.id AS project_id, p.title AS project_title,
        c.name AS client_name, u.name AS owner_name
       FROM project_stages ps
       JOIN projects p ON p.id = ps.project_id
       JOIN clients c ON c.id = p.client_id
       JOIN users u ON u.id = p.owner_id
       JOIN result_statuses rs ON rs.id = p.status_id
       WHERE ps.done_at IS NULL
         AND ps.deadline < CURRENT_DATE
         AND p.is_archived = FALSE
         AND rs.is_success = FALSE
         AND p.closed_at IS NULL
         AND ($1::uuid IS NULL OR p.owner_id = $1::uuid)
       ORDER BY ps.deadline ASC
       LIMIT 50`,
      [userId]
    ),

    // Zblizajace sie — deadline w ciagu 3 dni
    sql.query(
      `SELECT
        ps.id, ps.name AS stage_name, ps.deadline,
        (ps.deadline - CURRENT_DATE)::int AS days_until,
        p.id AS project_id, p.title AS project_title,
        c.name AS client_name, u.name AS owner_name
       FROM project_stages ps
       JOIN projects p ON p.id = ps.project_id
       JOIN clients c ON c.id = p.client_id
       JOIN users u ON u.id = p.owner_id
       JOIN result_statuses rs ON rs.id = p.status_id
       WHERE ps.done_at IS NULL
         AND ps.deadline BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '3 days'
         AND p.is_archived = FALSE
         AND rs.is_success = FALSE
         AND p.closed_at IS NULL
         AND ($1::uuid IS NULL OR p.owner_id = $1::uuid)
       ORDER BY ps.deadline ASC
       LIMIT 30`,
      [userId]
    ),

    // Projekty bez aktywnosci >7 dni
    sql.query(
      `WITH recent_activity AS (
         SELECT project_id, MAX(done_at) AS last_done
         FROM project_stages
         WHERE done_at >= CURRENT_DATE - INTERVAL '7 days'
         GROUP BY project_id
       )
       SELECT
         p.id, p.title, c.name AS client_name, u.name AS owner_name,
         p.updated_at, p.opened_at
       FROM projects p
       JOIN clients c ON c.id = p.client_id
       JOIN users u ON u.id = p.owner_id
       JOIN result_statuses rs ON rs.id = p.status_id
       LEFT JOIN recent_activity ra ON ra.project_id = p.id
       WHERE p.is_archived = FALSE
         AND rs.is_success = FALSE
         AND p.closed_at IS NULL
         AND p.updated_at < NOW() - INTERVAL '7 days'
         AND ra.last_done IS NULL
         AND ($1::uuid IS NULL OR p.owner_id = $1::uuid)
       ORDER BY p.updated_at ASC
       LIMIT 20`,
      [userId]
    ),

    // Liczby zbiorcze
    sql.query(
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
            AND ($1::uuid IS NULL OR p.owner_id = $1::uuid)) AS new_projects`,
      [userId, start, end]
    ),

    // Lista aktywnych userow do filtra
    sql`SELECT id, name FROM users WHERE is_active = TRUE ORDER BY name ASC`,
  ]);

  // ── Process results ───────────────────────────────────────────────────────

  const closedStages: ClosedStage[] = (closedStagesRaw as ClosedStageRaw[]).map((r) => ({
    id: r.id,
    stage_name: r.stage_name,
    done_at: toDateString(r.done_at) ?? '',
    project_id: r.project_id,
    project_title: r.project_title,
    client_name: r.client_name,
    owner_id: r.owner_id,
    owner_name: r.owner_name,
  }));

  const closedProjects: ClosedProject[] = (closedProjectsRaw as ClosedProjectRaw[]).map((r) => ({
    id: r.id,
    title: r.title,
    client_name: r.client_name,
    owner_name: r.owner_name,
    status_name: r.status_name,
    is_success: r.is_success,
    closed_at: toDateString(r.closed_at) ?? '',
    points: r.points,
  }));

  const newProjects: NewProject[] = (newProjectsRaw as NewProjectRaw[]).map((r) => ({
    id: r.id,
    title: r.title,
    client_name: r.client_name,
    owner_name: r.owner_name,
    opened_at: toDateString(r.opened_at) ?? '',
    points: r.points,
  }));

  // Compute funnel deltas
  const funnelDeltas: FunnelDelta[] = (funnelDeltaRaw as FunnelDeltaRaw[])
    .map((row) => {
      const endFunnel = normalizeFunnel(row.end_funnel);
      const startFunnel = normalizeFunnel(row.start_funnel);
      const deltas: Record<string, number> = {};
      let total_delta = 0;
      for (const lvl of FUNNEL_LEVELS) {
        const delta = endFunnel[lvl.key] - startFunnel[lvl.key];
        deltas[lvl.key] = delta;
        total_delta += delta;
      }
      return {
        project_id: row.id,
        project_title: row.title,
        client_name: row.client_name,
        owner_name: row.owner_name,
        deltas,
        total_delta,
      };
    })
    .filter((d) => d.total_delta > 0)
    .sort((a, b) => b.total_delta - a.total_delta);

  const overdueStages: OverdueStage[] = (overdueRaw as OverdueStageRaw[]).map((r) => ({
    id: r.id,
    stage_name: r.stage_name,
    deadline: toDateString(r.deadline) ?? '',
    days_overdue: r.days_overdue,
    project_id: r.project_id,
    project_title: r.project_title,
    client_name: r.client_name,
    owner_name: r.owner_name,
  }));

  const upcomingStages: UpcomingStage[] = (upcomingRaw as UpcomingStageRaw[]).map((r) => ({
    id: r.id,
    stage_name: r.stage_name,
    deadline: toDateString(r.deadline) ?? '',
    days_until: r.days_until,
    project_id: r.project_id,
    project_title: r.project_title,
    client_name: r.client_name,
    owner_name: r.owner_name,
  }));

  const inactiveProjects: InactiveProject[] = (inactiveRaw as InactiveProjectRaw[]).map((r) => ({
    id: r.id,
    title: r.title,
    client_name: r.client_name,
    owner_name: r.owner_name,
    updated_at: toDateString(r.updated_at),
    opened_at: toDateString(r.opened_at) ?? '',
  }));

  const numbersRow = (numbersRaw as StatusNumbers[])[0] ?? {
    stages_closed: 0,
    success_count: 0,
    success_points: 0,
    new_projects: 0,
  };

  return (
    <AppShell user={{ name: session.name, email: session.email, role: session.role }}>
      <StatusMeetingClient
        initialData={{
          closedStages,
          closedProjects,
          newProjects,
          funnelDeltas,
          overdueStages,
          upcomingStages,
          inactiveProjects,
          numbers: numbersRow,
        }}
        availableUsers={usersRaw as UserRow[]}
        selectedPeriod={period}
        selectedUserId={selectedUserId}
        customRange={
          period === 'custom' && customOd && customDo
            ? { od: customOd, do: customDo }
            : undefined
        }
        currentUserId={session.sub}
        range={range}
      />
    </AppShell>
  );
}
