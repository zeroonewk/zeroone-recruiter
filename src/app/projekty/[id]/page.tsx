import { notFound, redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { sql } from '@/lib/db';
import AppShell from '@/components/layout/AppShell';
import ProjektEdycjaClient from '@/components/projects/ProjektEdycjaClient';
import type { ProjectFull, ProjectStage } from '@/app/api/projekty/[id]/route';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function ProjektDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getSession();
  if (!session) redirect('/zaloguj');

  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();

  const [projectRows, stageRows] = await Promise.all([
    sql`
      SELECT
        p.id, p.title, p.points, p.notes, p.links, p.opened_at, p.closed_at, p.is_archived,
        c.id AS client_id, c.name AS client_name,
        pt.id AS type_id, pt.name AS type_name,
        u.id AS owner_id, u.name AS owner_name, u.email AS owner_email,
        rs.id AS status_id, rs.name AS status_name, rs.color AS status_color,
        rs.is_success AS status_is_success
      FROM projects p
      JOIN clients c ON c.id = p.client_id
      JOIN project_types pt ON pt.id = p.project_type_id
      JOIN users u ON u.id = p.owner_id
      JOIN result_statuses rs ON rs.id = p.status_id
      WHERE p.id = ${id}::uuid
      LIMIT 1
    `,
    sql`
      SELECT id, name, position, deadline, done_at, notes
      FROM project_stages
      WHERE project_id = ${id}::uuid
      ORDER BY position ASC
    `,
  ]);

  if (!projectRows || projectRows.length === 0) notFound();

  return (
    <AppShell user={{ name: session.name, email: session.email, role: session.role }}>
      <ProjektEdycjaClient
        initialProject={projectRows[0] as ProjectFull}
        initialStages={stageRows as ProjectStage[]}
        currentUserRole={session.role}
        currentUserId={session.sub}
      />
    </AppShell>
  );
}
