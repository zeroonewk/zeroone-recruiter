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

export function pct(num: number, den: number): string {
  if (den === 0) return '—';
  return `${(num / den * 100).toFixed(1)}%`;
}
