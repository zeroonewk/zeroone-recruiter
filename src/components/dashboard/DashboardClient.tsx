'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FUNNEL_LEVELS, pct, type FunnelData } from '@/lib/funnel';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  LabelList,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts';

// ── Public types (imported by the server page) ────────────────────────────────

export type Period = 'month' | 'prev_month' | 'quarter' | 'year' | 'all';

export type DashboardData = {
  redProjects: {
    total: number;
    items: {
      id: string;
      title: string;
      client_name: string;
      owner_name: string;
      stage_name: string;
      stage_deadline: string;
      days_overdue: number;
    }[];
  };
  workload: { id: string; name: string; active_count: number; priority_count: number }[];
  freelancerProjectCount: number;
  stagesOverview: { stage_name: string; position: number; project_count: number }[];
  points: {
    total: number;
    ranking: { id: string; name: string; points: number }[];
  };
  performance: {
    avg_days: number | null;
    success_count: number;
    total_count: number;
  };
  split: {
    types: { id: string; name: string; count: number }[];
    statuses: { id: string; name: string; color: string; count: number }[];
    active_total: { points: number; count: number };
    priority_statuses: { id: string; name: string; color: string; count: number; points: number }[];
    priority_total_points: number;
  };
  funnelTotals: FunnelData;
};

type Props = {
  initialData: DashboardData;
  period: Period;
};

// ── Constants ─────────────────────────────────────────────────────────────────

const PERIOD_OPTIONS = [
  { label: 'Ten miesiac', value: 'month' as Period, param: '' },
  { label: 'Poprzedni miesiac', value: 'prev_month' as Period, param: 'poprzedni_miesiac' },
  { label: 'Ten kwartal', value: 'quarter' as Period, param: 'kwartal' },
  { label: 'Ten rok', value: 'year' as Period, param: 'rok' },
  { label: 'Wszystko', value: 'all' as Period, param: 'wszystko' },
] as const;

const PERIOD_LABEL: Record<Period, string> = {
  month: 'Ten miesiac',
  prev_month: 'Poprzedni miesiac',
  quarter: 'Ten kwartal',
  year: 'Ten rok',
  all: 'Wszystko',
};

const PIE_PALETTE = ['#FF5A3C', '#3B82F6', '#10B981', '#F59E0B', '#8B5CF6', '#EC4899'];

const TOOLTIP_STYLE = {
  wrapperStyle: { outline: 'none' },
  contentStyle: {
    backgroundColor: 'white',
    border: '1px solid #e5e7eb',
    borderRadius: '6px',
    fontSize: '12px',
  },
};

const CARD = 'bg-white border border-gray-200 rounded-lg p-6';
const H3 = 'text-sm font-semibold text-gray-900';

