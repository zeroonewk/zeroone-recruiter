export const FUNNEL_LEVELS = [
  { key: 'sourcing',     label: 'Sourcing',      description: 'Ilosc pozyskanych kandydatow' },
  { key: 'screening',    label: 'Screening',     description: 'Kandydaci pasujacy do profilu' },
  { key: 'weryfikacja',  label: 'Weryfikacja',   description: 'Ilosc zrealizowanych rozmow/kontaktow' },
  { key: 'rekomendacje', label: 'Rekomendacje',  description: 'Kandydaci zarekomendowani klientowi' },
  { key: 'spotkania',    label: 'Spotkania',     description: 'Kandydaci na rozmowach z klientem' },
  { key: 'oferta',       label: 'Oferta',        description: 'Kandydaci z otrzymana oferta' },
  { key: 'zatrudnienie', label: 'Zatrudnienie',  description: 'Kandydaci zatrudnieni' },
] as const;

export type FunnelKey = typeof FUNNEL_LEVELS[number]['key'];

export type FunnelData = Record<FunnelKey, number>;

export const EMPTY_FUNNEL: FunnelData = {
  sourcing: 0, screening: 0, weryfikacja: 0, rekomendacje: 0,
  spotkania: 0, oferta: 0, zatrudnienie: 0,
};

export function normalizeFunnel(raw: unknown): FunnelData {
  if (!raw || typeof raw !== 'object') return { ...EMPTY_FUNNEL };
  const obj = raw as Record<string, unknown>;
  const out = { ...EMPTY_FUNNEL };
  for (const lvl of FUNNEL_LEVELS) {
    const v = obj[lvl.key];
    if (typeof v === 'number' && Number.isFinite(v) && v >= 0) {
      out[lvl.key] = Math.floor(v);
    }
  }
  return out;
}

function isUsableNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

// Konwersja num/den w procentach. null, gdy baza (den) jest pusta, 0, ujemna
// albo nie jest liczba — wtedy w UI pokazujemy "—" zamiast 0%, Infinity
// czy wartosci > 100% liczonych od pustej bazy.
export function conversionRate(num: unknown, den: unknown): number | null {
  if (!isUsableNumber(den) || den <= 0) return null;
  if (!isUsableNumber(num) || num < 0) return null;
  return (num / den) * 100;
}

// Sformatowana konwersja ("12.5%") albo null przy pustej bazie.
// Wywolujacy pokazuje "—" dla null: `pct(a, b) ?? '—'`.
export function pct(num: unknown, den: unknown): string | null {
  const rate = conversionRate(num, den);
  return rate === null ? null : `${rate.toFixed(1)}%`;
}

export type FunnelInconsistency = {
  key: FunnelKey;
  label: string;
  value: number;
  prevKey: FunnelKey;
  prevLabel: string;
  prevValue: number;
};

// Poziomy, ktorych wartosc jest wieksza niz poprzedniego poziomu.
// Liczone tylko gdy poprzedni poziom > 0 (przy pustym poprzednim jest samo "—").
export function funnelInconsistencies(f: FunnelData): FunnelInconsistency[] {
  const out: FunnelInconsistency[] = [];
  for (let i = 1; i < FUNNEL_LEVELS.length; i++) {
    const lvl = FUNNEL_LEVELS[i];
    const prev = FUNNEL_LEVELS[i - 1];
    const value = f[lvl.key];
    const prevValue = f[prev.key];
    if (isUsableNumber(prevValue) && prevValue > 0 && isUsableNumber(value) && value > prevValue) {
      out.push({
        key: lvl.key,
        label: lvl.label,
        value,
        prevKey: prev.key,
        prevLabel: prev.label,
        prevValue,
      });
    }
  }
  return out;
}
