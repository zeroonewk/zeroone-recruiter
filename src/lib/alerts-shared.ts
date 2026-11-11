// Typy i czyste funkcje alertow — bezpieczne do importu w komponentach klienckich.

export type AlertSettings = {
  stage_critical_days: number;
  prio1_critical_days: number;
  idle_critical_days: number;
};

export const DEFAULT_ALERT_SETTINGS: AlertSettings = {
  stage_critical_days: 30,
  prio1_critical_days: 7,
  idle_critical_days: 21,
};

export type AlertLevel = 'critical' | 'warning' | 'parallel';

export type ProjectAlert = {
  project_id: string;
  title: string;
  owner_id: string;
  owner_name: string;
  client_name: string;
  priority_score: number;
  level: AlertLevel;
  overdue_stages: number;
  parallel_stages: number;
  max_days_over: number;
  idle_days: number;
  reasons: string[];
};

export function countAlerts(alerts: ProjectAlert[]): {
  critical: number;
  warning: number;
  parallel: number;
} {
  const c = { critical: 0, warning: 0, parallel: 0 };
  for (const a of alerts) c[a.level] += 1;
  return c;
}
