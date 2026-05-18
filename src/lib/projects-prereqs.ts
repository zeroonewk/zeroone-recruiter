import { sql } from '@/lib/db';

type PrereqRow = {
  clients_n: number;
  types_n: number;
  statuses_n: number;
  stages_n: number;
  users_n: number;
};

export async function checkProjectPrerequisites(): Promise<
  { ok: true } | { ok: false; missing: string[] }
> {
  const rows = (await sql`
    SELECT
      (SELECT COUNT(*)::int FROM clients WHERE is_archived = FALSE)               AS clients_n,
      (SELECT COUNT(*)::int FROM project_types WHERE is_archived = FALSE)         AS types_n,
      (SELECT COUNT(*)::int FROM result_statuses WHERE is_archived = FALSE)       AS statuses_n,
      (SELECT COUNT(*)::int FROM workflow_stages_template WHERE is_archived = FALSE) AS stages_n,
      (SELECT COUNT(*)::int FROM users WHERE is_active = TRUE)                    AS users_n
  `) as PrereqRow[];

  const r = rows[0];
  const missing: string[] = [];
  if (!r || r.clients_n === 0) missing.push('klient');
  if (!r || r.types_n === 0) missing.push('typ projektu');
  if (!r || r.statuses_n === 0) missing.push('status');
  if (!r || r.stages_n === 0) missing.push('etap procesu');
  if (!r || r.users_n === 0) missing.push('uzytkownik');

  if (missing.length > 0) return { ok: false, missing };
  return { ok: true };
}
