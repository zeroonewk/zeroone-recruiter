'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { FUNNEL_LEVELS } from '@/lib/funnel';
import { formatRangePL, formatRangeShortPL } from '@/lib/date-ranges';
import type {
  PeriodNumbers,
  FreelancerRecommendation,
  FreelancerEvent,
  FreelancerEventLists,
  FreelancerPaymentItem,
} from '@/lib/status-metrics';
import type { PeriodKey, DateRange, Trend } from '@/lib/date-ranges';
import { countAlerts, type ProjectAlert } from '@/lib/alerts-shared';
import AlertList from '@/components/alerts/AlertList';
import InfoTip from '@/components/ui/InfoTip';
import HoverCard from '@/components/ui/HoverCard';
import type { FloatAlign } from '@/components/ui/Floating';
import FreelancerPaymentsModal from '@/components/status/FreelancerPaymentsModal';
import { todayWarsaw } from '@/lib/dates';

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

export type StatusNumbers = PeriodNumbers;

// ── Props ─────────────────────────────────────────────────────────────────────

type Props = {
  initialData: {
    closedStages: ClosedStage[];
    closedProjects: ClosedProject[];
    newProjects: NewProject[];
    funnelDeltas: FunnelDelta[];
    alerts: ProjectAlert[];
    upcomingStages: UpcomingStage[];
    numbers: StatusNumbers;
    prevNumbers: StatusNumbers;
    freelancerRecs: FreelancerRecommendation[];
  };
  availableUsers: { id: string; name: string }[];
  isAdmin: boolean;
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
  { label: 'Ten miesiac', value: 'this_month' },
  { label: 'Poprzedni miesiac', value: 'prev_month' },
  { label: 'Niestandardowy', value: 'custom' },
];

function fmtDate(s: string): string {
  const d = new Date(s + 'T00:00:00Z');
  return `${String(d.getUTCDate()).padStart(2, '0')}.${String(d.getUTCMonth() + 1).padStart(2, '0')}.${d.getUTCFullYear()}`;
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

// Definicje wspolne dla kafelkow "Liczby" i panelu "Analiza okresu".
const METRIC_INFO = {
  stages_closed: 'Liczba etapow projektowych zamknietych ptaszkiem w wybranym okresie.',
  success_count: 'Projekty z statusem "Zrealizowany" zamkniete w wybranym okresie.',
  new_projects: 'Projekty otwarte (data otwarcia) w wybranym okresie.',
  success_points: 'Suma punktow rekruterow z projektow zamknietych z sukcesem w okresie.',
  freelancer_recs: 'Liczba kandydatow zgloszonych przez freelancerow (data zgloszenia) w wybranym okresie.',
  freelancer_meetings: 'Spotkania z klientem odbyte w okresie (wg daty spotkania). Moga dotyczyc CV zgloszonych wczesniej.',
  freelancer_selected: 'Kandydaci freelancerow wybrani (zatrudnieni) w okresie, wg daty wyboru.',
  freelancer_estimate: 'Szacunkowe wynagrodzenie za zdarzenia z okresu: wartosc projektu za wybranego; stawki za CV i spotkania tylko tam, gdzie freelancer nie ma wybranego kandydata w tym projekcie. To estymacja, nie wyplata.',
} as const;

const ANALYSIS_ITEMS: { key: keyof StatusNumbers; label: string }[] = [
  { key: 'stages_closed', label: 'Etapy zrealizowane' },
  { key: 'success_count', label: 'Projekty zamkniete' },
  { key: 'new_projects', label: 'Nowe projekty' },
  { key: 'success_points', label: 'Punkty zdobyte' },
  { key: 'freelancer_recs', label: 'Rekomendacje freelancerow' },
  { key: 'freelancer_meetings', label: 'Spotkania z klientem (freelancerzy)' },
  { key: 'freelancer_selected', label: 'Wybrani (zatrudnienia)' },
  { key: 'freelancer_estimate', label: 'Szacunek wynagrodzen (zl)' },
];

// Baza < 5: roznica bezwzgledna ("2 -> 4"); baza >= 5: procent ze strzalka; oba 0: "-".
function PeriodChange({ current, previous }: { current: number; previous: number }) {
  if (current === 0 && previous === 0) {
    return <span className="text-sm text-gray-400">-</span>;
  }
  if (previous < 5) {
    const color = current > previous ? 'text-green-700' : current < previous ? 'text-red-700' : 'text-gray-500';
    return <span className={`text-sm font-medium ${color}`}>{previous} -&gt; {current}</span>;
  }
  const change = ((current - previous) / previous) * 100;
  const rounded = Math.round(change);
  if (rounded === 0) {
    return <span className="text-sm font-medium text-gray-500">= 0%</span>;
  }
  const up = rounded > 0;
  return (
    <span className={`text-sm font-medium ${up ? 'text-green-700' : 'text-red-700'}`}>
      {up ? '↑' : '↓'} {up ? '+' : '-'}{Math.abs(rounded)}%
    </span>
  );
}

// Kwoty w zl zaokraglone do pelnych zlotych (szacunek)
function fmtAmount(v: number): string {
  return String(Math.round(v));
}

function AnalysisBar({ value, max, color, label }: { value: number; max: number; color: string; label: string }) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  return (
    <div className="flex items-center gap-2" title={`${label}: ${value}`}>
      <div className="flex-1 h-3 bg-gray-50 rounded-sm overflow-hidden">
        <div
          className="h-full rounded-sm"
          style={{ width: `${pct}%`, minWidth: value > 0 ? '2px' : 0, backgroundColor: color }}
        />
      </div>
      <span className="w-14 text-right text-xs font-medium text-gray-700 tabular-nums">{fmtAmount(value)}</span>
    </div>
  );
}

