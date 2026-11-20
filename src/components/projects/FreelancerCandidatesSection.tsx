'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { calcFreelancerEarnings, type CandidateStatus, type FreelancerRates } from '@/lib/freelancer-earnings';


type Candidate = {
  id: string;
  full_name: string;
  cv_url: string;
  status: CandidateStatus;
  user_id: string;
  freelancer_name: string;
  stage1_at: string | null;
  stage2_at: string | null;
  selected_at: string | null;
};

type StageStatus = Exclude<CandidateStatus, 'submitted'>;

const STAGE_DATE_KEY: Record<StageStatus, 'stage1_at' | 'stage2_at' | 'selected_at'> = {
  stage1: 'stage1_at',
  stage2: 'stage2_at',
  selected: 'selected_at',
};

const STAGE_LABEL: Record<StageStatus, string> = {
  stage1: 'Etap 1',
  stage2: 'Etap 2',
  selected: 'Wybrany',
};

// Dialog daty: przejscie w przod ('advance') albo korekta daty aktualnego etapu ('date')
type DateDialog = {
  candidateId: string;
  candidateName: string;
  mode: 'advance' | 'date';
  stage: StageStatus;
  date: string;
  anchor: { top: number; bottom: number; left: number; right: number };
};

// Dzis w strefie firmy (YYYY-MM-DD) — zgodne z walidacja w API
function todayWarsaw(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Warsaw' }).format(new Date());
}

function fmtDayMonth(s: string): string {
  return `${s.slice(8, 10)}.${s.slice(5, 7)}`;
}

type FreelancerGroup = {
  user_id: string;
  freelancer_name: string;
  candidates: Candidate[];
};

type Props = {
  projectId: string;
  freelancerRates: FreelancerRates;
  projectPoints: number;
  canEdit: boolean;
};

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

