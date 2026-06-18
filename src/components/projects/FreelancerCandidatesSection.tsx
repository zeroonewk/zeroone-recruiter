'use client';

import { useState, useEffect, useCallback } from 'react';
import type { FreelancerRates } from '@/app/api/projekty/[id]/route';

type CandidateStatus = 'submitted' | 'stage1' | 'stage2' | 'selected';

type Candidate = {
  id: string;
  full_name: string;
  cv_url: string;
  status: CandidateStatus;
  user_id: string;
  freelancer_name: string;
};

type FreelancerGroup = {
  user_id: string;
  freelancer_name: string;
  candidates: Candidate[];
};

type Props = {
  projectId: string;
  freelancerRates: FreelancerRates;
  projectPoints: number;
};

function calcEarnings(
  candidates: Candidate[],
  rates: FreelancerRates,
  projectPoints: number
) {
  const stage1Count = candidates.filter((c) => c.status === 'stage1').length;
  const stage2Count = candidates.filter((c) => c.status === 'stage2').length;
  const hasSelected = candidates.some((c) => c.status === 'selected');
  const effectiveValue = rates.project_value ?? projectPoints;
  const stage1Earnings = stage1Count * rates.cv_rate;
  const stage2Earnings = stage2Count * rates.meeting_rate;
  const paid = stage1Earnings + stage2Earnings;
  const selectedEarnings = hasSelected ? Math.max(0, effectiveValue - paid) : 0;
  return { stage1Count, stage2Count, stage1Earnings, stage2Earnings, selectedEarnings, total: paid + selectedEarnings };
}

function groupByFreelancer(candidates: Candidate[]): FreelancerGroup[] {
  const map = new Map<string, FreelancerGroup>();
  for (const c of candidates) {
    if (!map.has(c.user_id)) {
      map.set(c.user_id, { user_id: c.user_id, freelancer_name: c.freelancer_name, candidates: [] });
    }
    map.get(c.user_id)!.candidates.push(c);
  }
  return Array.from(map.values());
}

