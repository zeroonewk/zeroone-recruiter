export type PeriodKey = 'today' | 'this_week' | 'last_week' | 'custom';

export type DateRange = { start: string; end: string }; // YYYY-MM-DD

// Polski tydzien: poniedzialek=1...niedziela=7
export function getDateRange(period: PeriodKey, customStart?: string, customEnd?: string): DateRange {
  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);

  if (period === 'today') {
    return { start: todayStr, end: todayStr };
  }

  if (period === 'this_week') {
    const day = today.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
    const diff = day === 0 ? 6 : day - 1; // dni od poniedzialku
    const monday = new Date(today);
    monday.setDate(today.getDate() - diff);
    return { start: monday.toISOString().slice(0, 10), end: todayStr };
  }

  if (period === 'last_week') {
    const day = today.getDay();
    const diff = day === 0 ? 6 : day - 1;
    const lastMonday = new Date(today);
    lastMonday.setDate(today.getDate() - diff - 7);
    const lastSunday = new Date(lastMonday);
    lastSunday.setDate(lastMonday.getDate() + 6);
    return {
      start: lastMonday.toISOString().slice(0, 10),
      end: lastSunday.toISOString().slice(0, 10),
    };
  }

  // custom
  return {
    start: customStart ?? todayStr,
    end: customEnd ?? todayStr,
  };
}

export function formatRangePL(range: DateRange): string {
  const fmt = (s: string) => {
    const d = new Date(s + 'T00:00:00Z');
    return `${String(d.getUTCDate()).padStart(2, '0')}.${String(d.getUTCMonth() + 1).padStart(2, '0')}.${d.getUTCFullYear()}`;
  };
  if (range.start === range.end) return fmt(range.start);
  return `${fmt(range.start)} - ${fmt(range.end)}`;
}
