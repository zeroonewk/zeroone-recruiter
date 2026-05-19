'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { ProjectFull, ProjectStage } from '@/app/api/projekty/[id]/route';

type Props = {
  initialProject: ProjectFull;
  initialStages: ProjectStage[];
  currentUserRole: 'admin' | 'recruiter';
  currentUserId: string;
};

type Toast = { type: 'success' | 'error'; message: string };
type LinkDraft = { label: string; url: string };

const URL_RE = /^https?:\/\//;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function formatDatePL(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00Z');
  return d.toLocaleDateString('pl-PL', { year: 'numeric', month: '2-digit', day: '2-digit' });
}

function isOverdue(stage: ProjectStage): boolean {
  return stage.done_at === null && stage.deadline < todayStr();
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ProjektEdycjaClient({
  initialProject,
  initialStages,
  currentUserRole,
}: Props) {
  const router = useRouter();

  const [project, setProject] = useState<ProjectFull>(initialProject);
  const [stages, setStages] = useState<ProjectStage[]>(initialStages);
  const [notesDraft, setNotesDraft] = useState(initialProject.notes ?? '');
  const [linksDraft, setLinksDraft] = useState<LinkDraft[]>(initialProject.links ?? []);
  const [pointsDraft, setPointsDraft] = useState(initialProject.points);
  const [savingNotes, setSavingNotes] = useState(false);
  const [savingLinks, setSavingLinks] = useState(false);
  const [savingPoints, setSavingPoints] = useState(false);
  const [savingStageId, setSavingStageId] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2000);
    return () => clearTimeout(t);
  }, [toast]);

  function showToast(type: 'success' | 'error', message: string) {
    setToast({ type, message });
  }

  // ── Stage handlers ────────────────────────────────────────────────────────

  async function handleStageToggle(stage: ProjectStage, checked: boolean) {
    if (savingStageId) return;
    setSavingStageId(stage.id);
    try {
      const res = await fetch(`/api/projekty/${project.id}/etapy/${stage.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ done_at: checked ? todayStr() : null }),
      });
      const data = (await res.json()) as { ok: boolean; stage?: ProjectStage; error?: string };
      if (data.ok && data.stage) {
        setStages((prev) => prev.map((s) => (s.id === stage.id ? data.stage! : s)));
        showToast('success', 'Zaktualizowano etap');
      } else {
        showToast('error', data.error ?? 'Blad serwera');
      }
    } catch {
      showToast('error', 'Blad polaczenia z serwerem');
    } finally {
      setSavingStageId(null);
    }
  }

  async function handleStageDeadlineBlur(stage: ProjectStage, value: string) {
    if (!value || value === stage.deadline) return;
    if (!DATE_RE.test(value)) return;
    if (savingStageId) return;
    setSavingStageId(stage.id);
    try {
      const res = await fetch(`/api/projekty/${project.id}/etapy/${stage.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deadline: value }),
      });
      const data = (await res.json()) as { ok: boolean; stage?: ProjectStage; error?: string };
      if (data.ok && data.stage) {
        setStages((prev) => prev.map((s) => (s.id === stage.id ? data.stage! : s)));
        showToast('success', 'Zapisano deadline');
      } else {
        showToast('error', data.error ?? 'Blad serwera');
      }
    } catch {
      showToast('error', 'Blad polaczenia z serwerem');
    } finally {
      setSavingStageId(null);
    }
  }

  // ── Notes handler ─────────────────────────────────────────────────────────

  async function handleSaveNotes() {
    setSavingNotes(true);
    try {
      const res = await fetch(`/api/projekty/${project.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: notesDraft || null }),
      });
      const data = (await res.json()) as { ok: boolean; project?: ProjectFull; error?: string };
      if (data.ok && data.project) {
        setProject(data.project);
        setNotesDraft(data.project.notes ?? '');
        showToast('success', 'Zapisano notatki');
      } else {
        showToast('error', data.error ?? 'Blad serwera');
      }
    } catch {
      showToast('error', 'Blad polaczenia z serwerem');
    } finally {
      setSavingNotes(false);
    }
  }

  // ── Links handlers ────────────────────────────────────────────────────────

  function addLink() {
    setLinksDraft((prev) => [...prev, { label: '', url: '' }]);
  }

  function updateLink(idx: number, field: keyof LinkDraft, value: string) {
    setLinksDraft((prev) => prev.map((l, i) => (i === idx ? { ...l, [field]: value } : l)));
  }

  function removeLink(idx: number) {
    setLinksDraft((prev) => prev.filter((_, i) => i !== idx));
  }

  async function handleSaveLinks() {
    for (const l of linksDraft) {
      if (!l.label.trim()) {
        showToast('error', 'Etykieta linku nie moze byc pusta');
        return;
      }
      if (!URL_RE.test(l.url.trim())) {
        showToast('error', 'URL musi zaczynac sie od http:// lub https://');
        return;
      }
    }
    setSavingLinks(true);
    try {
      const res = await fetch(`/api/projekty/${project.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          links: linksDraft.map((l) => ({ label: l.label.trim(), url: l.url.trim() })),
        }),
      });
      const data = (await res.json()) as { ok: boolean; project?: ProjectFull; error?: string };
      if (data.ok && data.project) {
        setProject(data.project);
        setLinksDraft(data.project.links ?? []);
        showToast('success', 'Zapisano linki');
      } else {
        showToast('error', data.error ?? 'Blad serwera');
      }
    } catch {
      showToast('error', 'Blad polaczenia z serwerem');
    } finally {
      setSavingLinks(false);
    }
  }

  const linksChanged =
    JSON.stringify(linksDraft) !== JSON.stringify(project.links ?? []);

  // ── Points handler ────────────────────────────────────────────────────────

  function handlePointsChange(val: number) {
    setPointsDraft(Math.max(1, Math.min(25, val)));
  }

  async function handleSavePoints() {
    setSavingPoints(true);
    try {
      const res = await fetch(`/api/projekty/${project.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ points: pointsDraft }),
      });
      const data = (await res.json()) as { ok: boolean; project?: ProjectFull; error?: string };
      if (data.ok && data.project) {
        setProject(data.project);
        showToast('success', 'Zapisano punkty');
      } else {
        showToast('error', data.error ?? 'Blad serwera');
      }
    } catch {
      showToast('error', 'Blad polaczenia z serwerem');
    } finally {
      setSavingPoints(false);
    }
  }

  // ── Archive handler ───────────────────────────────────────────────────────

  async function handleArchive(archive: boolean) {
    const msg = archive
      ? 'Zarchiwizowac projekt? Bedzie ukryty z domyslnej listy.'
      : 'Przywrocic projekt?';
    if (!confirm(msg)) return;
    try {
      const res = await fetch(`/api/projekty/${project.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_archived: archive }),
      });
      const data = (await res.json()) as { ok: boolean; project?: ProjectFull; error?: string };
      if (data.ok && data.project) {
        if (archive) {
          router.push('/projekty');
        } else {
          setProject(data.project);
          showToast('success', 'Projekt przywrocony');
        }
      } else {
        showToast('error', data.error ?? 'Blad serwera');
      }
    } catch {
      showToast('error', 'Blad polaczenia z serwerem');
    }
  }

  // ── Styles ────────────────────────────────────────────────────────────────

  const inputCls =
    'w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#FF5A3C] focus:border-transparent';
  const cardCls = 'bg-white border border-gray-200 rounded-lg p-6';
  const h2Cls = 'text-base font-semibold text-gray-900 mb-4';
  const btnPrimary =
    'px-4 py-2 bg-[#FF5A3C] hover:bg-[#E64428] text-white text-sm font-medium rounded-md disabled:opacity-60 disabled:cursor-not-allowed transition-colors';
  const btnPrimarySmall =
    'px-3 py-1 bg-[#FF5A3C] hover:bg-[#E64428] text-white text-sm font-medium rounded-md disabled:opacity-60 disabled:cursor-not-allowed transition-colors';

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      {/* Breadcrumb */}
      <nav className="text-sm text-gray-500 mb-2">
        <Link href="/projekty" className="hover:text-gray-700">
          Projekty
        </Link>
        <span className="mx-1">/</span>
        <span className="text-gray-900">{project.title}</span>
      </nav>

      {/* Header */}
      <div className="flex justify-between items-start mb-6 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{project.title}</h1>
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            <span className="flex items-center gap-1.5 text-sm text-gray-700">
              <span
                className="inline-block w-2.5 h-2.5 rounded-full shrink-0"
                style={{ backgroundColor: project.status_color }}
              />
              {project.status_name}
            </span>
            {project.is_archived && (
              <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded font-medium">
                ZARCHIWIZOWANY
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Main grid */}
      <div className="grid lg:grid-cols-3 gap-6">
        {/* ── Left column: Stages ──────────────────────────────────────── */}
        <div className="lg:col-span-2">
          <div className={cardCls}>
            <h2 className={h2Cls}>Etapy procesu</h2>
            {stages.length === 0 ? (
              <p className="text-sm text-gray-500">Brak etapow.</p>
            ) : (
              <div className="space-y-3">
                {stages.map((stage) => (
                  <div key={stage.id} className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={stage.done_at !== null}
                      disabled={savingStageId === stage.id}
                      onChange={(e) => void handleStageToggle(stage, e.target.checked)}
                      className="w-5 h-5 accent-[#FF5A3C] cursor-pointer shrink-0 disabled:cursor-not-allowed"
                    />
                    <div className="flex-1 min-w-0">
                      <p
                        className={`text-sm ${
                          stage.done_at
                            ? 'line-through text-gray-400'
                            : 'font-medium text-gray-900'
                        }`}
                      >
                        {stage.position}. {stage.name}
                      </p>
                      {stage.done_at && (
                        <p className="text-xs text-gray-500 mt-0.5">
                          Wykonano: {formatDatePL(stage.done_at)}
                        </p>
                      )}
                    </div>
                    <input
                      key={stage.deadline}
                      type="date"
                      defaultValue={stage.deadline}
                      disabled={stage.done_at !== null || savingStageId === stage.id}
                      onBlur={(e) => void handleStageDeadlineBlur(stage, e.target.value)}
                      className={`px-2 py-1 border rounded text-sm w-36 focus:outline-none focus:ring-2 focus:ring-[#FF5A3C] focus:border-transparent disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed ${
                        isOverdue(stage)
                          ? 'text-red-600 font-medium border-red-300'
                          : 'text-gray-700 border-gray-300'
                      }`}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── Right column ─────────────────────────────────────────────── */}
        <div className="space-y-6">
          {/* Card 1: Metadane */}
          <div className={cardCls}>
            <h2 className={h2Cls}>Metadane</h2>
            <dl className="text-sm divide-y divide-gray-100">
              <div className="py-2 flex justify-between gap-4">
                <dt className="text-gray-500 shrink-0">Klient</dt>
                <dd className="text-gray-900 text-right">{project.client_name}</dd>
              </div>
              <div className="py-2 flex justify-between gap-4">
                <dt className="text-gray-500 shrink-0">Typ projektu</dt>
                <dd className="text-gray-900 text-right">{project.type_name}</dd>
              </div>
              <div className="py-2 flex justify-between gap-4">
                <dt className="text-gray-500 shrink-0">Owner</dt>
                <dd className="text-gray-900 text-right">{project.owner_name}</dd>
              </div>
              <div className="py-2 flex justify-between gap-4">
                <dt className="text-gray-500 shrink-0">Status</dt>
                <dd className="flex items-center gap-1.5">
                  <span
                    className="inline-block w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: project.status_color }}
                  />
                  <span className="text-gray-900">{project.status_name}</span>
                </dd>
              </div>
              <div className="py-2 flex justify-between gap-4">
                <dt className="text-gray-500 shrink-0">Data otwarcia</dt>
                <dd className="text-gray-900">{formatDatePL(project.opened_at)}</dd>
              </div>
              <div className="py-2 flex justify-between gap-4">
                <dt className="text-gray-500 shrink-0">Data zamkniecia</dt>
                <dd className="text-gray-900">
                  {project.closed_at ? formatDatePL(project.closed_at) : '—'}
                </dd>
              </div>
            </dl>

            {/* Points */}
            <div className="border-t border-gray-200 pt-4 mt-4">
              <p className="text-sm font-medium text-gray-700 mb-2">Punkty</p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handlePointsChange(pointsDraft - 1)}
                  disabled={currentUserRole !== 'admin' || savingPoints}
                  className="w-8 h-8 flex items-center justify-center border border-gray-300 rounded-md text-gray-700 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed text-lg leading-none"
                >
                  −
                </button>
                <input
                  type="number"
                  min={1}
                  max={25}
                  step={1}
                  value={pointsDraft}
                  disabled={currentUserRole !== 'admin' || savingPoints}
                  onChange={(e) => handlePointsChange(Number(e.target.value))}
                  className="w-16 px-2 py-1.5 border border-gray-300 rounded-md text-sm text-center focus:outline-none focus:ring-2 focus:ring-[#FF5A3C] focus:border-transparent disabled:bg-gray-50 disabled:text-gray-400"
                />
                <button
                  type="button"
                  onClick={() => handlePointsChange(pointsDraft + 1)}
                  disabled={currentUserRole !== 'admin' || savingPoints}
                  className="w-8 h-8 flex items-center justify-center border border-gray-300 rounded-md text-gray-700 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed text-lg leading-none"
                >
                  +
                </button>
                {currentUserRole === 'admin' && pointsDraft !== project.points && (
                  <button
                    type="button"
                    onClick={() => void handleSavePoints()}
                    disabled={savingPoints}
                    className={btnPrimarySmall}
                  >
                    {savingPoints ? 'Zapis...' : 'Zapisz'}
                  </button>
                )}
              </div>
              {currentUserRole !== 'admin' && (
                <p className="text-xs text-gray-500 mt-1">Tylko admin moze zmieniac punkty</p>
              )}
            </div>
          </div>

          {/* Card 2: Notatki */}
          <div className={cardCls}>
            <h2 className={h2Cls}>Notatki</h2>
            <textarea
              rows={5}
              value={notesDraft}
              onChange={(e) => setNotesDraft(e.target.value)}
              className={inputCls + ' resize-none'}
              placeholder="Brak notatek..."
            />
            {notesDraft !== (project.notes ?? '') && (
              <div className="mt-3 flex justify-end">
                <button
                  type="button"
                  onClick={() => void handleSaveNotes()}
                  disabled={savingNotes}
                  className={btnPrimary}
                >
                  {savingNotes ? 'Zapisywanie...' : 'Zapisz notatki'}
                </button>
              </div>
            )}
          </div>

          {/* Card 3: Linki */}
          <div className={cardCls}>
            <div className="flex items-center gap-3 mb-4">
              <h2 className="text-base font-semibold text-gray-900">Linki</h2>
              <button
                type="button"
                onClick={addLink}
                className="text-sm text-[#FF5A3C] hover:underline"
              >
                + Dodaj link
              </button>
            </div>
            {linksDraft.length === 0 ? (
              <p className="text-sm text-gray-400">Brak linkow.</p>
            ) : (
              <div className="space-y-2">
                {linksDraft.map((l, idx) => (
                  <div key={idx} className="grid grid-cols-[1fr_2fr_auto] gap-2 items-center">
                    <input
                      type="text"
                      placeholder="Etykieta"
                      value={l.label}
                      onChange={(e) => updateLink(idx, 'label', e.target.value)}
                      className={inputCls}
                    />
                    <input
                      type="url"
                      placeholder="https://..."
                      value={l.url}
                      onChange={(e) => updateLink(idx, 'url', e.target.value)}
                      className={inputCls}
                    />
                    <button
                      type="button"
                      onClick={() => removeLink(idx)}
                      className="text-gray-400 hover:text-red-600 transition-colors px-1 text-xl leading-none"
                      aria-label="Usun link"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
            {linksChanged && (
              <div className="mt-3 flex justify-end">
                <button
                  type="button"
                  onClick={() => void handleSaveLinks()}
                  disabled={savingLinks}
                  className={btnPrimary}
                >
                  {savingLinks ? 'Zapisywanie...' : 'Zapisz linki'}
                </button>
              </div>
            )}
          </div>

          {/* Card 4: Akcje */}
          <div className={cardCls}>
            <h2 className={h2Cls}>Akcje</h2>
            {project.is_archived ? (
              <button
                type="button"
                onClick={() => void handleArchive(false)}
                className="px-4 py-2 text-sm border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 transition-colors"
              >
                Przywroc projekt
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void handleArchive(true)}
                className="px-4 py-2 text-sm border border-red-300 text-red-600 rounded-md hover:bg-red-50 transition-colors"
              >
                Archiwizuj projekt
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Toast */}
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