// ── Dymki szczegolow w tabeli "Rekomendacje freelancerow" ────────────────────

type RecListKey = keyof FreelancerEventLists;

const REC_COLUMNS: {
  list: RecListKey;
  title: string;
  count: (r: FreelancerRecommendation) => number;
  align: FloatAlign;
}[] = [
  { list: 'submitted', title: 'Zgloszone', count: (r) => r.submitted, align: 'center' },
  { list: 'stage1', title: 'Etap 1 - CV przyjete', count: (r) => r.accepted, align: 'center' },
  { list: 'stage2', title: 'Etap 2 - spotkania z klientem', count: (r) => r.meetings, align: 'center' },
  { list: 'selected', title: 'Wybrani', count: (r) => r.selected, align: 'center' },
  { list: 'estimate', title: 'Szacunek prowizji', count: (r) => r.estimate, align: 'end' },
];

// Liczniki (lewa czesc tabeli); Szacunek prowizji jest w bloku "Rozliczenia"
const COUNT_COLUMNS = REC_COLUMNS.filter((c) => c.list !== 'estimate');

const EVENT_KIND_LABEL: Record<FreelancerEvent['kind'], string> = {
  submitted: 'zgloszenie',
  stage1: 'CV',
  stage2: 'spotkanie',
  selected: 'wybrany',
};

function fmtDM(s: string): string {
  return `${s.slice(8, 10)}.${s.slice(5, 7)}`;
}

function EventLine({ e, withAmount }: { e: FreelancerEvent; withAmount: boolean }) {
  if (!withAmount) {
    return (
      <li className="py-1">
        <span className="text-gray-900">{e.candidate_name}</span>
        <span className="text-gray-500"> - {e.project_title} - {fmtDM(e.date)}</span>
      </li>
    );
  }
  return (
    <li className={`py-1 flex justify-between gap-3 ${e.included ? 'text-gray-400' : ''}`}>
      <span className="min-w-0">
        <span className={e.included ? '' : 'text-gray-900'}>{e.candidate_name}</span>
        <span className={e.included ? '' : 'text-gray-500'}>
          {' '}- {e.project_title} - {EVENT_KIND_LABEL[e.kind]} - {fmtDM(e.date)}
        </span>
        {e.included && <span className="block text-[11px]">wliczone w kwote za wybranego</span>}
      </span>
      {!e.included && (
        <span className="shrink-0 tabular-nums font-medium text-gray-900">{fmtAmount(e.amount ?? 0)} zl</span>
      )}
    </li>
  );
}

