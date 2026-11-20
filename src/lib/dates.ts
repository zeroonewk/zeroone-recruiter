// Konwertuje wartosc daty z bazy Neon (Date object lub string) do YYYY-MM-DD.
// Postgres DATE wraca z @neondatabase/serverless jako JS Date — React input
// type="date" wymaga stringa YYYY-MM-DD.
export function toDateString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) {
    const y = value.getUTCFullYear();
    const m = String(value.getUTCMonth() + 1).padStart(2, '0');
    const d = String(value.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  if (typeof value === 'string') {
    // Juz string — moze byc YYYY-MM-DD lub ISO. Zwroc pierwsze 10 znakow.
    return value.substring(0, 10);
  }
  return null;
}

// "Dzis" w strefie firmy (Europe/Warsaw) — w SQL i po stronie klienta/serwera (YYYY-MM-DD).
export const TODAY_WARSAW_SQL = `(now() AT TIME ZONE 'Europe/Warsaw')::date`;

export function todayWarsaw(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Warsaw' }).format(new Date());
}
