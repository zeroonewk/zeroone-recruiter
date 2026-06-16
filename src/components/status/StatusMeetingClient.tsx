'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { FUNNEL_LEVELS } from '@/lib/funnel';
import { formatRangePL } from '@/lib/date-ranges';
import type { PeriodKey, DateRange, Trend } from '@/lib/date-ranges';

// ── Exported types (imported by page.tsx) ─────────────────────────────────────

export type ClosedStage = {
  id: string;
  stage_name: string;
  done_at: string;
  project_id: string;
  project_title: string;
  client_name: string;
  owner_id: string;
  owner_name: string;
};

export type ClosedProject = {
  id: string;
  title: string;
  client_name: string;
  owner_name: string;
  status_name: string;
  is_success: boolean;
  closed_at: string;
  points: number;
};

export type NewProject = {
  id: string;
  title: string;
  client_name: string;
  owner_name: string;
  opened_at: string;
  points: number;
};

export type FunnelDelta = {
  project_id: string;
  project_title: string;
  client_name: string;
  owner_name: string;
  deltas: Record<string, number>;
  total_delta: number;
};

export type OverdueStage = {
  id: string;
  stage_name: string;
  deadline: string;
  days_overdue: number;
  project_id: string;
  project_title: string;
  client_name: string;
  owner_name: string;
};

export type UpcomingStage = {
  id: string;
  stage_name: string;
  deadline: string;
  days_until: number;
  project_id: string;
  project_title: string;
  client_name: string;
  owner_name: string;
};

export type InactiveProject = {
  id: string;
  title: string;
  client_name: string;
  owner_name: string;
  updated_at: string | null;
  opened_at: string;
};

export type StatusNumbers = {
  stages_closed: number;
  success_count: number;
  success_points: number;
  new_projects: number;
};

// ── Props ─────────────────────────────────────────────────────────────────────