function RecDetails({
  title,
  groups,
  withAmount,
  total,
}: {
  title: string;
  groups: { name?: string; events: FreelancerEvent[] }[];
  withAmount: boolean;
  total?: number;
}) {
  return (
    <div>
      <p className="px-3 pt-2.5 pb-1.5 font-semibold text-gray-900 border-b border-gray-100">{title}</p>
      {/* ok. 10 pozycji, dalej przewijanie */}
      <div className="max-h-64 overflow-y-auto px-3 py-1">
        {groups.map((g, i) => (
          <div key={g.name ?? i} className={i > 0 ? 'mt-2 pt-2 border-t border-gray-100' : ''}>
            {g.name && <p className="font-semibold text-gray-700 py-0.5">{g.name}</p>}
            <ul className="divide-y divide-gray-50">
              {g.events.map((e, j) => (
                <EventLine key={j} e={e} withAmount={withAmount} />
              ))}
            </ul>
          </div>
        ))}
      </div>
      {total !== undefined && (
        <p className="px-3 py-2 border-t border-gray-100 flex justify-between font-semibold text-gray-900">
          <span>Suma:</span>
          <span className="tabular-nums">{fmtAmount(total)} zl</span>
        </p>
      )}
    </div>
  );
}

function RecCell({
  value,
  display,
  title,
  groups,
  list,
  align,
  total,
}: {
  value: number;
  display: string;
  title: string;
  groups: { name?: string; events: FreelancerEvent[] }[];
  list: RecListKey;
  align: FloatAlign;
  total?: number;
}) {
  const hasItems = groups.some((g) => g.events.length > 0);
  return (
    <HoverCard
      disabled={value === 0 || !hasItems}
      align={align}
      label={`${title}: szczegoly`}
      content={
        <RecDetails
          title={title}
          groups={groups.filter((g) => g.events.length > 0)}
          withAmount={list === 'estimate'}
          total={total}
        />
      }
    >
      {display}
    </HoverCard>
  );
}

// ── Rozliczenia freelancerow ─────────────────────────────────────────────────

const MONEY_EPS = 0.005;

// Kwota w zl zaokraglona do pelnych zl, z minusem dla ujemnych (bez "-0")
function fmtZl(v: number): string {
  const r = Math.round(v);
  return `${r === 0 ? 0 : r} zl`;
}

function fmtZl2(v: number): string {
  return `${v < 0 ? '-' : ''}${Math.abs(v).toFixed(2)} zl`;
}