export default function FreelancerCandidatesSection({ projectId, freelancerRates, projectPoints }: Props) {
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState('');
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const fetchCandidates = useCallback(async () => {
    setLoading(true);
    setFetchError('');
    try {
      const res = await fetch(`/api/admin/freelancer/projects/${projectId}/candidates`);
      const data = (await res.json()) as { ok: boolean; items?: Candidate[]; error?: string };
      if (data.ok && data.items) {
        setCandidates(data.items);
      } else {
        setFetchError(data.error ?? 'Blad wczytywania');
      }
    } catch {
      setFetchError('Blad sieci');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void fetchCandidates();
  }, [fetchCandidates]);

  async function handleAdvance(candidateId: string, newStatus: CandidateStatus) {
    setUpdatingId(candidateId);
    try {
      const res = await fetch(`/api/admin/freelancer/candidates/${candidateId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      const data = (await res.json()) as { ok: boolean; error?: string };
      if (data.ok) {
        setCandidates((prev) =>
          prev.map((c) => (c.id === candidateId ? { ...c, status: newStatus } : c))
        );
      }
    } catch {
      // silently ignore — candidate state stays unchanged
    } finally {
      setUpdatingId(null);
    }
  }

  if (loading) {
    return (
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <h2 className="text-base font-semibold text-gray-900 mb-2">Kandydaci freelancerow</h2>
        <p className="text-sm text-gray-500">Ladowanie...</p>
      </div>
    );
  }

  if (fetchError) {
    return (
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <h2 className="text-base font-semibold text-gray-900 mb-2">Kandydaci freelancerow</h2>
        <p className="text-sm text-red-600">{fetchError}</p>
      </div>
    );
  }

  if (candidates.length === 0) {
    return (
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <h2 className="text-base font-semibold text-gray-900 mb-2">Kandydaci freelancerow</h2>
        <p className="text-sm text-gray-500">Brak kandydatow.</p>
      </div>
    );
  }

  const groups = groupByFreelancer(candidates);

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-6">
      <h2 className="text-base font-semibold text-gray-900 mb-6">Kandydaci freelancerow</h2>

      <div className="space-y-8">
        {groups.map((group) => {
          const earnings = calcEarnings(group.candidates, freelancerRates, projectPoints);

          return (
            <div key={group.user_id}>
              <p className="text-sm font-semibold text-gray-800 mb-2">{group.freelancer_name}</p>

              <div className="overflow-x-auto rounded-md border border-gray-100">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100">
                      <th className="text-left px-4 py-2.5 font-medium text-gray-600">Kandydat</th>
                      <th className="text-left px-4 py-2.5 font-medium text-gray-600">CV</th>
                      <th className="text-center px-4 py-2.5 font-medium text-gray-600">Etap 1</th>
                      <th className="text-center px-4 py-2.5 font-medium text-gray-600">Etap 2</th>
                      <th className="text-center px-4 py-2.5 font-medium text-gray-600">Wybrany</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {group.candidates.map((c) => {
                      const stage1Checked = c.status === 'stage1' || c.status === 'stage2' || c.status === 'selected';
                      const stage2Checked = c.status === 'stage2' || c.status === 'selected';
                      const selectedChecked = c.status === 'selected';
                      // disabled when it would require a jump of 2+ steps
                      const stage1Disabled = !['submitted', 'stage1'].includes(c.status) || updatingId === c.id;
                      const stage2Disabled = !['stage1', 'stage2'].includes(c.status) || updatingId === c.id;
                      const selectedDisabled = !['stage2', 'selected'].includes(c.status) || updatingId === c.id;

                      return (
                        <tr key={c.id} className="hover:bg-gray-50 transition-colors">
                          <td className="px-4 py-2.5 text-gray-900">{c.full_name}</td>
                          <td className="px-4 py-2.5">
                            <a
                              href={c.cv_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-600 hover:underline text-xs"
                            >
                              Zobacz CV
                            </a>
                          </td>
                          <td className="px-4 py-2.5 text-center">
                            <input
                              type="checkbox"
                              checked={stage1Checked}
                              disabled={stage1Disabled}
                              onChange={() => void handleAdvance(c.id, c.status === 'submitted' ? 'stage1' : 'submitted')}
                              className="w-4 h-4 accent-[#FF5A3C] cursor-pointer disabled:cursor-default"
                            />
                          </td>
                          <td className="px-4 py-2.5 text-center">
                            <input
                              type="checkbox"
                              checked={stage2Checked}
                              disabled={stage2Disabled}
                              onChange={() => void handleAdvance(c.id, c.status === 'stage1' ? 'stage2' : 'stage1')}
                              className="w-4 h-4 accent-[#FF5A3C] cursor-pointer disabled:cursor-default"
                            />
                          </td>
                          <td className="px-4 py-2.5 text-center">
                            <input
                              type="checkbox"
                              checked={selectedChecked}
                              disabled={selectedDisabled}
                              onChange={() => void handleAdvance(c.id, c.status === 'stage2' ? 'selected' : 'stage2')}
                              className="w-4 h-4 accent-[#FF5A3C] cursor-pointer disabled:cursor-default"
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Earnings summary */}
              <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-gray-600 pl-1">
                <span>
                  Etap 1:{' '}
                  <span className="text-gray-500">{earnings.stage1Count} &times; {freelancerRates.cv_rate} zł</span>
                  {' = '}
                  <strong className="text-gray-800">{earnings.stage1Earnings} zł</strong>
                </span>
                <span>
                  Etap 2:{' '}
                  <span className="text-gray-500">{earnings.stage2Count} &times; {freelancerRates.meeting_rate} zł</span>
                  {' = '}
                  <strong className="text-gray-800">{earnings.stage2Earnings} zł</strong>
                </span>
                {earnings.selectedEarnings > 0 && (
                  <span>
                    Wybrany: <strong className="text-gray-800">{earnings.selectedEarnings} zł</strong>
                  </span>
                )}
                <span className="font-semibold text-[#FF5A3C]">
                  Suma: {earnings.total} zł
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