function pluralProjekty(n: number): string {
  return n === 1 ? 'projekcie' : 'projektach';
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function DashboardClient({ initialData, period }: Props) {
  const router = useRouter();
  const { redProjects, workload, freelancerProjectCount, stagesOverview, points, performance, split, funnelTotals } = initialData;
  const [splitView, setSplitView] = useState<'types' | 'statuses'>('types');

  function handlePeriod(param: string) {
    router.push(param ? `/dashboard?okres=${param}` : '/dashboard');
  }

  const successRate =
    performance.total_count === 0
      ? null
      : Math.round((performance.success_count / performance.total_count) * 100);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      {/* Header + period toggle */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <div
          className="flex rounded-md overflow-hidden border border-gray-200 divide-x divide-gray-200"
          role="group"
          aria-label="Okres"
        >
          {PERIOD_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              aria-label={opt.label}
              aria-pressed={period === opt.value}
              onClick={() => handlePeriod(opt.param)}
              className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                period === opt.value
                  ? 'bg-[#FF5A3C] text-white'
                  : 'bg-white text-gray-700 hover:bg-gray-50'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Upper row: operational widgets (period-independent) ──────────── */}
      <div className="grid lg:grid-cols-3 gap-4 mb-6">

        {/* Widget 1: Red projects */}
        <div className={`${CARD} border-l-4 border-l-red-500`}>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
            Wymagaja uwagi
          </p>
          <p className="text-4xl font-bold text-red-600 leading-none">{redProjects.total}</p>
          <p className="text-sm text-gray-600 mt-1">
            {redProjects.total === 1
              ? 'projekt'
              : redProjects.total < 5
              ? 'projekty'
              : 'projektow'}{' '}
            przeterminowanych
          </p>

          {redProjects.total === 0 ? (
            <div className="flex items-center gap-2 mt-4 text-green-700">
              <span className="inline-block w-2.5 h-2.5 rounded-full bg-green-500 shrink-0" />
              <span className="text-sm font-medium">Wszystko na czas</span>
            </div>
          ) : (
            <div
              className="mt-3 space-y-1 overflow-y-auto max-h-[180px]"
              style={
                redProjects.items.length > 3
                  ? {
                      maskImage: 'linear-gradient(to bottom, black 80%, transparent 100%)',
                      WebkitMaskImage: 'linear-gradient(to bottom, black 80%, transparent 100%)',
                    }
                  : undefined
              }
            >
              {redProjects.items.map((item) => (
                <Link
                  key={item.id}
                  href={`/projekty/${item.id}`}
                  aria-label={`${item.title} — ${item.days_overdue} ${item.days_overdue === 1 ? 'dzien' : 'dni'} po terminie`}
                  className="block px-2 py-1.5 rounded-md hover:bg-red-50 transition-colors -mx-2"
                >
                  <p className="text-sm font-medium text-gray-900 truncate">{item.title}</p>
                  <p className="text-xs text-gray-500 mt-0.5 truncate">
                    {item.client_name} · Etap: {item.stage_name} ·{' '}
                    {item.days_overdue} {item.days_overdue === 1 ? 'dzien' : 'dni'} po terminie
                  </p>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Widget 2: Workload */}
        <div className={CARD}>
          <h3 className={`${H3} mb-1`}>Workload zespolu</h3>
          <p className="text-xs text-gray-500 mb-4">Aktywne projekty per rekruter</p>
          {workload.length === 0 && freelancerProjectCount === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">Brak danych</p>
          ) : (
            (() => {
              const workloadData = [
                ...workload,
                { id: '__freelancers__', name: 'Freelancerzy', active_count: freelancerProjectCount, priority_count: 0 },
              ].filter((d) => d.active_count > 0);
              const max = Math.max(...workloadData.map((d) => d.active_count), 1);
              return (
                <div>
                  <div className="space-y-2">
                    {workloadData.map((entry) => {
                      const total = entry.active_count;
                      const priority = entry.id === '__freelancers__' ? 0 : entry.priority_count;
                      const others = total - priority;
                      return (
                        <div key={entry.id} className="flex items-center gap-2 text-sm">
                          <span className="w-24 truncate text-xs text-gray-700 shrink-0 text-right">{entry.name}</span>
                          <div className="flex-1 bg-gray-100 rounded-sm h-5 overflow-hidden">
                            <div
                              className="h-full flex"
                              style={{ width: `${(total / max) * 100}%` }}
                            >
                              {priority > 0 && (
                                <div
                                  className="bg-green-500 h-full"
                                  style={{ width: `${(priority / total) * 100}%` }}
                                />
                              )}
                              <div
                                className="h-full"
                                style={{
                                  width: `${(others / total) * 100}%`,
                                  backgroundColor: entry.id === '__freelancers__' ? '#3B82F6' : '#FF5A3C',
                                }}
                              />
                            </div>
                          </div>
                          <span className="text-xs font-semibold text-gray-700 w-4 text-right shrink-0">{total}</span>
                        </div>
                      );
                    })}
                  </div>
                  <div className="flex items-center gap-4 mt-3 pt-2 border-t border-gray-100">
                    <div className="flex items-center gap-1.5 text-xs text-gray-600">
                      <span className="w-3 h-3 rounded-sm bg-green-500 shrink-0" />
                      Priorytetowe (score 1-2)
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-gray-600">
                      <span className="w-3 h-3 rounded-sm bg-[#FF5A3C] shrink-0" />
                      Pozostale
                    </div>
                  </div>
                </div>
              );
            })()
          )}
        </div>

        {/* Widget 3: Stages overview */}
        <div className={CARD}>
          <h3 className={`${H3} mb-1`}>Etapy procesow</h3>
          <p className="text-xs text-gray-500 mb-4">Aktywne projekty per etap</p>
          {stagesOverview.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">Brak danych</p>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart
                data={stagesOverview}
                margin={{ top: 20, right: 8, bottom: 40, left: 0 }}
              >
                <XAxis
                  dataKey="stage_name"
                  tick={{ fontSize: 11 }}
                  angle={-30}
                  textAnchor="end"
                  interval={0}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis hide />
                <Tooltip
                  {...TOOLTIP_STYLE}
                  formatter={(value) => [`${value} projektow`, '']}
                />
                <Bar dataKey="project_count" fill="#3B82F6" radius={[4, 4, 0, 0]}>
                  <LabelList
                    dataKey="project_count"
                    position="top"
                    style={{ fill: '#374151', fontSize: 12, fontWeight: 600 }}
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* ── Lower row: Split ─────────────────────────────────────────────── */}
      <div className="grid lg:grid-cols-3 gap-4">

        {/* Widget 6: Split (full width row) */}
        <div className={`${CARD} lg:col-span-3`}>
          <div className="flex items-center justify-between mb-4">
            <h3 className={H3}>Split projektow</h3>
            <div className="flex gap-1">
              <button
                onClick={() => setSplitView('types')}
                className={`px-2.5 py-1 text-xs rounded transition-colors ${
                  splitView === 'types'
                    ? 'bg-[#FF5A3C] text-white'
                    : 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-50'
                }`}
              >
                Typ
              </button>
              <button
                onClick={() => setSplitView('statuses')}
                className={`px-2.5 py-1 text-xs rounded transition-colors ${
                  splitView === 'statuses'
                    ? 'bg-[#FF5A3C] text-white'
                    : 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-50'
                }`}
              >
                Status
              </button>
            </div>
          </div>

          {split.active_total.count > 0 && (
            <div className="mb-4 pb-4 border-b border-gray-100">
              <div className="text-xs uppercase tracking-wide text-gray-600 mb-1">
                Wartosc aktywnego pipeline
              </div>
              <div className="flex items-baseline gap-3">
                <div className="text-3xl font-bold text-[#FF5A3C]">
                  {split.active_total.points}
                </div>
                <div className="text-sm text-gray-500">
                  pkt w {split.active_total.count}{' '}
                  {pluralProjekty(split.active_total.count)}
                </div>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            {/* Left: types / statuses split */}
            <div>
              {(() => {
                const data = splitView === 'types' ? split.types : split.statuses;
                if (data.length === 0) {
                  return <p className="text-sm text-gray-400 text-center py-6">Brak danych</p>;
                }
                return (
                  <ResponsiveContainer width="100%" height={240}>
                    <PieChart>
                      <Pie
                        data={data}
                        dataKey="count"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        outerRadius={75}
                        label={({ value }: { value: number }) => value}
                        labelLine={false}
                      >
                        {data.map((entry, idx) => (
                          <Cell
                            key={entry.id}
                            fill={
                              'color' in entry
                                ? (entry as { color: string }).color
                                : PIE_PALETTE[idx % PIE_PALETTE.length]
                            }
                          />
                        ))}
                      </Pie>
                      <Tooltip
                        {...TOOLTIP_STYLE}
                        formatter={(value) => [`${value} projektow`, '']}
                      />
                      <Legend wrapperStyle={{ fontSize: '12px' }} />
                    </PieChart>
                  </ResponsiveContainer>
                );
              })()}
            </div>

            {/* Right: priority statuses split */}
            <div>
              <p className={`${H3} mb-3`}>Split priorytetowych</p>
              {split.priority_statuses.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-6">Brak projektow priorytetowych</p>
              ) : (
                <>
                  <ResponsiveContainer width="100%" height={200}>
                    <PieChart>
                      <Pie
                        data={split.priority_statuses}
                        dataKey="count"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        outerRadius={65}
                        label={({ value }: { value: number }) => value}
                        labelLine={false}
                      >
                        {split.priority_statuses.map((entry) => (
                          <Cell key={entry.id} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip
                        {...TOOLTIP_STYLE}
                        formatter={(value) => [`${value} projektow`, '']}
                      />
                      <Legend wrapperStyle={{ fontSize: '12px' }} />
                    </PieChart>
                  </ResponsiveContainer>
                  <p className="text-center text-xs text-gray-500 mt-1">
                    Suma pkt:{' '}
                    <span className="font-bold text-[#FF5A3C]">{split.priority_total_points}</span>
                  </p>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Funnel widget */}
      <div className="mt-6">
        <FunnelWidget data={funnelTotals} />
      </div>

      {/* Widget 4+5: Points + Performance (period-dependent, na dole) */}
      <div className="mt-6 grid lg:grid-cols-3 gap-4">
        <div className={`${CARD} lg:col-span-2`}>
          <div className="grid grid-cols-3 gap-6 h-full">
            <div>
              <h3 className={`${H3} mb-1`}>Punkty zdobyte</h3>
              <p className="text-xs text-gray-500 mb-4">{PERIOD_LABEL[period]}</p>
              <p className="text-5xl font-bold text-[#FF5A3C] leading-none">{points.total}</p>
              <p className="text-sm text-gray-600 mt-2">
                {points.total === 1 ? 'punkt' : 'punktow'} zdobyte
              </p>
            </div>
            <div className="col-span-2">
              <h3 className={`${H3} mb-4`}>Ranking rekruterow</h3>
              {points.ranking.length === 0 ? (
                <p className="text-sm text-gray-400">Brak punktow w tym okresie</p>
              ) : (
                <ResponsiveContainer
                  width="100%"
                  height={Math.max(120, points.ranking.length * 36)}
                >
                  <BarChart
                    layout="vertical"
                    data={points.ranking}
                    margin={{ top: 0, right: 40, bottom: 0, left: 0 }}
                  >
                    <XAxis type="number" hide />
                    <YAxis
                      type="category"
                      dataKey="name"
                      width={110}
                      tick={{ fontSize: 12 }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip
                      {...TOOLTIP_STYLE}
                      formatter={(value) => [`${value} pkt`, '']}
                    />
                    <Bar dataKey="points" fill="#FF5A3C" radius={[0, 4, 4, 0]}>
                      <LabelList
                        dataKey="points"
                        position="right"
                        style={{ fill: '#374151', fontSize: 12, fontWeight: 600 }}
                      />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        </div>

        <div className={CARD}>
          <h3 className={`${H3} mb-4`}>Wydajnosc</h3>

          <div className="mb-5">
            <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">
              Sredni czas realizacji
            </p>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold text-gray-900">
                {performance.avg_days ?? '—'}
              </span>
              {performance.avg_days !== null && (
                <span className="text-gray-500 text-sm">dni</span>
              )}
            </div>
            <p className="text-xs text-gray-400 mt-1">od otwarcia do zamkniecia z sukcesem</p>
          </div>

          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Skutecznosc</p>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold text-gray-900">
                {performance.success_count} / {performance.total_count}
              </span>
            </div>
            <p className="text-3xl font-bold text-gray-900 mt-1">
              {successRate !== null ? `${successRate}%` : '—'}
            </p>
            <p className="text-xs text-gray-400 mt-1">projekty zamkniete z sukcesem</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── FunnelWidget ──────────────────────────────────────────────────────────────

function FunnelWidget({ data }: { data: FunnelData }) {
  const total = FUNNEL_LEVELS.reduce((sum, lvl) => sum + data[lvl.key], 0);

  if (total === 0) {
    return (
      <div className={CARD}>
        <h2 className="text-xl font-bold mb-1">Lejek zespolu</h2>
        <p className="text-sm text-gray-500 mb-6">
          Suma kandydatow ze wszystkich aktywnych projektow
        </p>
        <p className="text-sm text-gray-400 text-center py-6">Brak danych w lejku</p>
      </div>
    );
  }

  return (
    <div className={CARD}>
      <h2 className="text-xl font-bold mb-1">Lejek zespolu</h2>
      <p className="text-sm text-gray-500 mb-6">
        Suma kandydatow ze wszystkich aktywnych projektow
      </p>

      <div className="space-y-3">
        {FUNNEL_LEVELS.map((lvl, idx) => {
          const value = data[lvl.key];
          const prev = idx > 0 ? FUNNEL_LEVELS[idx - 1] : null;
          const prevValue = prev ? data[prev.key] : null;
          const barWidth =
            data.sourcing === 0
              ? '0%'
              : `${Math.min(100, (value / data.sourcing) * 100)}%`;

          return (
            <div key={lvl.key} className="grid grid-cols-[200px_1fr_120px] gap-4 items-center">
              {/* Label */}
              <div className="font-medium text-sm text-gray-900">{lvl.label}</div>

              {/* Bar + value overlay */}
              <div className="relative bg-gray-100 rounded h-8 overflow-hidden">
                <div
                  className="bg-[#FF5A3C] h-8 rounded transition-all"
                  style={{ width: barWidth }}
                />
                <div className="absolute inset-0 flex items-center px-3 text-sm font-medium text-gray-900">
                  {value}
                </div>
              </div>

              {/* Conversion */}
              <div className="text-sm text-gray-700 text-right">
                {idx === 0 ? (
                  <span className="text-xs text-gray-500">Baza</span>
                ) : (
                  <>
                    <div>{prevValue !== null ? pct(value, prevValue) : '—'}</div>
                    <div className="text-xs text-gray-500 mt-0.5">
                      {pct(value, data.sourcing)} od bazy
                    </div>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
