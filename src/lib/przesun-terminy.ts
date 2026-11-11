import { sql } from '@/lib/db';
import { toDateString } from '@/lib/dates';

// Jednorazowa akcja admina: przesuniecie zaleglych terminow etapow.
// Dla kazdego aktywnego projektu z zaleglymi otwartymi etapami:
//   shift = CURRENT_DATE - MIN(deadline zaleglych otwartych etapow)
// i wszystkie otwarte etapy (done_at IS NULL) przesuwane sa o shift dni.
// original_deadline nie jest modyfikowany.

export type ShiftStage = {
  stage_id: string;
  stage_name: string;
  old_deadline: string | null;
  new_deadline: string | null;
};

export type ShiftProject = {
  project_id: string;
  title: string;
  owner_name: string | null;
  shift: number;
  stages: ShiftStage[];
};

// CTE wspolne dla podgladu i zapisu. $1 = uuid[] lub NULL (wszystkie).
const SHIFTS_CTE = `
  WITH eligible AS (
    SELECT p.id, p.title, u.name AS owner_name
    FROM projects p
    JOIN result_statuses rs ON rs.id = p.status_id
    LEFT JOIN users u ON u.id = p.owner_id
    WHERE p.closed_at IS NULL
      AND p.is_archived = FALSE
      AND p.disable_stages = FALSE
      AND rs.name ILIKE 'aktywny'
      AND ($1::uuid[] IS NULL OR p.id = ANY($1::uuid[]))
  ),
  shifts AS (
    SELECT ps.project_id, (CURRENT_DATE - MIN(ps.deadline))::int AS shift
    FROM project_stages ps
    JOIN eligible e ON e.id = ps.project_id
    WHERE ps.done_at IS NULL
      AND ps.deadline IS NOT NULL
      AND ps.deadline < CURRENT_DATE
    GROUP BY ps.project_id
  )
`;

export async function computeShiftPreview(projectIds: string[] | null = null): Promise<ShiftProject[]> {
  const rows = (await sql.query(
    `${SHIFTS_CTE}
     SELECT e.id AS project_id, e.title, e.owner_name, s.shift,
            ps.id AS stage_id, ps.name AS stage_name,
            ps.deadline::text AS old_deadline,
            (ps.deadline + s.shift)::text AS new_deadline
     FROM shifts s
     JOIN eligible e ON e.id = s.project_id
     JOIN project_stages ps ON ps.project_id = s.project_id AND ps.done_at IS NULL
     ORDER BY s.shift DESC, e.title ASC, ps.position ASC`,
    [projectIds]
  )) as {
    project_id: string;
    title: string;
    owner_name: string | null;
    shift: number;
    stage_id: string;
    stage_name: string;
    old_deadline: unknown;
    new_deadline: unknown;
  }[];

  const byId = new Map<string, ShiftProject>();
  const result: ShiftProject[] = [];
  for (const r of rows) {
    let project = byId.get(r.project_id);
    if (!project) {
      project = {
        project_id: r.project_id,
        title: r.title,
        owner_name: r.owner_name,
        shift: Number(r.shift),
        stages: [],
      };
      byId.set(r.project_id, project);
      result.push(project);
    }
    project.stages.push({
      stage_id: r.stage_id,
      stage_name: r.stage_name,
      old_deadline: toDateString(r.old_deadline),
      new_deadline: toDateString(r.new_deadline),
    });
  }
  return result;
}

// Przelicza na serwerze od nowa i wykonuje UPDATE w jednej transakcji.
export async function applyShift(
  projectIds: string[] | null
): Promise<{ projects: number; stages: number }> {
  const results = await sql.transaction([
    sql.query(
      `${SHIFTS_CTE}
       UPDATE project_stages ps
       SET deadline = ps.deadline + s.shift
       FROM shifts s
       WHERE ps.project_id = s.project_id
         AND ps.done_at IS NULL
         AND ps.deadline IS NOT NULL
       RETURNING ps.project_id`,
      [projectIds]
    ),
  ]);
  const updated = (results[0] ?? []) as { project_id: string }[];
  return {
    projects: new Set(updated.map((r) => r.project_id)).size,
    stages: updated.length,
  };
}
