import { sql } from '@/lib/db';
import { normalizeFunnel, FUNNEL_LEVELS, type FunnelData } from '@/lib/funnel';
import { loadAlertSettings, lastActivitySql, isParallelStageSql } from '@/lib/alerts';

// Zadania algorytmiczne dla ownerow (zakladka Priorytety). Wspolne dla
// /api/zadania i src/app/priorytety/page.tsx.

export type Task = {
  rule_id: number;
  project_id: string;
  project_title: string;
  owner_id: string;
  owner_name: string;
  priority_score: number;
  message: string;
  detail?: string;
};

type ProjectRow = {
  id: string;
  title: string;
  funnel: unknown;
  idle_days: number | null;
  priority_score: number;
  owner_id: string;
  owner_name: string;
};

type StageRow = {
  project_id: string;
  name: string;
  days_until: number;
};

type CandidateRow = {
  project_id: string;
  created_at: unknown;
};

function daysDiff(a: Date, b: Date): number {
  return Math.floor((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}

function funnelSum(f: FunnelData): number {
  return FUNNEL_LEVELS.reduce((s, lvl) => s + f[lvl.key], 0);
}

export async function computeTasks(): Promise<Task[]> {
  const [settings, projectRows, stageRows, candidateRows] = await Promise.all([
    loadAlertSettings(),
    sql.query(
      `SELECT
         p.id, p.title, p.funnel,
         (CURRENT_DATE - ${lastActivitySql('p')})::int AS idle_days,
         (c.priority_class * pt.priority_class) AS priority_score,
         u.id AS owner_id, u.name AS owner_name
       FROM projects p
       JOIN clients c ON c.id = p.client_id
       JOIN project_types pt ON pt.id = p.project_type_id
       JOIN users u ON u.id = p.owner_id
       WHERE p.closed_at IS NULL AND p.is_archived = FALSE`
    ) as Promise<unknown> as Promise<ProjectRow[]>,
    // Etapy rownolegle (zalegle, ale pozniejszy etap juz zamkniety) pomijane w zadaniu 3.
    sql.query(
      `SELECT ps.project_id, ps.name, (ps.deadline - CURRENT_DATE)::int AS days_until
       FROM project_stages ps
       JOIN projects p ON p.id = ps.project_id
       WHERE p.closed_at IS NULL AND p.is_archived = FALSE
         AND ps.done_at IS NULL AND ps.deadline IS NOT NULL
         AND NOT ${isParallelStageSql('ps')}`
    ) as Promise<unknown> as Promise<StageRow[]>,
    sql.query(
      `SELECT fc.project_id, fc.created_at
       FROM freelancer_candidates fc
       JOIN projects p ON p.id = fc.project_id
       WHERE fc.status = 'submitted'
         AND p.closed_at IS NULL AND p.is_archived = FALSE`
    ) as Promise<unknown> as Promise<CandidateRow[]>,
  ]);

  const stagesByProject = new Map<string, StageRow[]>();
  for (const s of stageRows) {
    const arr = stagesByProject.get(s.project_id) ?? [];
    arr.push(s);
    stagesByProject.set(s.project_id, arr);
  }

  const candidatesByProject = new Map<string, CandidateRow[]>();
  for (const c of candidateRows) {
    const arr = candidatesByProject.get(c.project_id) ?? [];
    arr.push(c);
    candidatesByProject.set(c.project_id, arr);
  }

  const now = new Date();
  const tasks: Task[] = [];

  for (const row of projectRows) {
    const f = normalizeFunnel(row.funnel);
    const score = Number(row.priority_score);
    const pid = row.id;
    const title = row.title;
    const ownerId = row.owner_id;
    const ownerName = row.owner_name;

    function push(rule_id: number, message: string, detail?: string) {
      tasks.push({
        rule_id,
        project_id: pid,
        project_title: title,
        owner_id: ownerId,
        owner_name: ownerName,
        priority_score: score,
        message,
        detail,
      });
    }

    // Rule 1 — Zwieksz sourcing
    if (score <= 2 && f.sourcing < 5) {
      push(1, 'Zwieksz sourcing — za malo kandydatow w lejku');
    }

    // Rule 2 — Przesun kandydatow dalej
    if (score <= 4 && f.sourcing > 10 && f.weryfikacja === 0) {
      push(2, 'Kandydaci czekaja na weryfikacje — przesun ich dalej');
    }

    // Rule 3 — Deadline etapu: od wczoraj do 3 dni naprzod (bez etapow rownoleglych)
    for (const stage of stagesByProject.get(pid) ?? []) {
      const daysUntil = Number(stage.days_until);
      if (daysUntil >= -1 && daysUntil <= 3) {
        const label =
          daysUntil < 0 ? 'po terminie' : daysUntil === 0 ? 'dzisiaj' : `za ${daysUntil} dni`;
        push(3, `Deadline etapu '${stage.name}' ${label}`, stage.name);
      }
    }

    // Rule 4 — Brak aktywnosci > idle_critical_days na projekcie priorytetowym
    const idle = row.idle_days === null ? null : Number(row.idle_days);
    if (score <= 2 && idle !== null && idle > settings.idle_critical_days) {
      push(
        4,
        `Brak aktywnosci od ${idle} dni na projekcie priorytetowym (prog ${settings.idle_critical_days})`
      );
    }

    // Rule 5 — Kandydat czeka na decyzje > 3 dni
    for (const cand of candidatesByProject.get(pid) ?? []) {
      if (!cand.created_at) continue;
      const createdAt = new Date(cand.created_at as string);
      if (daysDiff(createdAt, now) > 3) {
        push(5, 'Kandydat freelancera czeka na zatwierdzenie CV od ponad 3 dni');
        break;
      }
    }

    // Rule 6 — Niska konwersja weryfikacja->spotkania
    if (score <= 4 && f.weryfikacja > 5 && f.spotkania === 0) {
      push(6, 'Niska konwersja: duzo zweryfikowanych kandydatow, zero umowionych spotkan');
    }

    // Rule 7 — Waskie gardlo w lejku
    if (score <= 4) {
      const total = funnelSum(f);
      if (total > 5) {
        const bottleneck = FUNNEL_LEVELS.find((lvl) => f[lvl.key] / total > 0.7);
        if (bottleneck) {
          push(7, `Waskie gardlo: kandydaci zatrzymani na etapie '${bottleneck.label}'`, bottleneck.label);
        }
      }
    }
  }

  tasks.sort((a, b) => a.priority_score - b.priority_score || a.rule_id - b.rule_id);
  return tasks;
}
