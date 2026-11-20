'use client';

import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { todayWarsaw } from '@/lib/dates';

// Okno "Wyplaty" (tylko admin): lista wyplat freelancera, dodawanie i usuwanie wpisow.
// Saldo u gory z API (fetchFreelancerBalance) — te same zrodla liczb co tabela Status Meeting.

type PaymentRow = {
  id: string;
  amount: number;
  paid_on: string;
  note: string | null;
  created_at: string;
};

type Balance = { earned: number; paid: number; balance: number };

function fmtDateFull(s: string): string {
  return `${s.slice(8, 10)}.${s.slice(5, 7)}.${s.slice(0, 4)}`;
}

function fmtMoney2(v: number): string {
  return `${v < 0 ? '-' : ''}${Math.abs(v).toFixed(2)} zl`;
}

export default function FreelancerPaymentsModal({
  userId,
  name,
  onClose,
}: {
  userId: string;
  name: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const today = todayWarsaw();

  const [items, setItems] = useState<PaymentRow[] | null>(null);
  const [balance, setBalance] = useState<Balance | null>(null);
  const [loadError, setLoadError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  const [paidOn, setPaidOn] = useState(today);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  // Naleznosc poczatkowa: uzytkownik wpisuje kwote dodatnia, zapisujemy ja ze znakiem minus
  const [isOpeningBalance, setIsOpeningBalance] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [listError, setListError] = useState('');

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/admin/freelancer-payments?user_id=${encodeURIComponent(userId)}`)
      .then((res) => res.json() as Promise<{ ok: boolean; items?: PaymentRow[]; balance?: Balance; error?: string }>)
      .then((data) => {
        if (cancelled) return;
        if (data.ok && data.items && data.balance) {
          setItems(data.items);
          setBalance(data.balance);
          setLoadError('');
        } else {
          setLoadError(data.error ?? 'Blad wczytywania wyplat');
        }
      })
      .catch(() => { if (!cancelled) setLoadError('Blad sieci'); });
    return () => { cancelled = true; };
  }, [userId, reloadKey]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setFormError('');
    const normalized = amount.trim().replace(',', '.');
    if (isOpeningBalance) {
      if (!/^\d+(\.\d{1,2})?$/.test(normalized) || Number(normalized) <= 0) {
        setFormError('Naleznosc poczatkowa: podaj kwote wieksza od 0 (maks. 2 miejsca po przecinku)');
        return;
      }
    } else if (!/^-?\d+(\.\d{1,2})?$/.test(normalized) || Number(normalized) === 0) {
      setFormError('Podaj kwote rozna od 0 (maks. 2 miejsca po przecinku)');
      return;
    }
    const amountToSend = isOpeningBalance ? `-${normalized}` : normalized;
    if (!paidOn || paidOn > today) {
      setFormError('Podaj date, nie z przyszlosci');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/admin/freelancer-payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, amount: amountToSend, paid_on: paidOn, note }),
      });
      const data = (await res.json().catch(() => ({ ok: false }))) as { ok: boolean; error?: string };
      if (!data.ok) {
        setFormError(data.error ?? 'Nie udalo sie zapisac wyplaty');
        return;
      }
      setAmount('');
      setNote('');
      setIsOpeningBalance(false);
      reload();
      router.refresh();
    } catch {
      setFormError('Blad sieci');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(p: PaymentRow) {
    if (!window.confirm(`Usunac wyplate ${fmtMoney2(p.amount)} z dnia ${fmtDateFull(p.paid_on)}?`)) return;
    setListError('');
    setDeletingId(p.id);
    try {
      const res = await fetch(`/api/admin/freelancer-payments/${p.id}`, { method: 'DELETE' });
      const data = (await res.json().catch(() => ({ ok: false }))) as { ok: boolean; error?: string };
      if (!data.ok) {
        setListError(data.error ?? 'Nie udalo sie usunac wyplaty');
        return;
      }
      reload();
      router.refresh();
    } catch {
      setListError('Blad sieci');
    } finally {
      setDeletingId(null);
    }
  }

  const inputCls =
    'w-full px-2 py-1.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#FF5A3C]';

  return createPortal(
    <div
      className="fixed inset-0 z-[900] flex items-start sm:items-center justify-center bg-black/40 p-4 overflow-y-auto"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Wyplaty - ${name}`}
        className="w-full max-w-lg bg-white rounded-lg shadow-xl border border-gray-200"
      >
        <div className="flex items-start justify-between gap-4 px-5 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Wyplaty</h2>
            <p className="text-sm text-gray-500">{name}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Zamknij"
            className="text-gray-400 hover:text-gray-700 text-xl leading-none px-1"
          >
            &times;
          </button>
        </div>

        <div className="px-5 py-4 space-y-5">
          {/* Saldo */}
          <div className="bg-gray-50 rounded-md px-4 py-3 text-sm">
            {balance ? (
              <>
                <div className="flex justify-between font-semibold text-gray-900">
                  <span>Aktualne saldo</span>
                  <span className={`tabular-nums ${balance.balance < -0.004 ? 'text-red-700' : ''}`}>
                    {fmtMoney2(balance.balance)}
                  </span>
                </div>
                <p className="mt-1 text-xs text-gray-500 tabular-nums">
                  Zarobione lacznie {fmtMoney2(balance.earned)} - wyplacone lacznie {fmtMoney2(balance.paid)}
                </p>
              </>
            ) : (
              <p className="text-gray-500">{loadError || 'Ladowanie...'}</p>
            )}
          </div>

          {/* Lista */}
          <div>
            <h3 className="text-sm font-semibold text-gray-900 mb-2">Historia wyplat</h3>
            {listError && <p className="mb-2 text-sm text-red-600">{listError}</p>}
            {items === null ? (
              <p className="text-sm text-gray-400">{loadError || 'Ladowanie...'}</p>
            ) : items.length === 0 ? (
              <p className="text-sm text-gray-400">Brak wyplat</p>
            ) : (
              <ul className="max-h-60 overflow-y-auto divide-y divide-gray-100 border border-gray-100 rounded-md">
                {items.map((p) => (
                  <li key={p.id} className="flex items-start gap-3 px-3 py-2 text-sm">
                    <span className="shrink-0 w-24 text-gray-500 tabular-nums">{fmtDateFull(p.paid_on)}</span>
                    <span className="shrink-0 w-28 text-right">
                      <span className={`block tabular-nums font-medium ${p.amount < 0 ? 'text-red-700' : 'text-gray-900'}`}>
                        {fmtMoney2(p.amount)}
                      </span>
                      {p.amount < 0 && <span className="block text-[11px] text-gray-400">korekta / naleznosc</span>}
                    </span>
                    <span className="flex-1 min-w-0 text-gray-600 break-words">{p.note ?? ''}</span>
                    <button
                      type="button"
                      onClick={() => void handleDelete(p)}
                      disabled={deletingId === p.id}
                      className="shrink-0 text-xs text-red-600 hover:text-red-800 hover:underline disabled:opacity-50"
                    >
                      {deletingId === p.id ? 'Usuwanie...' : 'Usun'}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Formularz */}
          <form onSubmit={(e) => void handleSave(e)} className="border-t border-gray-100 pt-4">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Dodaj wyplate</h3>
            <label className="flex items-start gap-2 mb-3 text-sm text-gray-700 cursor-pointer">
              <input
                type="checkbox"
                checked={isOpeningBalance}
                onChange={(e) => {
                  const on = e.target.checked;
                  setIsOpeningBalance(on);
                  if (on) {
                    // kwota zawsze dodatnia w polu; notatka domyslna, gdy pusta
                    setAmount((a) => a.trim().replace(/^-/, ''));
                    setNote((n) => (n.trim() === '' ? 'saldo poczatkowe' : n));
                  } else {
                    setNote((n) => (n === 'saldo poczatkowe' ? '' : n));
                  }
                }}
                className="mt-0.5 w-4 h-4 accent-[#FF5A3C]"
              />
              <span>Naleznosc poczatkowa (zwieksza saldo do wyplaty)</span>
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="text-xs text-gray-600">
                Data
                <input
                  type="date"
                  value={paidOn}
                  max={today}
                  onChange={(e) => setPaidOn(e.target.value)}
                  className={inputCls + ' mt-1'}
                  required
                />
              </label>
              <label className="text-xs text-gray-600">
                Kwota (zl)
                <input
                  type="text"
                  inputMode="decimal"
                  value={amount}
                  onChange={(e) =>
                    setAmount(isOpeningBalance ? e.target.value.replace(/-/g, '') : e.target.value)
                  }
                  placeholder={isOpeningBalance ? 'np. 500' : 'np. 1500 lub -200'}
                  className={inputCls + ' mt-1 tabular-nums'}
                  required
                />
              </label>
              <label className="text-xs text-gray-600 sm:col-span-2">
                Notatka (opcjonalnie)
                <input
                  type="text"
                  value={note}
                  maxLength={300}
                  onChange={(e) => setNote(e.target.value)}
                  className={inputCls + ' mt-1'}
                />
              </label>
            </div>
            {formError && <p className="mt-2 text-sm text-red-600">{formError}</p>}
            <div className="mt-3 flex items-center justify-between gap-3">
              <p className="text-xs text-gray-500">
                Kwota dodatnia = wyplata (zmniejsza saldo). Ujemna kwota = cofniecie lub korekta wczesniejszej wyplaty (zwieksza saldo do wyplaty). Dla salda poczatkowego uzyj przelacznika powyzej.
              </p>
              <button
                type="submit"
                disabled={saving}
                className="shrink-0 px-4 py-1.5 bg-[#FF5A3C] hover:bg-[#E64428] text-white text-sm font-medium rounded-md disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {saving ? 'Zapisywanie...' : 'Zapisz'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>,
    document.body
  );
}
