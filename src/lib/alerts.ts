import { sql } from '@/lib/db';
import {
  DEFAULT_ALERT_SETTINGS,
  countAlerts,
  type AlertLevel,
  type AlertSettings,
  type ProjectAlert,
} from '@/lib/alerts-shared';

export { DEFAULT_ALERT_SETTINGS, countAlerts };
export type { AlertLevel, AlertSettings, ProjectAlert };

// ── Ustawienia progow ─────────────────────────────────────────────────────────

export async function loadAlertSettings(): Promise<AlertSettings> {
  const rows = (await sql`
    SELECT stage_critical_days, prio1_critical_days, idle_critical_days
    FROM alert_settings
    WHERE id = 1
    LIMIT 1
  `) as AlertSettings[];
  const r = rows[0];
  if (!r) return { ...DEFAULT_ALERT_SETTINGS };
  return {
    stage_critical_days: Number(r.stage_critical_days),
    prio1_critical_days: Number(r.prio1_critical_days),
    idle_critical_days: Number(r.idle_critical_days),
  };
}

// ── Wspolne fragmenty SQL ─────────────────────────────────────────────────────

// Ostatnia aktywnosc projektu (DATE) =
// GREATEST(projects.updated_at, MAX(project_stages.done_at), MAX(funnel_snapshots.snapshot_date)).
// `p` = alias tabeli projects w zapytaniu.
export function lastActivitySql(p: string): string {
  return `GREATEST(
    ${p}.updated_at::date,
    (SELECT MAX(las.done_at) FROM project_stages las WHERE las.project_id = ${p}.id),
    (SELECT MAX(lfs.snapshot_date) FROM funnel_snapshots lfs WHERE lfs.project_id = ${p}.id)
  )`;
}

// Etap "rownolegly": otwarty, po terminie, ale istnieje pozniejszy (wyzsza position)
// etap tego samego projektu juz zamkniety. `ps` = alias tabeli project_stages.
export function isParallelStageSql(ps: string): string {
  return `(
    ${ps}.done_at IS NULL
    AND ${ps}.deadline < CURRENT_DATE
    AND EXISTS (
      SELECT 1 FROM project_stages lat
      WHERE lat.project_id = ${ps}.project_id
        AND lat.position > ${ps}.position
        AND lat.done_at IS NOT NULL
    )
  )`;
}

// ── Klasyfikacja ──────────────────────────────────────────────────────────────

type ClassifyRow = {
  project_id: string;
  title: string;
  owner_id: string;
  owner_name: string;
  client_name: string;
  priority_score: number;
  overdue_stages: number;
  parallel_stages: number;
  max_days_over: number;
  idle_days: number | null;
};

const LEVEL_ORDER: Record<AlertLevel, number> = { critical: 0, warning: 1, parallel: 2 };

function etapy(n: number): string {
  return n === 1 ? 'etap' : n >= 2 && n <= 4 ? 'etapy' : 'etapow';
}

export async function classifyProjects(
  settings: AlertSettings,
  opts: { ownerId?: string | null } = {}
): Promise<ProjectAlert[]> {
  const ownerId = opts.ownerId ?? null;

  const rows = (await sql.query(
    `WITH base AS (
       SELECT p.id, p.title, p.owner_id, u.name AS owner_name, c.name AS client_name,
              (c.priority_class * pt.priority_class)::int AS priority_score,
              (CURRENT_DATE - ${lastActivitySql('p')})::int AS idle_days
       FROM projects p
       JOIN result_statuses rs ON rs.id = p.status_id
       JOIN clients c ON c.id = p.client_id
       JOIN project_types pt ON pt.id = p.project_type_id
       JOIN users u ON u.id = p.owner_id
       WHERE p.closed_at IS NULL
         AND p.is_archived = FALSE
         AND p.disable_stages = FALSE
         AND rs.name ILIKE 'aktywny'
         AND ($1::uuid IS NULL OR p.owner_id = $1::uuid)
     ),
     stage_flags AS (
       SELECT ps.project_id,
              (CURRENT_DATE - ps.deadline)::int AS days_over,
              ${isParallelStageSql('ps')} AS is_parallel
       FROM project_stages ps
       JOIN base b ON b.id = ps.project_id
       WHERE ps.done_at IS NULL AND ps.deadline < CURRENT_DATE
     ),
     stage_agg AS (
       SELECT project_id,
              COUNT(*) FILTER (WHERE NOT is_parallel)::int AS overdue_stages,
              COUNT(*) FILTER (WHERE is_parallel)::int AS parallel_stages,
              COALESCE(MAX(days_over) FILTER (WHERE NOT is_parallel), 0)::int AS max_days_over
       FROM stage_flags
       GROUP BY project_id
     )
     SELECT b.id AS project_id, b.title, b.owner_id, b.owner_name, b.client_name,
            b.priority_score, b.idle_days,
            COALESCE(sa.overdue_stages, 0) AS overdue_stages,
            COALESCE(sa.parallel_stages, 0) AS parallel_stages,
            COALESCE(sa.max_days_over, 0) AS max_days_over
     FROM base b
     LEFT JOIN stage_agg sa ON sa.project_id = b.id`,
    [ownerId]
  )) as ClassifyRow[];

  const result: ProjectAlert[] = [];

  for (const r of rows) {
    const score = Number(r.priority_score);
    const overdue = Number(r.overdue_stages);
    const parallel = Number(r.parallel_stages);
    const maxOver = Number(r.max_days_over);
    const idle = r.idle_days === null ? 0 : Number(r.idle_days);

    const reasons: string[] = [];
    let critical = false;

    if (maxOver > settings.stage_critical_days) {
      critical = true;
      reasons.push(`Etap ${maxOver} dni po terminie (prog ${settings.stage_critical_days})`);
    } else if (score === 1 && maxOver > settings.prio1_critical_days) {
      critical = true;
      reasons.push(
        `Priorytet 1: etap ${maxOver} dni po terminie (prog ${settings.prio1_critical_days})`
      );
    }
    if (idle > settings.idle_critical_days) {
      critical = true;
      reasons.push(`Brak aktywnosci od ${idle} dni (prog ${settings.idle_critical_days})`);
    }

    let level: AlertLevel | null = null;
    if (critical) level = 'critical';
    else if (overdue > 0) level = 'warning';
    else if (parallel > 0) level = 'parallel';
    if (!level) continue;

    if (overdue > 0) {
      reasons.push(`${overdue} ${etapy(overdue)} po terminie (max ${maxOver} dni)`);
    }
    if (parallel > 0) {
      reasons.push(`${parallel} ${etapy(parallel)} w toku rownolegle`);
    }

    result.push({
      project_id: r.project_id,
      title: r.title,
      owner_id: r.owner_id,
      owner_name: r.owner_name,
      client_name: r.client_name,
      priority_score: score,
      level,
      overdue_stages: overdue,
      parallel_stages: parallel,
      max_days_over: maxOver,
      idle_days: idle,
      reasons,
    });
  }

  result.sort(
    (a, b) =>
      LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level] ||
      b.max_days_over - a.max_days_over ||
      b.idle_days - a.idle_days ||
      a.priority_score - b.priority_score ||
      a.title.localeCompare(b.title)
  );

  return result;
}
