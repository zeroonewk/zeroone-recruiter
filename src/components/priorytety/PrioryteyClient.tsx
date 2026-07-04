'use client';

import { useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { FUNNEL_LEVELS, type FunnelData } from '@/lib/funnel';
import type { PriorityItem } from '@/app/api/priorytety/route';
import type { Task } from '@/app/api/zadania/route';

type Props = {
  initialItems: PriorityItem[];
  owners: { id: string; name: string }[];
  tasks: Task[];
};

function PriorityBadge({ score }: { score: number }) {
  const cls =
    score <= 2
      ? 'bg-red-100 text-red-700'
      : score <= 4
      ? 'bg-orange-100 text-orange-700'
      : 'bg-gray-100 text-gray-600';
  return (
    <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold ${cls}`}>
      {score}
    </span>
  );
}

function MiniFunnel({ funnel }: { funnel: FunnelData }) {
  const total = FUNNEL_LEVELS.length;
  const base = funnel.sourcing;

  const furthestIdx = FUNNEL_LEVELS.reduce((best, lvl, idx) => {
    return funnel[lvl.key] > 0 ? idx : best;
  }, -1);

  if (furthestIdx < 0 || base === 0) {
    return <span className="text-xs text-gray-400">—</span>;
  }

  return (
    <div className="flex items-center gap-1">
      {FUNNEL_LEVELS.map((lvl, idx) => {
        const filled = idx <= furthestIdx && funnel[lvl.key] > 0;
        return (
          <div
            key={lvl.key}
            title={`${lvl.label}: ${funnel[lvl.key]}`}
            className={`h-2 rounded-sm ${filled ? 'bg-[#FF5A3C]' : 'bg-gray-200'}`}
            style={{ width: `${Math.max(6, Math.floor(56 / total))}px` }}
          />
        );
      })}
      <span className="text-xs text-gray-500 ml-1">{FUNNEL_LEVELS[furthestIdx].label}</span>
    </div>
  );
}

export default function PrioryteyClient({ initialItems, owners, tasks }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const ownerFilter = searchParams.get('owner') ?? 'all';
  const [expandedProjectId, setExpandedProjectId] = useState<string | null>(null);

  function setOwner(v: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (v === 'all') {
      params.delete('owner');
    } else {
      params.set('owner', v);
    }
    const qs = params.toString();
    router.replace(qs ? `/priorytety?${qs}` : '/priorytety');
  }

  const filtered = useMemo(() => {
    if (ownerFilter === 'all') return initialItems;
    return initialItems.filter((p) => p.owner_id === ownerFilter);
  }, [initialItems, ownerFilter]);

  const filteredTasks = useMemo(() => {
    if (ownerFilter === 'all') return tasks;
    return tasks.filter((t) => t.owner_id === ownerFilter);
  }, [tasks, ownerFilter]);

  const tasksByProject = useMemo(() => {
    const map = new Map<string, Task[]>();
    for (const t of filteredTasks) {
      const arr = map.get(t.project_id) ?? [];
      arr.push(t);
      map.set(t.project_id, arr);
    }
    return map;
  }, [filteredTasks]);

  function toggleExpand(projectId: string) {
    setExpandedProjectId((prev) => (prev === projectId ? null : projectId));
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-baseline gap-3">
          <h1 className="text-2xl font-bold text-gray-900">Priorytety</h1>
          {filteredTasks.length > 0 && (
            <span className="text-xs text-gray-400">
              Zadania: {filteredTasks.length} do wykonania
            </span>
          )}
          {filteredTasks.length === 0 && (
            <span className="text-xs text-green-600">Brak zadan — wszystko gra!</span>
          )}
        </div>
        <select
          value={ownerFilter}
          onChange={(e) => setOwner(e.target.value)}
          className="px-3 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#FF5A3C] focus:border-transparent bg-white"
        >
          <option value="all">Wszyscy ownerzy</option>
          {owners.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
      </div>

      {filtered.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-lg p-12 text-center">
          <p className="text-gray-500 text-sm">Brak aktywnych projektow.</p>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="px-4 py-3 text-left font-medium text-gray-700">Priorytet</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-700">Klient</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-700">Projekt</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-700">Typ</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-700">Owner</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-700">Status</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-700">Zadania</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-700">Lejek</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => {
                  const projectTasks = tasksByProject.get(p.id) ?? [];
                  const taskCount = projectTasks.length;
                  const isExpanded = expandedProjectId === p.id;

                  return (
                    <>
                      <tr
                        key={p.id}
                        onClick={() => router.push(`/projekty/${p.id}`)}
                        className="border-b border-gray-100 hover:bg-gray-50 transition-colors cursor-pointer"
                      >
                        <td className="px-4 py-3">
                          <PriorityBadge score={p.priority_score} />
                        </td>
                        <td className="px-4 py-3 text-gray-700">
                          <span className="flex items-center gap-1.5">
                            {p.client_name}
                            <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-gray-100 text-gray-500 text-[10px] font-medium shrink-0">
                              {p.client_priority}
                            </span>
                          </span>
                        </td>
                        <td className="px-4 py-3 font-medium text-gray-900">{p.title}</td>
                        <td className="px-4 py-3 text-gray-600">{p.type_name}</td>
                        <td className="px-4 py-3 text-gray-600">{p.owner_name}</td>
                        <td className="px-4 py-3">
                          <span className="flex items-center gap-1.5">
                            <span
                              className="inline-block w-2.5 h-2.5 rounded-full shrink-0"
                              style={{ backgroundColor: p.status_color }}
                            />
                            <span className="text-gray-700">{p.status_name}</span>
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          {taskCount === 0 ? (
                            <span className="text-green-500 text-base leading-none" title="Brak zadan">●</span>
                          ) : (
                            <button
                              onClick={(e) => { e.stopPropagation(); toggleExpand(p.id); }}
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium transition-colors ${
                                taskCount >= 3
                                  ? 'bg-red-100 text-red-700 hover:bg-red-200'
                                  : 'bg-orange-100 text-orange-700 hover:bg-orange-200'
                              }`}
                            >
                              &#9888; Zadania ({taskCount})
                            </button>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <MiniFunnel funnel={p.funnel} />
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr key={`${p.id}-tasks`} className="border-b border-orange-200">
                          <td colSpan={8} className="bg-orange-50 px-6 py-3">
                            <ul className="space-y-1">
                              {projectTasks.map((t, i) => (
                                <li key={i} className="flex items-start gap-2 text-sm text-gray-800">
                                  <span className="shrink-0 text-orange-500 leading-none mt-0.5">&#9888;</span>
                                  <span>{t.message}</span>
                                </li>
                              ))}
                            </ul>
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-2 border-t border-gray-100 text-xs text-gray-400">
            {filtered.length} {filtered.length === 1 ? 'projekt' : 'projektow'}
          </div>
        </div>
      )}
    </div>
  );
}