function dayBefore(s: string): string {
  const d = new Date(s + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

function fmtDMY(s: string): string {
  return `${s.slice(8, 10)}.${s.slice(5, 7)}.${s.slice(0, 4)}`;
}

type MoneyTotals = {
  earned_before: number;
  paid_before: number;
  carry_in: number;
  estimate: number;
  paid: number;
  carry_out: number;
};

function CarryInDetails({ t, start }: { t: MoneyTotals; start: string }) {
  const d = fmtDMY(dayBefore(start));
  return (
    <div className="px-3 py-2.5 space-y-1">
      <p className="font-semibold text-gray-900">Z przeniesienia</p>
      <p className="flex justify-between gap-3"><span>Zarobione do {d}:</span><span className="tabular-nums">{fmtZl(t.earned_before)}</span></p>
      <p className="flex justify-between gap-3"><span>Wyplacone do tego dnia:</span><span className="tabular-nums">{fmtZl(t.paid_before)}</span></p>
      <p className="flex justify-between gap-3 pt-1 border-t border-gray-100 font-semibold text-gray-900">
        <span>Z przeniesienia:</span><span className="tabular-nums">{fmtZl(t.carry_in)}</span>
      </p>
    </div>
  );
}

function CarryOutDetails({ t }: { t: MoneyTotals }) {
  return (
    <div className="px-3 py-2.5 space-y-1">
      <p className="font-semibold text-gray-900">Do przeniesienia</p>
      <p className="flex justify-between gap-3"><span>Z przeniesienia</span><span className="tabular-nums">{fmtZl(t.carry_in)}</span></p>
      <p className="flex justify-between gap-3"><span>+ Szacunek prowizji</span><span className="tabular-nums">{fmtZl(t.estimate)}</span></p>
      <p className="flex justify-between gap-3"><span>- Wyplacone</span><span className="tabular-nums">{fmtZl(t.paid)}</span></p>
      <p className="flex justify-between gap-3 pt-1 border-t border-gray-100 font-semibold text-gray-900">
        <span>= Do przeniesienia</span><span className="tabular-nums">{fmtZl(t.carry_out)}</span>
      </p>
    </div>
  );
}

function PaymentsDetails({
  title,
  groups,
  total,
}: {
  title: string;
  groups: { name?: string; payments: FreelancerPaymentItem[] }[];
  total: number;
}) {
  return (
    <div>
      <p className="px-3 pt-2.5 pb-1.5 font-semibold text-gray-900 border-b border-gray-100">{title}</p>
      <div className="max-h-64 overflow-y-auto px-3 py-1">
        {groups.map((g, i) => (
          <div key={g.name ?? i} className={i > 0 ? 'mt-2 pt-2 border-t border-gray-100' : ''}>
            {g.name && <p className="font-semibold text-gray-700 py-0.5">{g.name}</p>}
            <ul className="divide-y divide-gray-50">
              {g.payments.map((p) => (
                <li key={p.id} className="py-1 flex justify-between gap-3">
                  <span className="min-w-0">
                    <span className="text-gray-900 tabular-nums">{fmtDM(p.paid_on)}</span>
                    {p.note && <span className="text-gray-500"> - {p.note}</span>}
                  </span>
                  <span className={`shrink-0 tabular-nums font-medium ${p.amount < 0 ? 'text-red-700' : 'text-gray-900'}`}>
                    {fmtZl2(p.amount)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <p className="px-3 py-2 border-t border-gray-100 flex justify-between font-semibold text-gray-900">
        <span>Suma:</span>
        <span className="tabular-nums">{fmtZl(total)}</span>
      </p>
    </div>
  );
}

// Kwota z dymkiem; 0 (po zaokragleniu) — bez dymka
function MoneyCell({
  value,
  label,
  content,
  align = 'end',
  className = '',
}: {
  value: number;
  label: string;
  content: React.ReactNode;
  align?: FloatAlign;
  className?: string;
}) {
  return (
    <span className={className}>
      <HoverCard disabled={Math.round(value) === 0} align={align} label={label} content={content} width={300}>
        {fmtZl(value)}
      </HoverCard>
    </span>
  );
}

// Przy aktywnym filtrze rekrutera salda nie sa liczone — "—" z wyjasnieniem
function NoBalanceCell() {
  return (
    <HoverCard
      label="Salda niedostepne przy filtrze rekrutera"
      width={240}
      content={<p className="px-3 py-2.5">Salda dostepne bez filtra rekrutera</p>}
    >
      <span className="text-gray-400">—</span>
    </HoverCard>
  );
}

function carryOutCls(v: number, periodEnded: boolean): string {
  if (v <= -MONEY_EPS && Math.round(v) !== 0) return 'text-red-700';
  if (periodEnded && Math.round(v) > 0) return 'text-orange-600';
  return '';
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function StatusMeetingClient({
  initialData,
  availableUsers,
  isAdmin,
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
  const [paymentsFor, setPaymentsFor] = useState<{ userId: string; name: string } | null>(null);

  const { closedStages, closedProjects, newProjects, funnelDeltas, alerts, upcomingStages, numbers, prevNumbers, freelancerRecs } = initialData;
  const recTotals: Record<RecListKey, number> = { submitted: 0, stage1: 0, stage2: 0, selected: 0, estimate: 0 };
  for (const r of freelancerRecs) {
    for (const col of REC_COLUMNS) recTotals[col.list] += col.count(r);
  }
  const moneyTotals: MoneyTotals = { earned_before: 0, paid_before: 0, carry_in: 0, estimate: 0, paid: 0, carry_out: 0 };
  for (const r of freelancerRecs) {
    moneyTotals.earned_before += r.earned_before;
    moneyTotals.paid_before += r.paid_before;
    moneyTotals.carry_in += r.carry_in;
    moneyTotals.estimate += r.estimate;
    moneyTotals.paid += r.paid;
    moneyTotals.carry_out += r.carry_out;
  }
  const periodEnded = range.end < todayWarsaw();
  // Salda (Z przeniesienia / Wyplacone / Do przeniesienia) tylko dla "Wszyscy"
  const balancesAvailable = selectedUserId === 'all';
  const alertCounts = countAlerts(alerts);

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
  const recCellCls = 'px-3 py-2.5';

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
              <InfoTip text={METRIC_INFO.stages_closed} />
            </p>
            <p className="text-3xl font-bold text-gray-900 mt-2">{numbers.stages_closed}</p>
            <TrendBadge trend={trends.stages_closed} />
          </div>
          <div className={cardCls}>
            <p className="text-xs text-gray-500 uppercase tracking-wide">
              Projekty zamkniete
              <InfoTip text={METRIC_INFO.success_count} />
            </p>
            <p className="text-3xl font-bold text-gray-900 mt-2">{numbers.success_count}</p>
            <TrendBadge trend={trends.success_count} />
          </div>
          <div className={cardCls}>
            <p className="text-xs text-gray-500 uppercase tracking-wide">
              Nowe projekty
              <InfoTip text={METRIC_INFO.new_projects} />
            </p>
            <p className="text-3xl font-bold text-gray-900 mt-2">{numbers.new_projects}</p>
            <TrendBadge trend={trends.new_projects} />
          </div>
          <div className={cardCls}>
            <p className="text-xs text-gray-500 uppercase tracking-wide">
              Punkty zdobyte
              <InfoTip text={METRIC_INFO.success_points} />
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

      {/* ── Rekomendacje freelancerow ───────────────────────────────────── */}
      <div className={cardCls}>
        <h2 className="text-base font-semibold text-gray-900 mb-4">
          Rekomendacje freelancerow
          <InfoTip
            align="start"
            text="Zdarzenia z kandydatami freelancerow w okresie, kazde wg wlasnej daty: zgloszenie CV, przyjecie CV (Etap 1), spotkanie z klientem (Etap 2) i wybor kandydata. Freelancer widoczny, gdy ma co najmniej jedno zdarzenie w okresie, niezerowe saldo z przeniesienia lub wyplate w okresie."
          />
        </h2>
        {freelancerRecs.length === 0 ? (
          <p className={emptyTextCls}>Brak rekomendacji freelancerow w tym okresie</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[880px] table-fixed text-sm">
              <colgroup>
                <col className="w-[20%]" />
                <col className="w-[8%]" />
                <col className="w-[8%]" />
                <col className="w-[8%]" />
                <col className="w-[8%]" />
                <col className="w-[12%]" />
                <col className="w-[12%]" />
                <col className="w-[12%]" />
                <col className="w-[12%]" />
              </colgroup>
              <thead>
                <tr className="text-xs text-gray-500 uppercase tracking-wide">
                  <th colSpan={5} />
                  <th colSpan={4} className={recCellCls + ' text-center font-semibold text-gray-700 border-l border-gray-200 border-b border-gray-100'}>
                    <HoverCard
                      label="Rozliczenia: wzor"
                      width={300}
                      content={
                        <div className="px-3 py-2.5 space-y-1 normal-case">
                          <p className="font-semibold text-gray-900">Rozliczenia</p>
                          <p>Z przeniesienia + Szacunek - Wyplacone = Do przeniesienia</p>
                          <p className="text-gray-500">
                            Salda liczone z calej historii zdarzen i wyplat. Wyplaty sa przypisane do freelancera
                            i nie podlegaja filtrowi rekrutera.
                          </p>
                        </div>
                      }
                    >
                      Rozliczenia
                    </HoverCard>
                  </th>
                </tr>
                <tr className="text-xs text-gray-500 uppercase tracking-wide">
                  <th className={recCellCls + ' text-left font-medium'}>Freelancer</th>
                  <th className={recCellCls + ' text-center font-medium'}>
                    Zgloszone
                    <InfoTip text={'Zgloszone: ' + METRIC_INFO.freelancer_recs} />
                  </th>
                  <th className={recCellCls + ' text-center font-medium'}>
                    Etap 1
                    <InfoTip text="Zaakceptowane (Etap 1 - CV przyjete): Kandydaci, ktorych CV zostalo przyjete w okresie (wg daty przyjecia)." />
                  </th>
                  <th className={recCellCls + ' text-center font-medium'}>
                    Etap 2
                    <InfoTip text={'Spotkania z klientem (Etap 2): ' + METRIC_INFO.freelancer_meetings} />
                  </th>
                  <th className={recCellCls + ' text-center font-medium'}>
                    Wybrany
                    <InfoTip text={METRIC_INFO.freelancer_selected} />
                  </th>
                  <th className={recCellCls + ' text-center font-medium border-l border-gray-200'}>Z przeniesienia</th>
                  <th className={recCellCls + ' text-center font-medium'}>
                    Szacunek prowizji
                    <InfoTip align="end" text={METRIC_INFO.freelancer_estimate} />
                  </th>
                  <th className={recCellCls + ' text-center font-medium'}>Wyplacone</th>
                  <th className={recCellCls + ' text-center font-medium'}>Do przeniesienia</th>
                </tr>
              </thead>
              <tbody>
                {freelancerRecs.map((r) => {
                  const t: MoneyTotals = r;
                  return (
                    <tr key={r.user_id} className="border-t border-gray-100">
                      <td className={recCellCls + ' text-left text-gray-900'}>
                        <div className="flex items-center justify-between gap-2 min-w-0">
                          <span className="truncate" title={r.name}>{r.name}</span>
                          {isAdmin && (
                            <button
                              type="button"
                              onClick={() => setPaymentsFor({ userId: r.user_id, name: r.name })}
                              className="shrink-0 text-xs font-medium text-[#FF5A3C] hover:underline"
                            >
                              Wyplaty
                            </button>
                          )}
                        </div>
                      </td>
                      {COUNT_COLUMNS.map((col) => {
                        const value = col.count(r);
                        return (
                          <td key={col.list} className={recCellCls + ' text-center tabular-nums text-gray-900'}>
                            <RecCell
                              value={value}
                              display={String(value)}
                              title={`${col.title} - ${r.name}`}
                              groups={[{ events: r.events[col.list] }]}
                              list={col.list}
                              align={col.align}
                            />
                          </td>
                        );
                      })}
                      <td className={recCellCls + ' text-center tabular-nums text-gray-900 border-l border-gray-200'}>
                        {balancesAvailable ? (
                          <MoneyCell
                            value={r.carry_in}
                            label={`Z przeniesienia - ${r.name}`}
                            content={<CarryInDetails t={t} start={range.start} />}
                            className={r.carry_in <= -MONEY_EPS && Math.round(r.carry_in) !== 0 ? 'text-red-700' : ''}
                          />
                        ) : <NoBalanceCell />}
                      </td>
                      <td className={recCellCls + ' text-center tabular-nums text-gray-900'}>
                        <RecCell
                          value={Math.round(r.estimate)}
                          display={fmtZl(r.estimate)}
                          title={`Szacunek prowizji - ${r.name}`}
                          groups={[{ events: r.events.estimate }]}
                          list="estimate"
                          align="end"
                          total={r.estimate}
                        />
                      </td>
                      <td className={recCellCls + ' text-center tabular-nums text-gray-900'}>
                        {balancesAvailable ? (
                          <MoneyCell
                            value={r.paid}
                            label={`Wyplacone - ${r.name}`}
                            content={<PaymentsDetails title={`Wyplacone - ${r.name}`} groups={[{ payments: r.payments }]} total={r.paid} />}
                          />
                        ) : <NoBalanceCell />}
                      </td>
                      <td className={recCellCls + ' text-center tabular-nums text-gray-900 font-medium'}>
                        {balancesAvailable ? (
                          <MoneyCell
                            value={r.carry_out}
                            label={`Do przeniesienia - ${r.name}`}
                            content={<CarryOutDetails t={t} />}
                            className={carryOutCls(r.carry_out, periodEnded)}
                          />
                        ) : <NoBalanceCell />}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t border-gray-200 bg-gray-50 font-semibold text-gray-900">
                  <td className={recCellCls + ' text-left'}>Razem</td>
                  {COUNT_COLUMNS.map((col) => {
                    const value = recTotals[col.list];
                    return (
                      <td key={col.list} className={recCellCls + ' text-center tabular-nums'}>
                        <RecCell
                          value={value}
                          display={String(value)}
                          title={`${col.title} - razem`}
                          groups={freelancerRecs.map((r) => ({ name: r.name, events: r.events[col.list] }))}
                          list={col.list}
                          align={col.align}
                        />
                      </td>
                    );
                  })}
                  <td className={recCellCls + ' text-center tabular-nums border-l border-gray-200'}>
                    {balancesAvailable ? (
                      <MoneyCell
                        value={moneyTotals.carry_in}
                        label="Z przeniesienia - razem"
                        content={<CarryInDetails t={moneyTotals} start={range.start} />}
                        className={moneyTotals.carry_in <= -MONEY_EPS && Math.round(moneyTotals.carry_in) !== 0 ? 'text-red-700' : ''}
                      />
                    ) : <NoBalanceCell />}
                  </td>
                  <td className={recCellCls + ' text-center tabular-nums'}>
                    <RecCell
                      value={Math.round(moneyTotals.estimate)}
                      display={fmtZl(moneyTotals.estimate)}
                      title="Szacunek prowizji - razem"
                      groups={freelancerRecs.map((r) => ({ name: r.name, events: r.events.estimate }))}
                      list="estimate"
                      align="end"
                      total={moneyTotals.estimate}
                    />
                  </td>
                  <td className={recCellCls + ' text-center tabular-nums'}>
                    {balancesAvailable ? (
                      <MoneyCell
                        value={moneyTotals.paid}
                        label="Wyplacone - razem"
                        content={
                          <PaymentsDetails
                            title="Wyplacone - razem"
                            groups={freelancerRecs
                              .filter((r) => r.payments.length > 0)
                              .map((r) => ({ name: r.name, payments: r.payments }))}
                            total={moneyTotals.paid}
                          />
                        }
                      />
                    ) : <NoBalanceCell />}
                  </td>
                  <td className={recCellCls + ' text-center tabular-nums'}>
                    {balancesAvailable ? (
                      <MoneyCell
                        value={moneyTotals.carry_out}
                        label="Do przeniesienia - razem"
                        content={<CarryOutDetails t={moneyTotals} />}
                        className={carryOutCls(moneyTotals.carry_out, periodEnded)}
                      />
                    ) : <NoBalanceCell />}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {paymentsFor && isAdmin && (
        <FreelancerPaymentsModal
          userId={paymentsFor.userId}
          name={paymentsFor.name}
          onClose={() => setPaymentsFor(null)}
        />
      )}

      {/* ── Analiza okresu ───────────────────────────────────────────────── */}
      <div className={cardCls}>
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 mb-4">
          <h2 className="text-base font-semibold text-gray-900">Analiza okresu</h2>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-600">
            <span className="inline-flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-sm bg-[#FF5A3C]" />
              Biezacy okres ({formatRangeShortPL(range)})
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-sm bg-[#D1D5DB]" />
              Poprzedni okres ({formatRangeShortPL(comparisonRange)})
            </span>
          </div>
        </div>
        <div className="divide-y divide-gray-100">
          {ANALYSIS_ITEMS.map((item) => {
            const cur = numbers[item.key];
            const prev = prevNumbers[item.key];
            const max = Math.max(cur, prev);
            return (
              <div
                key={item.key}
                className="grid grid-cols-[1fr_auto] sm:grid-cols-[12rem_1fr_6rem] items-center gap-x-4 gap-y-2 py-3"
              >
                <div className="text-sm text-gray-700">
                  {item.label}
                  <InfoTip text={METRIC_INFO[item.key]} />
                </div>
                <div className="col-span-2 row-start-2 sm:col-span-1 sm:row-start-auto space-y-1">
                  <AnalysisBar value={cur} max={max} color="#FF5A3C" label="Biezacy okres" />
                  <AnalysisBar value={prev} max={max} color="#D1D5DB" label="Poprzedni okres" />
                </div>
                <div className="text-right col-start-2 row-start-1 sm:col-start-auto sm:row-start-auto">
                  <PeriodChange current={cur} previous={prev} />
                </div>
              </div>
            );
          })}
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
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Wymaga uwagi</h2>
          <span className="text-sm text-gray-600">
            <span className="font-medium text-red-700">Krytyczne: {alertCounts.critical}</span>
            {' | '}
            <span className="font-medium text-orange-700">Ostrzezenia: {alertCounts.warning}</span>
          </span>
        </div>
        <div className="space-y-4">

          {/* Klasyfikacja projektow wg progow alertow */}
          <div className={cardCls}>
            <h3 className="text-base font-semibold text-gray-900 mb-4">
              Projekty
              <InfoTip text="Jeden wiersz na projekt. Krytyczne: etap po terminie ponad prog, priorytet 1 po terminie ponad prog lub brak aktywnosci ponad prog (Ustawienia > Progi alertow). Ostrzezenia: etapy po terminie ponizej progow. W toku rownolegle: zalegly etap, ale pozniejszy etap jest juz zamkniety." />
              <span className="ml-2 text-sm font-normal text-gray-500">({alerts.length})</span>
            </h3>
            <AlertList alerts={alerts} />
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

        </div>
      </div>
    </div>
  );
}
