'use client';

import { useState } from 'react';
import { FUNNEL_LEVELS, pct, type FunnelData, type FunnelKey } from '@/lib/funnel';

type Props = {
  projectId: string;
  initialFunnel: FunnelData;
  onUpdate: (newFunnel: FunnelData) => void;
  showToast: (type: 'success' | 'error', msg: string) => void;
};

export default function FunnelCard({ projectId, initialFunnel, onUpdate, showToast }: Props) {
  const [funnel, setFunnel] = useState<FunnelData>(initialFunnel);
  const [saving, setSaving] = useState<Partial<Record<FunnelKey, boolean>>>({});

  async function handleBlur(key: FunnelKey, newValue: number) {
    if (newValue === initialFunnel[key]) return;
    setSaving((prev) => ({ ...prev, [key]: true }));
    const newFunnel: FunnelData = { ...funnel, [key]: newValue };
    try {
      const res = await fetch(`/api/projekty/${projectId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ funnel: newFunnel }),
      });
      const data = (await res.json()) as { ok: boolean; error?: string };
      if (data.ok) {
        onUpdate(newFunnel);
        showToast('success', 'Lejek zaktualizowany');
      } else {
        setFunnel((prev) => ({ ...prev, [key]: initialFunnel[key] }));
        showToast('error', data.error ?? 'Nie udalo sie zapisac');
      }
    } catch {
      setFunnel((prev) => ({ ...prev, [key]: initialFunnel[key] }));
      showToast('error', 'Blad sieci');
    } finally {
      setSaving((prev) => ({ ...prev, [key]: false }));
    }
  }

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-6">
      <h2 className="text-xl font-bold mb-1">Lejek procesu</h2>
      <p className="text-sm text-gray-500 mb-6">
        Aktualizuj liczby na biezaco. Konwersja liczona automatycznie.
      </p>

      {/* Header row */}
      <div className="grid grid-cols-[minmax(0,1fr)_96px_minmax(0,2fr)_180px] gap-4 pb-2 border-b border-gray-100 mb-1">
        <div className="text-xs font-medium text-gray-500 uppercase tracking-wide">Poziom</div>
        <div className="text-xs font-medium text-gray-500 uppercase tracking-wide text-right">
          Liczba
        </div>
        <div className="text-xs font-medium text-gray-500 uppercase tracking-wide">Pasek</div>
        <div className="text-xs font-medium text-gray-500 uppercase tracking-wide text-right">
          Konwersja
        </div>
      </div>

      {FUNNEL_LEVELS.map((lvl, idx) => {
        const value = funnel[lvl.key];
        const prev = idx > 0 ? FUNNEL_LEVELS[idx - 1] : null;
        const prevValue = prev ? funnel[prev.key] : null;
        const barWidth =
          funnel.sourcing === 0
            ? '0%'
            : `${Math.min(100, (value / funnel.sourcing) * 100)}%`;

        const conversionMain =
          idx === 0
            ? '—'
            : prevValue === null || prevValue === 0
            ? '—'
            : `${(value / prevValue * 100).toFixed(1)}% vs ${prev!.label}`;

        return (
          <div
            key={lvl.key}
            className="grid grid-cols-[minmax(0,1fr)_96px_minmax(0,2fr)_180px] gap-4 items-center py-3 border-b border-gray-50 last:border-0"
          >
            {/* Column 1: Level */}
            <div>
              <div className="font-medium text-sm text-gray-900">
                {idx + 1}. {lvl.label}
              </div>
              <div className="text-xs text-gray-500 mt-0.5">{lvl.description}</div>
            </div>

            {/* Column 2: Input */}
            <input
              type="number"
              min={0}
              step={1}
              value={value}
              disabled={saving[lvl.key] === true}
              onChange={(e) => {
                const v = Math.max(0, Math.floor(Number(e.target.value) || 0));
                setFunnel((prev) => ({ ...prev, [lvl.key]: v }));
              }}
              onBlur={(e) => {
                const v = Math.max(0, Math.floor(Number(e.target.value) || 0));
                void handleBlur(lvl.key, v);
              }}
              className="w-24 px-3 py-2 border border-gray-300 rounded-md text-right focus:outline-none focus:ring-2 focus:ring-[#FF5A3C] disabled:opacity-60 disabled:cursor-not-allowed"
            />

            {/* Column 3: Bar */}
            <div className="w-full bg-gray-100 rounded-full h-3">
              <div
                className="bg-[#FF5A3C] h-3 rounded-full transition-all"
                style={{ width: barWidth }}
              />
            </div>

            {/* Column 4: Conversion */}
            <div className="text-right">
              <div className="font-medium text-gray-900 text-sm">{conversionMain}</div>
              <div className="text-xs text-gray-500 mt-0.5">
                {idx === 0 ? 'Baza lejka' : `${pct(value, funnel.sourcing)} od bazy`}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
