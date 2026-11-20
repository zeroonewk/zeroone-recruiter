import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { getSession } from '@/lib/auth';
import { sql } from '@/lib/db';
import FreelancerShell from '@/components/freelancer/FreelancerShell';
import AddCandidateForm from '@/components/freelancer/AddCandidateForm';
import { calcFreelancerEarnings, normalizeRates } from '@/lib/freelancer-earnings';

export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const ACTIVE_STATUS_ID = 'dd43a0a8-cd05-4b27-ac43-d9fcbd563cbf';

type ProjectRow = {
  id: string;
  title: string;
  points: number;
  closed_at: string | null;
  status_id: string;
  freelancer_rates: unknown;
  client_name: string;
  job_url: string | null;
};

type CandidateRow = {
  id: string;
  full_name: string;
  cv_url: string;
  status: 'submitted' | 'stage1' | 'stage2' | 'selected';
};

export default async function FreelancerProjektPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getSession();
  if (!session) redirect('/zaloguj');

  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();

  const [projectRows, candidateRows, payoutRows] = await Promise.all([
    sql`
      SELECT
        p.id,
        p.title,
        p.points,
        p.closed_at,
        p.status_id,
        p.freelancer_rates,
        c.name AS client_name,
        (
          SELECT elem->>'url'
          FROM jsonb_array_elements(COALESCE(p.links, '[]'::jsonb)) AS elem
          WHERE elem->>'label' ILIKE '%jns%'
             OR elem->>'label' ILIKE '%jobnonstop%'
             OR elem->>'label' ILIKE '%oferta%'
             OR elem->>'label' ILIKE '%ogloszenie%'
             OR elem->>'url'   ILIKE '%jobnonstop.pl%'
          LIMIT 1
        ) AS job_url
      FROM projects p
      JOIN clients c ON c.id = p.client_id
      JOIN project_freelancers pf ON pf.project_id = p.id
      WHERE p.id = ${id}::uuid
        AND pf.user_id = ${session.sub}::uuid
      LIMIT 1
    `,
    sql`
      SELECT id, full_name, cv_url, status
      FROM freelancer_candidates
      WHERE project_id = ${id}::uuid AND user_id = ${session.sub}::uuid
      ORDER BY created_at ASC
    `,
    sql`
      SELECT amount FROM freelancer_payouts
      WHERE project_id = ${id}::uuid AND user_id = ${session.sub}::uuid
      LIMIT 1
    `,
  ]);

  if (!projectRows || projectRows.length === 0) notFound();

  const project = projectRows[0] as ProjectRow;
  const candidates = candidateRows as CandidateRow[];
  const payout = (payoutRows as { amount: string | number }[])[0] ?? null;
  const isActive = project.closed_at === null && project.status_id === ACTIVE_STATUS_ID;
  const rates = normalizeRates(project.freelancer_rates);
  const earnings = calcFreelancerEarnings({ rates, points: project.points, candidates });
  const kand = (n: number) => (n === 1 ? 'kandydat' : 'kandydatow');

  if (project.closed_at !== null && payout) {
    return (
      <FreelancerShell user={{ name: session.name, email: session.email }}>
        <div className="max-w-4xl mx-auto px-6 py-8">
          <Link
            href="/freelancer"
            className="text-sm text-gray-500 hover:text-gray-700 mb-4 inline-block"
          >
            &larr; Powrot do projektow
          </Link>
          <div className="bg-green-50 border border-green-200 rounded-xl px-6 py-6 mt-2">
            <p className="text-sm text-gray-500 mb-1">{project.client_name}</p>
            <h1 className="text-xl font-bold text-gray-900 mb-4">{project.title}</h1>
            <p className="text-green-700 text-base font-medium">
              Projekt zamkniety. Twoje wynagrodzenie: {Number(payout.amount)} zl. Wystaw dokument sprzedazy zgodnie z umowa.
            </p>
          </div>
        </div>
      </FreelancerShell>
    );
  }

  return (
    <FreelancerShell user={{ name: session.name, email: session.email }}>
      <div className="max-w-4xl mx-auto px-6 py-8 space-y-8">

        {/* Header */}
        <div>
          <Link
            href="/freelancer"
            className="text-sm text-gray-500 hover:text-gray-700 mb-3 inline-block"
          >
            &larr; Powrot do projektow
          </Link>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-sm text-gray-500">{project.client_name}</p>
              <h1 className="text-2xl font-bold text-gray-900">{project.title}</h1>
            </div>
            <div className="flex items-center gap-3">
              {earnings.effectiveValue > 0 && (
                <span className="text-sm font-bold text-[#FF5A3C] bg-[#FF5A3C]/10 px-3 py-1 rounded-full">
                  {earnings.effectiveValue} zł
                </span>
              )}
              {!isActive && (
                <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded-full font-medium">
                  {project.closed_at !== null ? 'Zamkniety' : 'Nieaktywny'}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Podglad projektu */}
        {project.job_url && (
          <div className="bg-white border border-gray-200 rounded-xl px-5 py-5">
            <h2 className="font-semibold text-gray-900 mb-3">Podglad projektu</h2>
            <a
              href={project.job_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-50 text-blue-700 border border-blue-200 rounded-lg text-sm font-medium hover:bg-blue-100 transition-colors"
            >
              Zobacz ogloszenie
              <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </a>
          </div>
        )}

        {/* Candidates table */}
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="font-semibold text-gray-900">Kandydaci</h2>
          </div>
          {candidates.length === 0 ? (
            <p className="px-5 py-6 text-sm text-gray-500">Brak kandydatow.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    <th className="text-left px-5 py-3 font-medium text-gray-600">Imie i nazwisko</th>
                    <th className="text-left px-5 py-3 font-medium text-gray-600">CV</th>
                    <th className="text-center px-4 py-3 font-medium text-gray-600">Etap 1</th>
                    <th className="text-center px-4 py-3 font-medium text-gray-600">Etap 2</th>
                    <th className="text-center px-4 py-3 font-medium text-gray-600">Wybrany</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {candidates.map((c) => (
                    <tr key={c.id} className="hover:bg-gray-50">
                      <td className="px-5 py-3 text-gray-900">{c.full_name}</td>
                      <td className="px-5 py-3">
                        <a
                          href={c.cv_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:underline"
                        >
                          CV
                        </a>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <input
                          type="checkbox"
                          disabled
                          checked={c.status === 'stage1' || c.status === 'stage2' || c.status === 'selected'}
                          className="accent-[#FF5A3C] w-4 h-4 cursor-not-allowed"
                          readOnly
                        />
                      </td>
                      <td className="px-4 py-3 text-center">
                        <input
                          type="checkbox"
                          disabled
                          checked={c.status === 'stage2' || c.status === 'selected'}
                          className="accent-[#FF5A3C] w-4 h-4 cursor-not-allowed"
                          readOnly
                        />
                      </td>
                      <td className="px-4 py-3 text-center">
                        <input
                          type="checkbox"
                          disabled
                          checked={c.status === 'selected'}
                          className="accent-[#FF5A3C] w-4 h-4 cursor-not-allowed"
                          readOnly
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Add candidate form */}
        {isActive ? (
          <div className="bg-white border border-gray-200 rounded-xl px-5 py-5">
            <h2 className="font-semibold text-gray-900 mb-4">Dodaj kandydata</h2>
            <AddCandidateForm projectId={project.id} />
          </div>
        ) : (
          <div className="bg-gray-50 border border-gray-200 rounded-xl px-5 py-4">
            <p className="text-sm text-gray-500">
              Projekt nie jest aktywny - dodawanie kandydatow zostalo wstrzymane.
            </p>
          </div>
        )}

        {/* Rates overview */}
        <div className="bg-white border border-gray-200 rounded-xl px-5 py-5">
          <h2 className="font-semibold text-gray-900 mb-4">Stawki wynagrodzenia</h2>
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-gray-50 rounded-lg px-4 py-3">
              <p className="text-xs text-gray-500 mb-1">Za zaakceptowane CV</p>
              <p className="text-xl font-bold text-gray-900">{rates.cv_rate} <span className="text-sm font-normal text-gray-500">zł</span></p>
            </div>
            <div className="bg-gray-50 rounded-lg px-4 py-3">
              <p className="text-xs text-gray-500 mb-1">Za spotkanie z klientem</p>
              <p className="text-xl font-bold text-gray-900">{rates.meeting_rate} <span className="text-sm font-normal text-gray-500">zł</span></p>
            </div>
            <div className="bg-gray-50 rounded-lg px-4 py-3">
              <p className="text-xs text-gray-500 mb-1">Za wybranie kandydata</p>
              <p className="text-xl font-bold text-gray-900">{earnings.effectiveValue} <span className="text-sm font-normal text-gray-500">zł</span></p>
            </div>
          </div>
          <p className="mt-3 text-xs text-gray-500">
            Stawki za CV i spotkania naliczane sa za kazdego kandydata, ktory przeszedl dany etap (kandydat na Etapie 2 ma obie stawki).
            Gdy Twoj kandydat zostanie wybrany, wynagrodzenie w tym projekcie to wartosc projektu za kazdego wybranego - CV i spotkania sa w nia wliczone.
          </p>
        </div>

        {/* Earnings */}
        <div className="bg-white border border-gray-200 rounded-xl px-5 py-5">
          <h2 className="font-semibold text-gray-900 mb-4">Moje wynagrodzenie</h2>
          <div className="space-y-2 text-sm">
            {earnings.mode === 'selected' ? (
              <>
                <div className="flex justify-between text-gray-700">
                  <span>
                    Wybrany ({earnings.selectedCount} &times; wartosc projektu {earnings.effectiveValue} zł)
                  </span>
                  <span className="font-medium">{earnings.amount} zł</span>
                </div>
                <p className="text-xs text-gray-500">
                  CV ({earnings.stage1Count}) i spotkania ({earnings.stage2Count}) w tym projekcie sa wliczone w te kwote.
                </p>
              </>
            ) : (
              <>
                <div className="flex justify-between text-gray-700">
                  <span>
                    CV ({earnings.stage1Count} {kand(earnings.stage1Count)} &times; {rates.cv_rate} zł)
                  </span>
                  <span className="font-medium">{earnings.stage1Count * rates.cv_rate} zł</span>
                </div>
                <div className="flex justify-between text-gray-700">
                  <span>
                    Spotkania ({earnings.stage2Count} {kand(earnings.stage2Count)} &times; {rates.meeting_rate} zł)
                  </span>
                  <span className="font-medium">{earnings.stage2Count * rates.meeting_rate} zł</span>
                </div>
              </>
            )}
            <div className="border-t border-gray-200 pt-2 mt-2 flex justify-between font-semibold text-gray-900">
              <span>Suma</span>
              <span className="text-[#FF5A3C]">{earnings.amount} zł</span>
            </div>
          </div>
        </div>

      </div>
    </FreelancerShell>
  );
}
