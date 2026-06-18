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
  client_name: string;
  job_url: string | null;
};

export default async function FreelancerPage() {
  const session = await getSession();
  if (!session) redirect('/zaloguj');

  const rows = (await sql`
    SELECT
      p.id,
      p.title,
      p.points,
      c.name AS client_name,
      (
        SELECT elem->>'url'
        FROM jsonb_array_elements(p.links) AS elem
        WHERE elem->>'label' = 'job_url'
        LIMIT 1
      ) AS job_url
    FROM projects p
    JOIN clients c ON c.id = p.client_id
    JOIN project_freelancers pf ON pf.project_id = p.id
    WHERE pf.user_id = ${session.sub}::uuid
      AND p.closed_at IS NULL
    ORDER BY p.title ASC
  `) as ProjectRow[];

  return (
    <FreelancerShell user={{ name: session.name, email: session.email }}>
      <div className="max-w-4xl mx-auto px-6 py-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">Moje projekty</h1>

        {rows.length === 0 ? (
          <p className="text-gray-500 text-sm">Nie masz jeszcze przypisanych projektow.</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {rows.map((project) => (
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
    </FreelancerShell>
  );
}