type Props = {
  initialData: {
    closedStages: ClosedStage[];
    closedProjects: ClosedProject[];
    newProjects: NewProject[];
    funnelDeltas: FunnelDelta[];
    overdueStages: OverdueStage[];
    upcomingStages: UpcomingStage[];
    inactiveProjects: InactiveProject[];
    numbers: StatusNumbers;
  };
  availableUsers: { id: string; name: string }[];
  selectedPeriod: PeriodKey;
  selectedUserId: string; // 'all' | 'me' | UUID
  customRange?: { od: string; do: string };
  currentUserId: string;
  range: DateRange;
  trends: {
    stages_closed: Trend;
    success_count: Trend;
    success_points: Trend;
    new_projects: Trend;
  };
  comparisonRange: DateRange;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const PERIOD_OPTIONS: { label: string; value: PeriodKey }[] = [
  { label: 'Dzis', value: 'today' },
  { label: 'Ten tydzien', value: 'this_week' },
  { label: 'Poprzedni tydzien', value: 'last_week' },
  { label: 'Niestandardowy', value: 'custom' },
];

function fmtDate(s: string): string {
  const d = new Date(s + 'T00:00:00Z');
  return `${String(d.getUTCDate()).padStart(2, '0')}.${String(d.getUTCMonth() + 1).padStart(2, '0')}.${d.getUTCFullYear()}`;
}

function InfoTip({ text }: { text: string }) {
  return (
    <span className="group relative inline-flex items-center ml-1.5 align-middle">
      <span
        className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-gray-200 text-gray-600 text-[10px] font-bold cursor-help hover:bg-gray-300"
        aria-label={text}
      >
        i
      </span>
      <span className="pointer-events-none absolute left-1/2 -translate-x-1/2 bottom-full mb-2 w-64 px-3 py-2 bg-gray-900 text-white text-xs rounded-md shadow-lg opacity-0 group-hover:opacity-100 transition-opacity z-50 whitespace-normal text-left">
        {text}
        <span className="absolute top-full left-1/2 -translate-x-1/2 -mt-0.5 border-4 border-transparent border-t-gray-900" />
      </span>
    </span>
  );
}

function TrendBadge({ trend }: { trend: Trend }) {
  const config = {
    up:   { arrow: '↑', color: 'text-green-700', sign: '+' },
    down: { arrow: '↓', color: 'text-red-700',   sign: '-' },
    flat: { arrow: '=', color: 'text-gray-500',  sign: '' },
    new:  { arrow: '↑', color: 'text-green-700', sign: '' },
  };
  const c = config[trend.direction];
  const text = trend.direction === 'flat'
    ? 'bez zmiany'
    : trend.direction === 'new'
    ? 'nowy'
    : `${c.sign}${trend.percent.toFixed(0)}%`;

  return (
    <span className={`text-xs font-medium ${c.color} mt-1 inline-flex items-center gap-1`}>
      <span>{c.arrow}</span>
      <span>{text}</span>
    </span>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function StatusMeetingClient({
  initialData,
  availableUsers,
  selectedPeriod,
  selectedUserId,
  customRange,
  currentUserId,
  range,
  trends,
  comparisonRange,
}: Props) {
  const router = useRouter();
  const [customMode, setCustomMode] = useState(selectedPeriod === 'custom');
  const [customOd, setCustomOd] = useState(customRange?.od ?? '');
  const [customDo, setCustomDo] = useState(customRange?.do ?? '');

  const { closedStages, closedProjects, newProjects, funnelDeltas, overdueStages, upcomingStages, inactiveProjects, numbers } = initialData;

  function navigate(updates: { okres?: string; rekruter?: string; od?: string; do?: string }) {
    const sp = new URLSearchParams();
    const okres = updates.okres ?? selectedPeriod;
    sp.set('okres', okres);
    sp.set('rekruter', updates.rekruter ?? selectedUserId);
    if (okres === 'custom') {
      sp.set('od', updates.od ?? customRange?.od ?? '');
      sp.set('do', updates.do ?? customRange?.do ?? '');
    }
    router.push(`/status?${sp.toString()}`);
  }

  function applyCustomRange() {
    if (!customOd || !customDo || customOd > customDo) return;
    navigate({ okres: 'custom', od: customOd, do: customDo });
  }

  // ── Styles ────────────────────────────────────────────────────────────────

  const cardCls = 'bg-white border border-gray-200 rounded-lg p-6';
  const sectionTitleCls = 'text-base font-semibold text-gray-900 mb-4';
  const emptyTextCls = 'text-sm text-gray-400';

  const activeTabCls = 'px-3 py-1.5 rounded-md text-sm font-medium bg-[#FF5A3C]/10 text-[#FF5A3C]';
  const inactiveTabCls = 'px-3 py-1.5 rounded-md text-sm font-medium text-gray-600 hover:bg-gray-100 transition-colors';

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">

      {/* ── Header ───────────────────────────────────────────────────────── */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Status Meeting</h1>
        <p className="text-sm text-gray-500 mt-1">{formatRangePL(range)}</p>
      </div>

      {/* ── Filters ──────────────────────────────────────────────────────── */}
      <div className={cardCls + ' py-4'}>
        <div className="flex flex-wrap gap-4 items-center">
          {/* Period tabs */}
          <div className="flex items-center gap-1 flex-wrap">
            {PERIOD_OPTIONS.filter((opt) => opt.value !== 'custom').map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => {
                  setCustomMode(false);
                  navigate({ okres: opt.value });
                }}
                className={selectedPeriod === opt.value && !customMode ? activeTabCls : inactiveTabCls}
              >
                {opt.label}
              </button>
            ))}
            <button
              type="button"
              onClick={() => {
                setCustomMode(true);
                setCustomOd(customRange?.od ?? '');
                setCustomDo(customRange?.do ?? '');
              }}
              className={customMode ? activeTabCls : inactiveTabCls}
            >
              Niestandardowy
            </button>
          </div>

          {/* Custom date inputs */}
          {customMode && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm text-gray-500">Od</span>
              <input
                type="date"
                value={customOd}
                onChange={(e) => setCustomOd(e.target.value)}
                className="px-2 py-1 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#FF5A3C]"
              />
              <span className="text-sm text-gray-500">Do</span>
              <input
                type="date"
                value={customDo}
                onChange={(e) => setCustomDo(e.target.value)}
                className="px-2 py-1 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#FF5A3C]"
              />
              <button
                type="button"
                onClick={applyCustomRange}
                disabled={!customOd || !customDo || customOd > customDo}
                className="px-3 py-1.5 bg-[#FF5A3C] hover:bg-[#E64428] text-white text-sm font-medium rounded-md disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Zastosuj
              </button>
            </div>
          )}

          {/* Recruiter filter */}
          <div className="ml-auto">
            <select
              value={selectedUserId}
              onChange={(e) => navigate({ rekruter: e.target.value })}
              className="px-3 py-1.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#FF5A3C]"
            >
              <option value="all">Wszyscy</option>
              <option value="me">Ja</option>
              {availableUsers
                .filter((u) => u.id !== currentUserId)
                .map((u) => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
            </select>
          </div>
        </div>
      </div>

      {/* ── Liczby ───────────────────────────────────────────────────────── */}
      <div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className={cardCls}>
            <p className="text-xs text-gray-500 uppercase tracking-wide">
              Etapy zrealizowane
              <InfoTip text="Liczba etapow projektowych zamknietych ptaszkiem w wybranym okresie." />
            </p>
            <p className="text-3xl font-bold text-gray-900 mt-2">{numbers.stages_closed}</p>
            <TrendBadge trend={trends.stages_closed} />
          </div>
          <div className={cardCls}>
            <p className="text-xs text-gray-500 uppercase tracking-wide">
              Projekty zamkniete
              <InfoTip text='Projekty z statusem "Zrealizowany" zamkniete w wybranym okresie.' />
            </p>
            <p className="text-3xl font-bold text-gray-900 mt-2">{numbers.success_count}</p>
            <TrendBadge trend={trends.success_count} />
          </div>
          <div className={cardCls}>
            <p className="text-xs text-gray-500 uppercase tracking-wide">
              Nowe projekty
              <InfoTip text="Projekty otwarte (data otwarcia) w wybranym okresie." />
            </p>
            <p className="text-3xl font-bold text-gray-900 mt-2">{numbers.new_projects}</p>
            <TrendBadge trend={trends.new_projects} />
          </div>
          <div className={cardCls}>
            <p className="text-xs text-gray-500 uppercase tracking-wide">
              Punkty zdobyte
              <InfoTip text="Suma punktow rekruterow z projektow zamknietych z sukcesem w okresie." />
            </p>
            <p className="text-3xl font-bold text-[#FF5A3C] mt-2">{numbers.success_points}</p>
            <TrendBadge trend={trends.success_points} />
          </div>
        </div>
        <div className="mt-3 text-xs text-gray-500 flex items-center justify-end">
          <span>Trend porownywany z: {formatRangePL(comparisonRange)}</span>
          <InfoTip text="Trend pokazuje zmiane wzgledem analogicznego poprzedniego okresu. Dla 'Ten tydzien' to poprzedni tydzien (Pon-Nd). Dla 'Dzis' to wczoraj. Dla zakresu niestandardowego — zakres tej samej dlugosci bezposrednio przed. Roznice mniejsze niz 5% pokazywane jako 'bez zmiany'." />
        </div>
      </div>

      {/* ── Highlights ───────────────────────────────────────────────────── */}
      <div>
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Highlights</h2>
        <div className="grid lg:grid-cols-2 gap-6">

          {/* Etapy zrealizowane */}
          <div className={cardCls}>
            <h3 className={sectionTitleCls}>
              Etapy zrealizowane
              <InfoTip text="Lista konkretnych etapow zamknietych w okresie z nazwa projektu, klientem i rekruterem." />
              <span className="ml-2 text-sm font-normal text-gray-500">({closedStages.length})</span>
            </h3>
            {closedStages.length === 0 ? (
              <p className={emptyTextCls}>Brak danych</p>
            ) : (
              <ul className="space-y-2">
                {closedStages.map((s) => (
                  <li key={s.id} className="flex items-start gap-3 text-sm">
                    <span className="shrink-0 text-gray-400 w-16">{fmtDate(s.done_at)}</span>
                    <div className="min-w-0">
                      <Link href={`/projekty/${s.project_id}`} className="font-medium text-gray-900 hover:text-[#FF5A3C] truncate block">
                        {s.project_title}
                      </Link>
                      <p className="text-gray-500 truncate">{s.stage_name} · {s.client_name} · {s.owner_name}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Projekty zamkniete */}
          <div className={cardCls}>
            <h3 className={sectionTitleCls}>
              Projekty zamkniete
              <InfoTip text="Projekty ktore osiagnely status koncowy (sukces lub anulowanie) w okresie." />
              <span className="ml-2 text-sm font-normal text-gray-500">({closedProjects.length})</span>
            </h3>
            {closedProjects.length === 0 ? (
              <p className={emptyTextCls}>Brak danych</p>
            ) : (
              <ul className="space-y-2">
                {closedProjects.map((p) => (
                  <li key={p.id} className="flex items-start gap-3 text-sm">
                    <span className="shrink-0 text-gray-400 w-16">{fmtDate(p.closed_at)}</span>
                    <div className="min-w-0">
                      <Link href={`/projekty/${p.id}`} className="font-medium text-gray-900 hover:text-[#FF5A3C] truncate block">
                        {p.title}
                      </Link>
                      <p className="text-gray-500 truncate">
                        {p.status_name} · {p.client_name} · {p.owner_name} · {p.points} pkt
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Nowe projekty */}
          <div className={cardCls}>
            <h3 className={sectionTitleCls}>
              Nowe projekty
              <InfoTip text="Projekty rozpoczete w okresie. Pokazuje ile pkt jest do zdobycia." />
              <span className="ml-2 text-sm font-normal text-gray-500">({newProjects.length})</span>
            </h3>
            {newProjects.length === 0 ? (
              <p className={emptyTextCls}>Brak danych</p>
            ) : (
              <ul className="space-y-2">
                {newProjects.map((p) => (
                  <li key={p.id} className="flex items-start gap-3 text-sm">
                    <span className="shrink-0 text-gray-400 w-16">{fmtDate(p.opened_at)}</span>
                    <div className="min-w-0">
                      <Link href={`/projekty/${p.id}`} className="font-medium text-gray-900 hover:text-[#FF5A3C] truncate block">
                        {p.title}
                      </Link>
                      <p className="text-gray-500 truncate">{p.client_name} · {p.owner_name} · {p.points} pkt</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Lejek przyrost */}
          <div className={cardCls}>
            <h3 className={sectionTitleCls}>
              Lejek przyrost
              <InfoTip text="Lista aktywnych projektow gdzie liczby w lejku procesu wzrosly w okresie. Pokazuje na ktorych etapach byl ruch." />
              <span className="ml-2 text-sm font-normal text-gray-500">({funnelDeltas.length})</span>
            </h3>
            {funnelDeltas.length === 0 ? (
              <p className={emptyTextCls}>Brak danych</p>
            ) : (
              <ul className="space-y-3">
                {funnelDeltas.map((fd) => (
                  <li key={fd.project_id} className="text-sm">
                    <Link href={`/projekty/${fd.project_id}`} className="font-medium text-gray-900 hover:text-[#FF5A3C]">
                      {fd.project_title}
                    </Link>
                    <p className="text-gray-500 text-xs mb-1">{fd.client_name} · {fd.owner_name}</p>
                    <div className="flex flex-wrap gap-1">
                      {FUNNEL_LEVELS.filter((lvl) => (fd.deltas[lvl.key] ?? 0) > 0).map((lvl) => (
                        <span
                          key={lvl.key}
                          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs bg-green-50 text-green-700"
                        >
                          {lvl.label} +{fd.deltas[lvl.key]}
                        </span>
                      ))}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      {/* ── Wymaga uwagi ─────────────────────────────────────────────────── */}
      <div>
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Wymaga uwagi</h2>
        <div className="space-y-4">

          {/* Przeterminowane */}
          <div className={cardCls}>
            <h3 className="text-base font-semibold text-red-700 mb-4">
              Przeterminowane
              <InfoTip text="Etapy projektowe z deadlinem w przeszlosci ktore nie zostaly zamkniete. Wymagaja natychmiastowej uwagi." />
              <span className="ml-2 text-sm font-normal text-red-500">({overdueStages.length})</span>
            </h3>
            {overdueStages.length === 0 ? (
              <p className={emptyTextCls}>Brak przeterminowanych etapow</p>
            ) : (
              <ul className="space-y-2">
                {overdueStages.map((s) => (
                  <li key={s.id} className="flex items-start gap-3 text-sm">
                    <span className="shrink-0 font-medium text-red-600 w-24">{fmtDate(s.deadline)}</span>
                    <div className="min-w-0 flex-1">
                      <Link href={`/projekty/${s.project_id}`} className="font-medium text-gray-900 hover:text-[#FF5A3C] truncate block">
                        {s.project_title}
                      </Link>
                      <p className="text-gray-500 truncate">{s.stage_name} · {s.client_name} · {s.owner_name}</p>
                    </div>
                    <span className="shrink-0 text-xs font-medium text-red-600 bg-red-50 px-2 py-0.5 rounded">
                      +{s.days_overdue} dni
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Zblizajace */}
          <div className={cardCls}>
            <h3 className="text-base font-semibold text-yellow-700 mb-4">
              Zblizajace sie (3 dni)
              <InfoTip text="Etapy z deadlinem w najblizszych 3 dniach. Czas dzialac zeby uniknac przeterminowania." />
              <span className="ml-2 text-sm font-normal text-yellow-500">({upcomingStages.length})</span>
            </h3>
            {upcomingStages.length === 0 ? (
              <p className={emptyTextCls}>Brak zblizajacych sie terminow</p>
            ) : (
              <div className="space-y-2">
                {upcomingStages.map((s) => (
                  <div key={s.id} className="flex items-start gap-3 text-sm">
                    <span className="shrink-0 font-medium text-yellow-700 w-24">{fmtDate(s.deadline)}</span>
                    <div className="min-w-0 flex-1">
                      <Link href={`/projekty/${s.project_id}`} className="font-medium text-gray-900 hover:text-[#FF5A3C] truncate block">
                        {s.project_title}
                      </Link>
                      <p className="text-gray-500 truncate">{s.stage_name} · {s.client_name} · {s.owner_name}</p>
                    </div>
                    <span className="shrink-0 text-xs font-medium text-yellow-700 bg-yellow-50 px-2 py-0.5 rounded">
                      {s.days_until === 0 ? 'Dzisiaj' : `za ${s.days_until} dni`}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Bez aktywnosci */}
          <div className={cardCls}>
            <h3 className="text-base font-semibold text-orange-700 mb-4">
              Bez aktywnosci (&gt;7 dni)
              <InfoTip text="Projekty bez zadnej zmiany od ponad 7 dni (brak edycji projektu, brak zamknietego etapu)." />
              <span className="ml-2 text-sm font-normal text-orange-500">({inactiveProjects.length})</span>
            </h3>
            {inactiveProjects.length === 0 ? (
              <p className={emptyTextCls}>Brak projektow bez aktywnosci</p>
            ) : (
              <ul className="space-y-2">
                {inactiveProjects.map((p) => (
                  <li key={p.id} className="flex items-start gap-3 text-sm">
                    <div className="min-w-0 flex-1">
                      <Link href={`/projekty/${p.id}`} className="font-medium text-gray-900 hover:text-[#FF5A3C] truncate block">
                        {p.title}
                      </Link>
                      <p className="text-gray-500 truncate">{p.client_name} · {p.owner_name}</p>
                    </div>
                    {p.updated_at && (
                      <span className="shrink-0 text-xs text-orange-700 bg-orange-50 px-2 py-0.5 rounded">
                        ost. {fmtDate(p.updated_at)}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}
