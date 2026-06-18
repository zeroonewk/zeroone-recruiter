'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

// ─── Types ────────────────────────────────────────────────────────────────────

type Client = { id: string; name: string };
type ProjectType = { id: string; name: string; default_points: number };
type StatusItem = { id: string; name: string; color: string; is_success: boolean };
type UserItem = { id: string; name: string; email: string };
type StageTemplate = { id: string; name: string; position: number; default_days_offset: number };

type InitData = {
  clients: Client[];
  types: ProjectType[];
  statuses: StatusItem[];
  users: UserItem[];
  stages_template: StageTemplate[];
  default_status_id: string;
};

type StageState = {
  name: string;
  position: number;
  deadline: string;
  touched: boolean;
};

type LinkState = { label: string; url: string };

type Props = { initData: InitData; currentUserId: string };

// ─── Helpers ──────────────────────────────────────────────────────────────────

function todayStr(): string {
  const d = new Date();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

const URL_RE = /^https?:\/\//;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// ─── Component ────────────────────────────────────────────────────────────────

export default function NowyProjektForm({ initData, currentUserId }: Props) {
  const router = useRouter();
  const today = todayStr();

  const [title, setTitle] = useState('');
  const [clientId, setClientId] = useState('');
  const [typeId, setTypeId] = useState('');
  const [ownerId, setOwnerId] = useState(currentUserId);
  const [statusId, setStatusId] = useState(initData.default_status_id);
  const [points, setPoints] = useState(5);
  const [userTouchedPoints, setUserTouchedPoints] = useState(false);
  const [openedAt, setOpenedAt] = useState(today);
  const [notes, setNotes] = useState('');
  const [links, setLinks] = useState<LinkState[]>([]);
  const [stages, setStages] = useState<StageState[]>(
    initData.stages_template.map((s) => ({
      name: s.name,
      position: s.position,
      deadline: addDays(today, s.default_days_offset),
      touched: false,
    }))
  );
  const [freelancerIds, setFreelancerIds] = useState<string[]>([]);
  const [availableFreelancers, setAvailableFreelancers] = useState<{ id: string; name: string }[]>([]);
  const [cvRate, setCvRate] = useState(1);
  const [meetingRate, setMeetingRate] = useState(5);
  const [projectValue, setProjectValue] = useState<number | ''>('');
  const [disableStages, setDisableStages] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch('/api/freelancers')
      .then((r) => r.json())
      .then((data: { ok: boolean; items?: { id: string; name: string }[] }) => {
        if (data.ok && data.items) setAvailableFreelancers(data.items);
      })
      .catch(() => {});
  }, []);

  // ── Smart recalc ────────────────────────────────────────────────────────

  function handleTypeChange(newTypeId: string) {
    setTypeId(newTypeId);
    if (!userTouchedPoints) {
      const t = initData.types.find((x) => x.id === newTypeId);
      if (t) setPoints(t.default_points);
    }
  }

  function handleOpenedAtChange(newDate: string) {
    setOpenedAt(newDate);
    if (!DATE_RE.test(newDate)) return;
    setStages((prev) =>
      prev.map((s) => {
        if (s.touched) return s;
        const tmpl = initData.stages_template.find((t) => t.position === s.position);
        const offset = tmpl?.default_days_offset ?? 0;
        return { ...s, deadline: addDays(newDate, offset) };
      })
    );
  }

  function handlePointsChange(val: number) {
    const clamped = Math.max(0, Math.min(25, val));
    setPoints(clamped);
    setUserTouchedPoints(true);
  }

  function handleStageDeadlineChange(position: number, value: string) {
    setStages((prev) =>
      prev.map((s) => (s.position === position ? { ...s, deadline: value, touched: true } : s))
    );
  }

  // ── Freelancers ─────────────────────────────────────────────────────────

  function toggleFreelancer(id: string) {
    setFreelancerIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  // ── Links ───────────────────────────────────────────────────────────────

  function addLink() {
    setLinks((prev) => [...prev, { label: '', url: '' }]);
  }

  function updateLink(idx: number, field: keyof LinkState, value: string) {
    setLinks((prev) => prev.map((l, i) => (i === idx ? { ...l, [field]: value } : l)));
  }

  function removeLink(idx: number) {
    setLinks((prev) => prev.filter((_, i) => i !== idx));
  }

  // ── Validation ──────────────────────────────────────────────────────────

  const canSubmit =
    !loading &&
    title.trim().length >= 2 &&
    clientId !== '' &&
    typeId !== '' &&
    ownerId !== '' &&
    statusId !== '' &&
    Number.isInteger(points) &&
    points >= 0 &&
    points <= 25 &&
    DATE_RE.test(openedAt) &&
    (disableStages || stages.every((s) => DATE_RE.test(s.deadline))) &&
    links.every((l) => l.label.trim().length > 0 && URL_RE.test(l.url.trim()));

  // ── Submit ──────────────────────────────────────────────────────────────

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch('/api/projekty', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          client_id: clientId,
          project_type_id: typeId,
          owner_id: ownerId,
          status_id: statusId,
          points,
          opened_at: openedAt,
          notes: notes.trim() || null,
          links: links.map((l) => ({ label: l.label.trim(), url: l.url.trim() })),
          stages: disableStages ? [] : stages.map((s) => ({
            name: s.name,
            position: s.position,
            deadline: s.deadline,
          })),
          disable_stages: disableStages,
          freelancer_ids: freelancerIds,
          freelancer_rates: {
            cv_rate: cvRate,
            meeting_rate: meetingRate,
            project_value: projectValue === '' ? null : projectValue,
          },
        }),
      });
      const data = (await res.json()) as { ok: boolean; error?: string };
      if (data.ok) {
        router.push('/projekty');
      } else {
        setError(data.error ?? 'Blad serwera');
      }
    } catch {
      setError('Blad polaczenia z serwerem');
    } finally {
      setLoading(false);
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────

  const inputCls =
    'w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#FF5A3C] focus:border-transparent';
  const labelCls = 'block text-sm font-medium text-gray-700 mb-1';
  const sectionCls = 'border-t border-gray-200 pt-6 mt-6';

  return (
    <div className="max-w-3xl mx-auto py-6 px-4">
      {/* Breadcrumb */}
      <div className="mb-1">
        <nav className="text-sm text-gray-500">
          <Link href="/projekty" className="hover:text-gray-700">
            Projekty
          </Link>
          <span className="mx-1">/</span>
          <span className="text-gray-900">Nowy</span>
        </nav>
      </div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Nowy projekt</h1>

      <form onSubmit={handleSubmit} noValidate>
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          {/* ── Podstawowe ─────────────────────────────────────────── */}
          <div>
            <div className="mb-4">
              <label htmlFor="f-title" className={labelCls}>
                Tytul
              </label>
              <input
                id="f-title"
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className={inputCls}
              />
            </div>

            <div className="grid sm:grid-cols-2 gap-4 mb-4">
              <div>
                <label htmlFor="f-client" className={labelCls}>
                  Klient
                </label>
                <select
                  id="f-client"
                  value={clientId}
                  onChange={(e) => setClientId(e.target.value)}
                  className={inputCls}
                >
                  <option value="">— wybierz klienta —</option>
                  {initData.clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="f-type" className={labelCls}>
                  Typ projektu
                </label>
                <select
                  id="f-type"
                  value={typeId}
                  onChange={(e) => handleTypeChange(e.target.value)}
                  className={inputCls}
                >
                  <option value="">— wybierz typ —</option>
                  {initData.types.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="f-owner" className={labelCls}>
                  Owner
                </label>
                <select
                  id="f-owner"
                  value={ownerId}
                  onChange={(e) => setOwnerId(e.target.value)}
                  className={inputCls}
                >
                  <option value="">— wybierz ownera —</option>
                  {initData.users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name} ({u.email})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="f-status" className={labelCls}>
                  Status
                </label>
                <select
                  id="f-status"
                  value={statusId}
                  onChange={(e) => setStatusId(e.target.value)}
                  className={inputCls}
                >
                  <option value="">— wybierz status —</option>
                  {initData.statuses.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="f-opened" className={labelCls}>
                  Data otwarcia
                </label>
                <input
                  id="f-opened"
                  type="date"
                  required
                  value={openedAt}
                  onChange={(e) => handleOpenedAtChange(e.target.value)}
                  className={inputCls}
                />
              </div>

              <div>
                <label htmlFor="f-points" className={labelCls}>
                  Punkty
                </label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handlePointsChange(points - 1)}
                    disabled={!typeId}
                    className="w-9 h-9 flex items-center justify-center border border-gray-300 rounded-md text-gray-700 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed text-lg leading-none"
                  >
                    −
                  </button>
                  <input
                    id="f-points"
                    type="number"
                    min={0}
                    max={25}
                    step={1}
                    required
                    value={typeId ? points : ''}
                    disabled={!typeId}
                    onChange={(e) => handlePointsChange(Number(e.target.value))}
                    className="w-16 px-2 py-2 border border-gray-300 rounded-md text-sm text-center focus:outline-none focus:ring-2 focus:ring-[#FF5A3C] focus:border-transparent disabled:bg-gray-50 disabled:text-gray-400"
                  />
                  <button
                    type="button"
                    onClick={() => handlePointsChange(points + 1)}
                    disabled={!typeId}
                    className="w-9 h-9 flex items-center justify-center border border-gray-300 rounded-md text-gray-700 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed text-lg leading-none"
                  >
                    +
                  </button>
                  <span className="text-xs text-gray-500 ml-1">0–25</span>
                </div>
              </div>
            </div>
          </div>

          {/* ── Etapy procesu ──────────────────────────────────────── */}
          <div className={sectionCls}>
            <div className="flex items-center justify-between mb-1">
              <h2 className="text-base font-semibold text-gray-900">Etapy procesu</h2>
              <label className="flex items-center gap-2 cursor-pointer select-none text-sm text-gray-600">
                <input
                  type="checkbox"
                  checked={disableStages}
                  onChange={(e) => setDisableStages(e.target.checked)}
                  className="w-4 h-4 accent-[#FF5A3C]"
                />
                Wylacz etapy
              </label>
            </div>
            {!disableStages && (
              <>
                <p className="text-sm text-gray-500 mb-4">
                  Ustaw deadline dla kazdego etapu. Po zmianie daty otwarcia, deadliny nie ruszone
                  recznie zostana przeliczone.
                </p>
                <div className="space-y-3">
                  {stages.map((s) => (
                    <div key={s.position} className="flex items-center gap-3">
                      <span className="text-sm text-gray-500 w-5 text-right shrink-0">
                        {s.position}.
                      </span>
                      <span className="text-sm font-medium text-gray-900 flex-1">{s.name}</span>
                      <input
                        type="date"
                        required
                        value={s.deadline}
                        onChange={(e) => handleStageDeadlineChange(s.position, e.target.value)}
                        className="px-3 py-1.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#FF5A3C] focus:border-transparent"
                      />
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* ── Notatki ────────────────────────────────────────────── */}
          <div className={sectionCls}>
            <label htmlFor="f-notes" className={labelCls}>
              Notatki{' '}
              <span className="text-gray-400 font-normal">(opcjonalne)</span>
            </label>
            <textarea
              id="f-notes"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className={inputCls + ' resize-none'}
            />
          </div>

          {/* ── Linki ──────────────────────────────────────────────── */}
          <div className={sectionCls}>
            <div className="flex items-center gap-3 mb-3">
              <h2 className="text-base font-semibold text-gray-900">Linki</h2>
              <button
                type="button"
                onClick={addLink}
                className="text-sm text-[#FF5A3C] hover:underline"
              >
                + Dodaj link
              </button>
            </div>
            {links.length > 0 && (
              <div className="space-y-2">
                {links.map((l, idx) => (
                  <div key={idx} className="grid grid-cols-[1fr_2fr_auto] gap-2 items-center">
                    <input
                      type="text"
                      placeholder="np. Brief od klienta"
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
                      className="text-gray-400 hover:text-red-600 transition-colors px-1 text-lg leading-none"
                      aria-label="Usun link"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
          {/* ── Freelancerzy ───────────────────────────────────────── */}
          {availableFreelancers.length > 0 && (
            <div className={sectionCls}>
              <h2 className="text-base font-semibold text-gray-900 mb-3">Freelancerzy</h2>

              <div className="grid sm:grid-cols-3 gap-4 mb-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Stawka za CV
                  </label>
                  <input
                    type="number"
                    min={0}
                    step={1}
                    value={cvRate}
                    onChange={(e) => setCvRate(Math.max(0, Math.floor(Number(e.target.value))))}
                    className={inputCls + ' text-center'}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Stawka za spotkanie
                  </label>
                  <input
                    type="number"
                    min={0}
                    step={1}
                    value={meetingRate}
                    onChange={(e) => setMeetingRate(Math.max(0, Math.floor(Number(e.target.value))))}
                    className={inputCls + ' text-center'}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Wartosc projektu dla freelancera{' '}
                    <span className="text-gray-400 font-normal">(opcjonalne)</span>
                  </label>
                  <input
                    type="number"
                    min={0}
                    step={1}
                    placeholder={points ? `${points} pkt` : 'puste = punkty projektu'}
                    value={projectValue}
                    onChange={(e) => {
                      const v = e.target.value;
                      setProjectValue(v === '' ? '' : Math.max(0, Math.floor(Number(v))));
                    }}
                    className={inputCls + ' text-center'}
                  />
                </div>
              </div>

              <p className="text-sm font-medium text-gray-700 mb-2">Przypisani freelancerzy</p>
              <div className="space-y-2">
                {availableFreelancers.map((f) => (
                  <label key={f.id} className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={freelancerIds.includes(f.id)}
                      onChange={() => toggleFreelancer(f.id)}
                      className="w-4 h-4 accent-[#FF5A3C]"
                    />
                    <span className="text-sm text-gray-800">{f.name}</span>
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ── Footer ─────────────────────────────────────────────────── */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-md px-3 py-2 mt-4">
            {error}
          </div>
        )}
        <div className="flex justify-end gap-3 mt-4">
          <Link
            href="/projekty"
            className="px-4 py-2 text-sm border border-gray-300 rounded-md text-gray-700 hover:bg-gray-100 transition-colors"
          >
            Anuluj
          </Link>
          <button
            type="submit"
            disabled={!canSubmit}
            className="px-6 py-2 text-sm bg-[#FF5A3C] hover:bg-[#E64428] text-white rounded-md font-medium disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? 'Zakladanie...' : 'Zaloz projekt'}
          </button>
        </div>
      </form>
    </div>
  );
}
