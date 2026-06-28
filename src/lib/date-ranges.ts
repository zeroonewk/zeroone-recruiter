export type PeriodKey = 'today' | 'this_week' | 'last_week' | 'this_month' | 'prev_month' | 'custom';

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

  if (period === 'this_month') {
    const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    return { start: firstOfMonth.toISOString().slice(0, 10), end: todayStr };
  }

  if (period === 'prev_month') {
    const firstOfPrevMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const lastOfPrevMonth = new Date(today.getFullYear(), today.getMonth(), 0);
    return {
      start: firstOfPrevMonth.toISOString().slice(0, 10),
      end: lastOfPrevMonth.toISOString().slice(0, 10),
    };
  }

  // custom
  const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
  const sevenDaysAgo = new Date(today);
  sevenDaysAgo.setDate(today.getDate() - 7);
  const defaultStart = sevenDaysAgo.toISOString().slice(0, 10);

  if (!customStart || !DATE_RE.test(customStart) || !customEnd || !DATE_RE.test(customEnd)) {
    return { start: defaultStart, end: todayStr };
  }

  return customStart <= customEnd
    ? { start: customStart, end: customEnd }
    : { start: customEnd, end: customStart };
}

export function getComparisonRange(period: PeriodKey, currentRange: DateRange): DateRange {
  const start = new Date(currentRange.start + 'T00:00:00Z');
  const end = new Date(currentRange.end + 'T00:00:00Z');

  if (period === 'today') {
    const yesterday = new Date(start);
    yesterday.setUTCDate(start.getUTCDate() - 1);
    const yStr = yesterday.toISOString().slice(0, 10);
    return { start: yStr, end: yStr };
  }

  if (period === 'this_month') {
    const start = new Date(currentRange.start + 'T00:00:00Z');
    const prevMonthStart = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() - 1, 1));
    const prevMonthEnd = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 0));
    return {
      start: prevMonthStart.toISOString().slice(0, 10),
      end: prevMonthEnd.toISOString().slice(0, 10),
    };
  }

  if (period === 'prev_month') {
    const start = new Date(currentRange.start + 'T00:00:00Z');
    const twoMonthsAgoStart = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() - 1, 1));
    const twoMonthsAgoEnd = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 0));
    return {
      start: twoMonthsAgoStart.toISOString().slice(0, 10),
      end: twoMonthsAgoEnd.toISOString().slice(0, 10),
    };
  }

  if (period === 'this_week' || period === 'last_week') {
    const prevEnd = new Date(start);
    prevEnd.setUTCDate(start.getUTCDate() - 1);
    const prevStart = new Date(prevEnd);
    prevStart.setUTCDate(prevEnd.getUTCDate() - 6);
    return {
      start: prevStart.toISOString().slice(0, 10),
      end: prevEnd.toISOString().slice(0, 10),
    };
  }

  // custom: zakres tej samej dlugosci bezposrednio przed
  const days = Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
  const prevEnd = new Date(start);
  prevEnd.setUTCDate(start.getUTCDate() - 1);
  const prevStart = new Date(prevEnd);
  prevStart.setUTCDate(prevEnd.getUTCDate() - days);
  return {
    start: prevStart.toISOString().slice(0, 10),
    end: prevEnd.toISOString().slice(0, 10),
  };
}

export type TrendDirection = 'up' | 'down' | 'flat' | 'new';

export type Trend = {
  direction: TrendDirection;
  percent: number;
  previous: number;
};

export function calculateTrend(current: number, previous: number, sensitivityPct: number = 5): Trend {
  if (previous === 0 && current === 0) {
    return { direction: 'flat', percent: 0, previous: 0 };
  }
  if (previous === 0 && current > 0) {
    return { direction: 'new', percent: 0, previous: 0 };
  }
  const change = ((current - previous) / previous) * 100;
  if (Math.abs(change) < sensitivityPct) {
    return { direction: 'flat', percent: Math.abs(change), previous };
  }
  return {
    direction: change > 0 ? 'up' : 'down',
    percent: Math.abs(change),
    previous,
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
