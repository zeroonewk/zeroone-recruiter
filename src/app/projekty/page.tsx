import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { sql } from '@/lib/db';
import AppShell from '@/components/layout/AppShell';
import ProjektyClient from '@/components/projects/ProjektyClient';
import type { ProjectListItem } from '@/app/api/projekty/route';

type FilterOption = { id: string; name: string };

export default async function ProjektyPage() {
  const session = await getSession();
  if (!session) redirect('/zaloguj');

  const [projectRows, statusRows, typeRows, clientRows, userRows] = await Promise.all([
    sql`
      SELECT
        p.id, p.title, p.points, p.opened_at, p.closed_at, p.is_archived,
        p.created_at, p.updated_at,
        c.id AS client_id, c.name AS client_name,
        pt.id AS type_id, pt.name AS type_name,
        u.id AS owner_id, u.name AS owner_name, u.email AS owner_email,
        rs.id AS status_id, rs.name AS status_name, rs.color AS status_color,
        rs.is_success AS status_is_success,
        cur_stage.name AS current_stage_name,
        cur_stage.deadline AS current_stage_deadline,
        cur_stage.position AS current_stage_position,
        CASE
          WHEN cur_stage.id IS NULL THEN false
          WHEN cur_stage.deadline < CURRENT_DATE THEN true
          ELSE false
        END AS is_overdue
      FROM projects p
      JOIN clients c ON c.id = p.client_id
      JOIN project_types pt ON pt.id = p.project_type_id
      JOIN users u ON u.id = p.owner_id
      JOIN result_statuses rs ON rs.id = p.status_id
      LEFT JOIN LATERAL (
        SELECT ps.id, ps.name, ps.position, ps.deadline
        FROM project_stages ps
        WHERE ps.project_id = p.id AND ps.done_at IS NULL
        ORDER BY ps.position ASC
        LIMIT 1
      ) cur_stage ON true
      WHERE p.is_archived = FALSE
      ORDER BY rs.is_success ASC, p.is_archived ASC, p.opened_at DESC
    `,
    sql`SELECT id, name FROM result_statuses WHERE is_archived = FALSE ORDER BY position ASC`,
    sql`SELECT id, name FROM project_types WHERE is_archived = FALSE ORDER BY name ASC`,
    sql`SELECT id, name FROM clients WHERE is_archived = FALSE ORDER BY name ASC`,
    sql`SELECT id, name FROM users WHERE is_active = TRUE ORDER BY name ASC`,
  ]);

  return (
    <AppShell user={{ name: session.name, email: session.email, role: session.role }}>
      <ProjektyClient
        initialItems={projectRows as ProjectListItem[]}
        statuses={statusRows as FilterOption[]}
        types={typeRows as FilterOption[]}
        clients={clientRows as FilterOption[]}
        users={userRows as FilterOption[]}
      />
    </AppShell>
  );
}
