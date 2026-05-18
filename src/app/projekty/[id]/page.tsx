import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { getSession } from '@/lib/auth';
import { sql } from '@/lib/db';
import AppShell from '@/components/layout/AppShell';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type ProjectDetail = {
  id: string;
  title: string;
  points: number;
  notes: string | null;
  links: { label: string; url: string }[];
  opened_at: string;
  closed_at: string | null;
  is_archived: boolean;
  client_name: string;
  type_name: string;
  owner_name: string;
  owner_email: string;
  status_name: string;
  status_color: string;
};

type StageRow = {
  id: string;
  name: string;
  position: number;
  deadline: string;
  done_at: string | null;
};

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00Z');
  return d.toLocaleDateString('pl-PL', { year: 'numeric', month: '2-digit', day: '2-digit' });
}

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
        c.name AS client_name,
        pt.name AS type_name,
        u.name AS owner_name, u.email AS owner_email,
        rs.name AS status_name, rs.color AS status_color
      FROM projects p
      JOIN clients c ON c.id = p.client_id
      JOIN project_types pt ON pt.id = p.project_type_id
      JOIN users u ON u.id = p.owner_id
      JOIN result_statuses rs ON rs.id = p.status_id
      WHERE p.id = ${id}::uuid
    `,
    sql`
      SELECT id, name, position, deadline, done_at
      FROM project_stages
      WHERE project_id = ${id}::uuid
      ORDER BY position ASC
    `,
  ]);

  if (!projectRows || projectRows.length === 0) notFound();

  const project = projectRows[0] as ProjectDetail;
  const stages = stageRows as StageRow[];
  const today = new Date().toISOString().slice(0, 10);

  return (
    <AppShell user={{ name: session.name, email: session.email, role: session.role }}>
      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Breadcrumb */}
        <nav className="text-sm text-gray-500 mb-2">
          <Link href="/projekty" className="hover:text-gray-700">
            Projekty
          </Link>
          <span className="mx-1">/</span>
          <span className="text-gray-900">{project.title}</span>
        </nav>

        {/* Title row */}
        <div className="flex items-start justify-between mb-6 gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{project.title}</h1>
            {project.is_archived && (
              <span className="inline-block mt-1 text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded">
                Zarchiwizowany
              </span>
            )}
          </div>
          <span className="flex items-center gap-1.5 text-sm text-gray-700 px-3 py-1.5 border border-gray-200 rounded-lg whitespace-nowrap shrink-0">
            <span
              className="inline-block w-2.5 h-2.5 rounded-full shrink-0"
              style={{ backgroundColor: project.status_color }}
            />
            {project.status_name}
          </span>
        </div>

        {/* Key-value card */}
        <div className="bg-white border border-gray-200 rounded-lg p-6 mb-6">
          <dl className="grid sm:grid-cols-2 gap-x-8 gap-y-4 text-sm">
            <div>
              <dt className="text-gray-500 font-medium mb-0.5">Klient</dt>
              <dd className="text-gray-900">{project.client_name}</dd>
            </div>
            <div>
              <dt className="text-gray-500 font-medium mb-0.5">Typ projektu</dt>
              <dd className="text-gray-900">{project.type_name}</dd>
            </div>
            <div>
              <dt className="text-gray-500 font-medium mb-0.5">Owner</dt>
              <dd className="text-gray-900">
                {project.owner_name}{' '}
                <span className="text-gray-500">({project.owner_email})</span>
              </dd>
            </div>
            <div>
              <dt className="text-gray-500 font-medium mb-0.5">Punkty</dt>
              <dd className="text-gray-900">{project.points}</dd>
            </div>
            <div>
              <dt className="text-gray-500 font-medium mb-0.5">Data otwarcia</dt>
              <dd className="text-gray-900">{formatDate(project.opened_at)}</dd>
            </div>
            {project.closed_at && (
              <div>
                <dt className="text-gray-500 font-medium mb-0.5">Data zamkniecia</dt>
                <dd className="text-gray-900">{formatDate(project.closed_at)}</dd>
              </div>
            )}
            {project.notes && (
              <div className="sm:col-span-2">
                <dt className="text-gray-500 font-medium mb-0.5">Notatki</dt>
                <dd className="text-gray-900 whitespace-pre-wrap">{project.notes}</dd>
              </div>
            )}
            {project.links && project.links.length > 0 && (
              <div className="sm:col-span-2">
                <dt className="text-gray-500 font-medium mb-1">Linki</dt>
                <dd>
                  <ul className="space-y-1">
                    {project.links.map((l, i) => (
                      <li key={i}>
                        <a
                          href={l.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[#FF5A3C] hover:underline"
                        >
                          {l.label}
                        </a>
                      </li>
                    ))}
                  </ul>
                </dd>
              </div>
            )}
          </dl>
        </div>

        {/* Stages */}
        <div className="bg-white border border-gray-200 rounded-lg p-6 mb-6">
          <h2 className="text-base font-semibold text-gray-900 mb-4">Etapy procesu</h2>
          {stages.length === 0 ? (
            <p className="text-sm text-gray-500">Brak etapow.</p>
          ) : (
            <ol className="space-y-2">
              {stages.map((s) => {
                const isDone = s.done_at !== null;
                const isOverdue = !isDone && s.deadline < today;
                return (
                  <li key={s.id} className="flex items-center gap-3 text-sm">
                    <span
                      className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${
                        isDone ? 'bg-green-500 border-green-500' : 'border-gray-300'
                      }`}
                    >
                      {isDone && (
                        <svg
                          className="w-3 h-3 text-white"
                          viewBox="0 0 12 12"
                          fill="none"
                          aria-hidden="true"
                        >
                          <path
                            d="M2 6l3 3 5-5"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      )}
                    </span>
                    <span className={isDone ? 'text-gray-400 line-through' : 'text-gray-900'}>
                      {s.position}. {s.name}
                    </span>
                    <span
                      className={`ml-auto text-xs whitespace-nowrap ${
                        isDone
                          ? 'text-gray-400'
                          : isOverdue
                          ? 'text-red-600 font-medium'
                          : 'text-gray-500'
                      }`}
                    >
                      {isDone && s.done_at
                        ? `Ukonczono ${formatDate(s.done_at)}`
                        : formatDate(s.deadline)}
                      {isOverdue && ' · Przekroczony'}
                    </span>
                  </li>
                );
              })}
            </ol>
          )}
        </div>

        {/* WIP notice */}
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-700">
          Edycja w budowie...
        </div>
      </div>
    </AppShell>
  );
}
