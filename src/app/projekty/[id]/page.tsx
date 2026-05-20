import { notFound, redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { sql } from '@/lib/db';
import { toDateString } from '@/lib/dates';
import AppShell from '@/components/layout/AppShell';
import ProjektEdycjaClient from '@/components/projects/ProjektEdycjaClient';
import type { ProjectFull, ProjectStage } from '@/app/api/projekty/[id]/route';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type AvailableStatus = {
  id: string;
  name: string;
  color: string;
  is_success: boolean;
  position: number;
};

type ProjectRowRaw = {
  id: string;
  title: string;
  points: number;
  notes: string | null;
  links: unknown;
  opened_at: unknown;
  closed_at: unknown;
  is_archived: boolean;
  client_id: string;
  client_name: string;
  type_id: string;
  type_name: string;
  owner_id: string;
  owner_name: string;
  owner_email: string;
  status_id: string;
  status_name: string;
  status_color: string;
  status_is_success: boolean;
};

type StageRowRaw = {
  id: string;
  name: string;
  position: number;
  deadline: unknown;
  done_at: unknown;
  notes: string | null;
};

export default async function ProjektDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getSession();
  if (!session) redirect('/zaloguj');

  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();

  const [projectRows, stageRows, statusRows, userRows] = await Promise.all([
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
    sql`
      SELECT id, name, color, is_success, position
      FROM result_statuses
      WHERE is_archived = FALSE
      ORDER BY position ASC
    `,
    sql`SELECT id, name FROM users WHERE is_active = TRUE ORDER BY name ASC`,
  ]);

  if (!projectRows || projectRows.length === 0) notFound();

  const raw = projectRows[0] as ProjectRowRaw;
  const project: ProjectFull = {
    id: raw.id,
    title: raw.title,
    points: raw.points,
    notes: raw.notes,
    links: Array.isArray(raw.links) ? (raw.links as { label: string; url: string }[]) : [],
    opened_at: toDateString(raw.opened_at) ?? '',
    closed_at: toDateString(raw.closed_at),
    is_archived: raw.is_archived,
    client_id: raw.client_id,
    client_name: raw.client_name,
    type_id: raw.type_id,
    type_name: raw.type_name,
    owner_id: raw.owner_id,
    owner_name: raw.owner_name,
    owner_email: raw.owner_email,
    status_id: raw.status_id,
    status_name: raw.status_name,
    status_color: raw.status_color,
    status_is_success: raw.status_is_success,
  };

  const stages: ProjectStage[] = (stageRows as StageRowRaw[]).map((s) => ({
    id: s.id,
    name: s.name,
    position: s.position,
    deadline: toDateString(s.deadline) ?? '',
    done_at: toDateString(s.done_at),
    notes: s.notes,
  }));

  return (
    <AppShell user={{ name: session.name, email: session.email, role: session.role }}>
      <ProjektEdycjaClient
        initialProject={project}
        initialStages={stages}
        currentUserRole={session.role}
        currentUserId={session.sub}
        availableStatuses={statusRows as AvailableStatus[]}
        availableUsers={userRows as { id: string; name: string }[]}
      />
    </AppShell>
  );
}