export default function FreelancerCandidatesSection({ projectId, freelancerRates, projectPoints, canEdit }: Props) {
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

  const [dialog, setDialog] = useState<DateDialog | null>(null);
  const [dialogError, setDialogError] = useState('');
  const [actionError, setActionError] = useState('');

  async function sendPatch(candidateId: string, body: { status?: CandidateStatus; date?: string }): Promise<string | null> {
    setUpdatingId(candidateId);
    try {
      const res = await fetch(`/api/admin/freelancer/candidates/${candidateId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as {
        ok: boolean;
        error?: string;
        item?: Pick<Candidate, 'status' | 'stage1_at' | 'stage2_at' | 'selected_at'>;
      };
      if (data.ok && data.item) {
        const item = data.item;
        setCandidates((prev) =>
          prev.map((c) =>
            c.id === candidateId
              ? { ...c, status: item.status, stage1_at: item.stage1_at, stage2_at: item.stage2_at, selected_at: item.selected_at }
              : c
          )
        );
        return null;
      }
      return data.error ?? 'Nie udalo sie zapisac';
    } catch {
      return 'Blad sieci';
    } finally {
      setUpdatingId(null);
    }
  }

  function openDialog(
    e: React.SyntheticEvent<HTMLElement>,
    c: Candidate,
    mode: DateDialog['mode'],
    stage: StageStatus
  ) {
    const r = e.currentTarget.getBoundingClientRect();
    setDialogError('');
    setActionError('');
    setDialog({
      candidateId: c.id,
      candidateName: c.full_name,
      mode,
      stage,
      date: mode === 'date' ? (c[STAGE_DATE_KEY[stage]] ?? todayWarsaw()) : todayWarsaw(),
      anchor: { top: r.top, bottom: r.bottom, left: r.left, right: r.right },
    });
  }

  // Klik w checkbox etapu: w przod -> dialog daty; w tyl -> od razu (backend czysci date)
  function handleToggle(e: React.ChangeEvent<HTMLInputElement>, c: Candidate, forward: StageStatus, back: CandidateStatus) {
    const isForward = c.status === back;
    if (isForward) {
      openDialog(e, c, 'advance', forward);
      return;
    }
    setActionError('');
    void sendPatch(c.id, { status: back }).then((err) => {
      if (err) setActionError(`${c.full_name}: ${err}`);
    });
  }

  async function saveDialog() {
    if (!dialog) return;
    const today = todayWarsaw();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dialog.date)) {
      setDialogError('Podaj date');
      return;
    }
    if (dialog.date > today) {
      setDialogError('Data nie moze byc z przyszlosci');
      return;
    }
    const err = await sendPatch(
      dialog.candidateId,
      dialog.mode === 'advance' ? { status: dialog.stage, date: dialog.date } : { date: dialog.date }
    );
    if (err) setDialogError(err);
    else setDialog(null);
  }

  // Komorka etapu: checkbox + mala data (klikalna dla aktualnego etapu)
  function renderStageCell(c: Candidate, stage: StageStatus, back: CandidateStatus, checked: boolean, disabled: boolean) {
    const date = c[STAGE_DATE_KEY[stage]];
    const canFixDate = canEdit && checked && c.status === stage && updatingId !== c.id;
    return (
      <td className="px-4 py-2.5 text-center">
        <div className="inline-flex flex-col items-center gap-0.5">
          <input
            type="checkbox"
            checked={checked}
            disabled={disabled}
            onChange={(e) => handleToggle(e, c, stage, back)}
            aria-label={`${STAGE_LABEL[stage]} - ${c.full_name}`}
            className="w-4 h-4 accent-[#FF5A3C] cursor-pointer disabled:cursor-default"
          />
          {checked && date && (
            canFixDate ? (
              <button
                type="button"
                onClick={(e) => openDialog(e, c, 'date', stage)}
                title="Popraw date"
                className="text-[11px] leading-none text-gray-400 hover:text-gray-700 hover:underline tabular-nums"
              >
                {fmtDayMonth(date)}
              </button>
            ) : (
              <span className="text-[11px] leading-none text-gray-400 tabular-nums">{fmtDayMonth(date)}</span>
            )
          )}
        </div>
      </td>
    );
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
        <h2 className="text-base font-semibold text-gray-900 mb-2">Kandydaci freelancerow (0)</h2>
        <p className="text-sm text-gray-500">Brak kandydatow.</p>
      </div>
    );
  }

  const groups = groupByFreelancer(candidates);

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-6">
      <h2 className="text-base font-semibold text-gray-900 mb-6">Kandydaci freelancerow ({candidates.length})</h2>

      {actionError && <p className="-mt-4 mb-4 text-sm text-red-600">{actionError}</p>}

      <div className="space-y-8">
        {groups.map((group) => {
          const earnings = calcFreelancerEarnings({
            rates: freelancerRates,
            points: projectPoints,
            candidates: group.candidates,
          });

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
                      const stage1Disabled = !canEdit || !['submitted', 'stage1'].includes(c.status) || updatingId === c.id;
                      const stage2Disabled = !canEdit || !['stage1', 'stage2'].includes(c.status) || updatingId === c.id;
                      const selectedDisabled = !canEdit || !['stage2', 'selected'].includes(c.status) || updatingId === c.id;

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
                          {renderStageCell(c, 'stage1', 'submitted', stage1Checked, stage1Disabled)}
                          {renderStageCell(c, 'stage2', 'stage1', stage2Checked, stage2Disabled)}
                          {renderStageCell(c, 'selected', 'stage2', selectedChecked, selectedDisabled)}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Earnings summary — wspolna logika z widokiem freelancera i zamknieciem projektu */}
              <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-gray-600 pl-1">
                {earnings.mode === 'selected' ? (
                  <>
                    <span>
                      Wybrany:{' '}
                      <span className="text-gray-500">{earnings.selectedCount} &times; {earnings.effectiveValue} zł</span>
                      {' = '}
                      <strong className="text-gray-800">{earnings.amount} zł</strong>
                    </span>
                    {/* CV i spotkania wliczone w kwote za wybranego — pokazane informacyjnie */}
                    <span className="text-gray-400">
                      CV: {earnings.stage1Count} &times; {freelancerRates.cv_rate} zł = 0 zł
                      <span className="ml-1">(wliczone w kwote za wybranego)</span>
                    </span>
                    <span className="text-gray-400">
                      Spotkania z klientem: {earnings.stage2Count} &times; {freelancerRates.meeting_rate} zł = 0 zł
                      <span className="ml-1">(wliczone w kwote za wybranego)</span>
                    </span>
                  </>
                ) : (
                  <>
                    <span>
                      CV:{' '}
                      <span className="text-gray-500">{earnings.stage1Count} &times; {freelancerRates.cv_rate} zł</span>
                      {' = '}
                      <strong className="text-gray-800">{earnings.stage1Count * freelancerRates.cv_rate} zł</strong>
                    </span>
                    <span>
                      Spotkania:{' '}
                      <span className="text-gray-500">{earnings.stage2Count} &times; {freelancerRates.meeting_rate} zł</span>
                      {' = '}
                      <strong className="text-gray-800">{earnings.stage2Count * freelancerRates.meeting_rate} zł</strong>
                    </span>
                  </>
                )}
                <span className="font-semibold text-[#FF5A3C]">
                  Suma: {earnings.amount} zł
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {dialog && (
        <StageDateDialog
          dialog={dialog}
          error={dialogError}
          saving={updatingId === dialog.candidateId}
          onChange={(date) => setDialog((d) => (d ? { ...d, date } : d))}
          onSave={() => void saveDialog()}
          onCancel={() => setDialog(null)}
        />
      )}
    </div>
  );
}

// ── Okienko z data etapu ─────────────────────────────────────────────────────

const DIALOG_WIDTH = 240;

function StageDateDialog({
  dialog,
  error,
  saving,
  onChange,
  onSave,
  onCancel,
}: {
  dialog: DateDialog;
  error: string;
  saving: boolean;
  onChange: (date: string) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const today = todayWarsaw();

  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onCancel();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel(); };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [onCancel]);

  // Pod kliknietym elementem, wysrodkowane i przyciete do ekranu
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1024;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 768;
  const width = Math.min(DIALOG_WIDTH, vw - 16);
  const center = (dialog.anchor.left + dialog.anchor.right) / 2;
  const left = Math.max(8, Math.min(center - width / 2, vw - width - 8));
  const openUp = dialog.anchor.bottom + 170 > vh;
  const style: React.CSSProperties = openUp
    ? { position: 'fixed', left, width, bottom: vh - dialog.anchor.top + 6 }
    : { position: 'fixed', left, width, top: dialog.anchor.bottom + 6 };

  const title =
    dialog.mode === 'advance'
      ? `${STAGE_LABEL[dialog.stage]} - data`
      : `Popraw date: ${STAGE_LABEL[dialog.stage]}`;

  return createPortal(
    <div
      ref={ref}
      role="dialog"
      aria-label={title}
      style={style}
      className="z-[1000] bg-white border border-gray-200 rounded-lg shadow-lg p-3 text-left"
    >
      <p className="text-sm font-medium text-gray-900">{title}</p>
      <p className="text-xs text-gray-500 truncate mb-2" title={dialog.candidateName}>{dialog.candidateName}</p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSave();
        }}
      >
        <input
          type="date"
          value={dialog.date}
          max={today}
          onChange={(e) => onChange(e.target.value)}
          autoFocus
          className="w-full px-2 py-1 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#FF5A3C]"
        />
        {error && <p className="mt-1.5 text-xs text-red-600">{error}</p>}
        <div className="mt-3 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="px-3 py-1.5 text-sm font-medium text-gray-600 rounded-md hover:bg-gray-100 transition-colors"
          >
            Anuluj
          </button>
          <button
            type="submit"
            disabled={saving || !dialog.date}
            className="px-3 py-1.5 bg-[#FF5A3C] hover:bg-[#E64428] text-white text-sm font-medium rounded-md disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {saving ? 'Zapisywanie...' : 'Zapisz'}
          </button>
        </div>
      </form>
    </div>,
    document.body
  );
}
