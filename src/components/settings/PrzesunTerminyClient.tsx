'use client';

import { Fragment, useEffect, useMemo, useState } from 'react';
import type { ShiftProject } from '@/lib/przesun-terminy';

type Toast = { type: 'success' | 'error'; message: string };

type Props = {
  initialProjects: ShiftProject[];
};

function countStages(projects: ShiftProject[]): number {
  return projects.reduce((acc, p) => acc + p.stages.length, 0);
}

export default function PrzesunTerminyClient({ initialProjects }: Props) {
  const [projects, setProjects] = useState<ShiftProject[]>(initialProjects);
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(initialProjects.map((p) => p.project_id))
  );
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  const totalStages = useMemo(() => countStages(projects), [projects]);
  const allSelected = projects.length > 0 && selected.size === projects.length;

  async function refresh() {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/przesun-terminy/podglad', { cache: 'no-store' });
      const data = (await res.json()) as { ok: boolean; projects?: ShiftProject[]; error?: string };
      if (data.ok && data.projects) {
        setProjects(data.projects);
        setSelected(new Set(data.projects.map((p) => p.project_id)));
        setExpanded(new Set());
      } else {
        setToast({ type: 'error', message: data.error ?? 'Blad serwera' });
      }
    } catch {
      setToast({ type: 'error', message: 'Blad polaczenia z serwerem' });
    } finally {
      setLoading(false);
    }
  }

  function toggleSelected(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(projects.map((p) => p.project_id)));
  }

  function toggleExpanded(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleSubmit() {
    if (selected.size === 0) return;
    const selectedProjects = projects.filter((p) => selected.has(p.project_id));
    const stagesCount = countStages(selectedProjects);
    if (
      !confirm(
        `Przesunac terminy w ${selectedProjects.length} projektach (${stagesCount} etapow)? Tej operacji nie mozna cofnac.`
      )
    ) {
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/admin/przesun-terminy/zatwierdz', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_ids: selectedProjects.map((p) => p.project_id) }),
      });
      const data = (await res.json()) as {
        ok: boolean;
        projects?: number;
        stages?: number;
        error?: string;
      };
      if (data.ok) {
        setToast({
          type: 'success',
          message: `Przesunieto terminy: projektow ${data.projects ?? 0}, etapow ${data.stages ?? 0}`,
        });
        await refresh();
      } else {
        setToast({ type: 'error', message: data.error ?? 'Blad serwera' });
      }
    } catch {
      setToast({ type: 'error', message: 'Blad polaczenia z serwerem' });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Przesun zalegle terminy</h1>
          <p className="text-sm text-gray-600 mt-1">
            Dla aktywnych projektow z zaleglymi etapami najbardziej zalegly etap trafia na dzis,
            a wszystkie otwarte etapy przesuwaja sie o te sama liczbe dni. Pierwotne terminy
            (original_deadline) pozostaja bez zmian.
          </p>
        </div>
        <button
          type="button"
          onClick={refresh}
          disabled={loading || submitting}
          className="shrink-0 px-3 py-2 text-sm rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          {loading ? 'Odswiezanie...' : 'Odswiez podglad'}
        </button>
      </div>

      <div className="mb-4 px-4 py-3 rounded-md bg-gray-50 border border-gray-200 text-sm text-gray-800">
        Projektow do przesuniecia: <strong>{projects.length}</strong>, etapow:{' '}
        <strong>{totalStages}</strong>
      </div>

      {projects.length === 0 ? (
        <div className="px-4 py-8 text-center text-sm text-gray-500 border border-gray-200 rounded-md">
          Brak projektow z zaleglymi terminami.
        </div>
      ) : (
        <>
          <div className="overflow-x-auto border border-gray-200 rounded-md">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-600 text-left">
                <tr>
                  <th className="px-3 py-2 w-10">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={toggleAll}
                      aria-label="Zaznacz wszystkie"
                    />
                  </th>
                  <th className="px-3 py-2">Projekt</th>
                  <th className="px-3 py-2">Owner</th>
                  <th className="px-3 py-2">Przesuniecie</th>
                  <th className="px-3 py-2">Etapy</th>
                </tr>
              </thead>
              <tbody>
                {projects.map((p) => {
                  const isOpen = expanded.has(p.project_id);
                  return (
                    <Fragment key={p.project_id}>
                      <tr className="border-t border-gray-200">
                        <td className="px-3 py-2">
                          <input
                            type="checkbox"
                            checked={selected.has(p.project_id)}
                            onChange={() => toggleSelected(p.project_id)}
                            aria-label={`Zaznacz ${p.title}`}
                          />
                        </td>
                        <td className="px-3 py-2">
                          <a
                            href={`/projekty/${p.project_id}`}
                            className="text-gray-900 hover:text-[#FF5A3C]"
                          >
                            {p.title}
                          </a>
                        </td>
                        <td className="px-3 py-2 text-gray-700">{p.owner_name ?? '-'}</td>
                        <td className="px-3 py-2 font-medium text-[#FF5A3C]">+{p.shift} dni</td>
                        <td className="px-3 py-2">
                          <button
                            type="button"
                            onClick={() => toggleExpanded(p.project_id)}
                            className="text-gray-600 hover:text-gray-900"
                          >
                            {isOpen ? 'Ukryj' : 'Pokaz'} ({p.stages.length})
                          </button>
                        </td>
                      </tr>
                      {isOpen && (
                        <tr className="bg-gray-50/60">
                          <td />
                          <td colSpan={4} className="px-3 py-2">
                            <ul className="flex flex-col gap-1">
                              {p.stages.map((s) => (
                                <li key={s.stage_id} className="flex gap-3 text-gray-700">
                                  <span className="min-w-48">{s.stage_name}</span>
                                  <span className="text-gray-500">{s.old_deadline ?? '-'}</span>
                                  <span className="text-gray-400">-&gt;</span>
                                  <span className="font-medium text-gray-900">
                                    {s.new_deadline ?? '-'}
                                  </span>
                                </li>
                              ))}
                            </ul>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex justify-end">
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting || loading || selected.size === 0}
              className="px-4 py-2 text-sm rounded-md bg-[#FF5A3C] text-white hover:bg-[#e64e32] disabled:opacity-50"
            >
              {submitting ? 'Przesuwanie...' : `Przesun zaznaczone (${selected.size} projektow)`}
            </button>
          </div>
        </>
      )}

      {toast && (
        <div
          className={`fixed bottom-4 right-4 px-4 py-2 rounded-md shadow-lg text-white text-sm z-50 ${
            toast.type === 'success' ? 'bg-green-600' : 'bg-red-600'
          }`}
        >
          {toast.message}
        </div>
      )}
    </div>
  );
}
