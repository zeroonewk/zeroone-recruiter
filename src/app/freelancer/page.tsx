import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getSession } from '@/lib/auth';
import { sql } from '@/lib/db';
import FreelancerShell from '@/components/freelancer/FreelancerShell';

export const dynamic = 'force-dynamic';

type ProjectRow = {
  id: string;
  title: string;
  points: number;
  closed_at: string | null;
  client_name: string;
  job_url: string | null;
  payout_amount: string | null;
};

function formatDate(raw: string): string {
  const d = new Date(raw);
  if (isNaN(d.getTime())) return raw;
  return d.toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export default async function FreelancerPage() {
  const session = await getSession();
  if (!session) redirect('/zaloguj');

  const rows = (await sql`
    SELECT
      p.id,
      p.title,
      p.points,
      p.closed_at,
      c.name AS client_name,
      (
        SELECT elem->>'url'
        FROM jsonb_array_elements(p.links) AS elem
        WHERE elem->>'label' = 'job_url'
        LIMIT 1
      ) AS job_url,
      fp.amount AS payout_amount
    FROM projects p
    JOIN clients c ON c.id = p.client_id
    JOIN project_freelancers pf ON pf.project_id = p.id
    LEFT JOIN freelancer_payouts fp ON fp.project_id = p.id AND fp.user_id = ${session.sub}::uuid
    WHERE pf.user_id = ${session.sub}::uuid
    ORDER BY (p.closed_at IS NULL) DESC, p.title ASC
  `) as ProjectRow[];

  const activeProjects = rows.filter((p) => p.closed_at === null);
  const closedProjects = rows.filter((p) => p.closed_at !== null);

  return (
    <FreelancerShell user={{ name: session.name, email: session.email }}>
      <div className="max-w-4xl mx-auto px-6 py-8 space-y-10">

        {/* Active projects */}
        <div>
          <h1 className="text-2xl font-bold text-gray-900 mb-6">Moje projekty</h1>
          {activeProjects.length === 0 ? (
            <p className="text-gray-500 text-sm">Nie masz jeszcze przypisanych aktywnych projektow.</p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {activeProjects.map((project) => (
                <Link
                  key={project.id}
                  href={`/freelancer/projekty/${project.id}`}
                  className="block bg-white border border-gray-200 rounded-xl p-5 hover:border-[#FF5A3C]/50 hover:shadow-md transition-all group"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs text-gray-500 mb-1">{project.client_name}</p>
                      <h2 className="font-semibold text-gray-900 group-hover:text-[#FF5A3C] transition-colors truncate">
                        {project.title}
                      </h2>
                    </div>
                    {project.points > 0 && (
                      <span className="shrink-0 text-sm font-bold text-[#FF5A3C] bg-[#FF5A3C]/10 px-2 py-0.5 rounded-full">
                        {project.points} zł
                      </span>
                    )}
                  </div>
                  {project.job_url && (
                    <a
                      href={project.job_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="mt-3 inline-flex items-center gap-1 text-xs text-blue-600 hover:underline"
                    >
                      Zobacz ogloszenie &rarr;
                    </a>
                  )}
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Closed projects */}
        {closedProjects.length > 0 && (
          <div>
            <h2 className="text-lg font-semibold text-gray-700 mb-4">Zakonczone projekty</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {closedProjects.map((project) => (
                <Link
                  key={project.id}
                  href={`/freelancer/projekty/${project.id}`}
                  className="block bg-gray-50 border border-gray-200 rounded-xl p-5 hover:border-gray-400 transition-all group"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs text-gray-400 mb-1">{project.client_name}</p>
                      <h2 className="font-semibold text-gray-600 group-hover:text-gray-900 transition-colors truncate">
                        {project.title}
                      </h2>
                    </div>
                    {project.payout_amount !== null && (
                      <span className="shrink-0 text-sm font-bold text-gray-500 bg-gray-200 px-2 py-0.5 rounded-full">
                        {Number(project.payout_amount)} zł
                      </span>
                    )}
                  </div>
                  <p className="mt-2 text-xs text-gray-400">
                    Zakonczony {formatDate(project.closed_at!)}
                  </p>
                </Link>
              ))}
            </div>
          </div>
        )}

      </div>
    </FreelancerShell>
  );
}
