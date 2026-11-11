'use client';

import { useEffect, useState } from 'react';
import type { AlertSettings } from '@/lib/alerts-shared';

type Toast = { type: 'success' | 'error'; message: string };

type FieldKey = keyof AlertSettings;

const FIELDS: { key: FieldKey; label: string; help: string }[] = [
  {
    key: 'stage_critical_days',
    label: 'Etap po terminie - krytyczne po (dni)',
    help: 'Projekt staje sie krytyczny, gdy najbardziej zalegly etap (bez rownoleglych) przekracza ten prog.',
  },
  {
    key: 'prio1_critical_days',
    label: 'Priorytet 1 po terminie - krytyczne po (dni)',
    help: 'Nizszy prog dla projektow z priorytetem 1 (klient x typ projektu = 1).',
  },
  {
    key: 'idle_critical_days',
    label: 'Brak aktywnosci - krytyczne po (dni)',
    help: 'Liczba dni od ostatniej aktywnosci: edycja projektu, zamkniety etap lub snapshot lejka. Uzywane tez w zadaniu "Brak aktywnosci" w Priorytetach.',
  },
];

type Props = { initialSettings: AlertSettings };

export default function ProgiAlertowClient({ initialSettings }: Props) {
  const [values, setValues] = useState<Record<FieldKey, string>>({
    stage_critical_days: String(initialSettings.stage_critical_days),
    prio1_critical_days: String(initialSettings.prio1_critical_days),
    idle_critical_days: String(initialSettings.idle_critical_days),
  });
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2500);
    return () => clearTimeout(t);
  }, [toast]);

  function isValid(v: string): boolean {
    const n = Number(v);
    return /^\d+$/.test(v) && Number.isInteger(n) && n >= 1 && n <= 365;
  }

  const allValid = FIELDS.every((f) => isValid(values[f.key]));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!allValid) return;
    setSaving(true);
    try {
      const res = await fetch('/api/admin/progi-alertow', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stage_critical_days: Number(values.stage_critical_days),
          prio1_critical_days: Number(values.prio1_critical_days),
          idle_critical_days: Number(values.idle_critical_days),
        }),
      });
      const data = (await res.json()) as { ok: boolean; error?: string };
      if (data.ok) {
        setToast({ type: 'success', message: 'Zapisano progi alertow' });
      } else {
        setToast({ type: 'error', message: data.error ?? 'Blad serwera' });
      }
    } catch {
      setToast({ type: 'error', message: 'Blad polaczenia z serwerem' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-xl">
      <h1 className="text-2xl font-semibold text-gray-900">Progi alertow</h1>
      <p className="text-sm text-gray-600 mt-1 mb-6">
        Progi klasyfikacji projektow w sekcji &quot;Wymaga uwagi&quot; (Status Meeting, Dashboard).
        Projekt z etapami po terminie ponizej progow jest ostrzezeniem; po przekroczeniu progu -
        krytyczny.
      </p>

      <form onSubmit={handleSubmit} className="space-y-5">
        {FIELDS.map((f) => {
          const invalid = !isValid(values[f.key]);
          return (
            <div key={f.key}>
              <label htmlFor={f.key} className="block text-sm font-medium text-gray-700 mb-1">
                {f.label}
              </label>
              <input
                id={f.key}
                type="number"
                min={1}
                max={365}
                step={1}
                value={values[f.key]}
                onChange={(e) => setValues((prev) => ({ ...prev, [f.key]: e.target.value }))}
                className={`w-32 px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#FF5A3C] ${
                  invalid ? 'border-red-400' : 'border-gray-300'
                }`}
              />
              <p className="text-xs text-gray-500 mt-1">{f.help}</p>
              {invalid && <p className="text-xs text-red-600 mt-1">Podaj liczbe calkowita 1-365</p>}
            </div>
          );
        })}

        <button
          type="submit"
          disabled={saving || !allValid}
          className="px-4 py-2 text-sm rounded-md bg-[#FF5A3C] text-white hover:bg-[#E64428] disabled:opacity-50"
        >
          {saving ? 'Zapisywanie...' : 'Zapisz'}
        </button>
      </form>

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
