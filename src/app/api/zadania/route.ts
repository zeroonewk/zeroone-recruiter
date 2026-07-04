import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { requireSession } from '@/lib/auth';
import { normalizeFunnel, FUNNEL_LEVELS, type FunnelData } from '@/lib/funnel';

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
  updated_at: unknown;
  priority_score: number;
  owner_id: string;
  owner_name: string;
};

type StageRow = {
  project_id: string;
  name: string;
  deadline: unknown;
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

export async function GET() {
  try {
    await requireSession();

    const projectRows = (await sql`
      SELECT
        p.id, p.title, p.funnel, p.updated_at,
        (c.priority_class * pt.priority_class) AS priority_score,
        u.id AS owner_id, u.name AS owner_name
      FROM projects p
      JOIN clients c ON c.id = p.client_id
      JOIN project_types pt ON pt.id = p.project_type_id
      JOIN users u ON u.id = p.owner_id
      WHERE p.closed_at IS NULL AND p.is_archived = FALSE
    `) as unknown as ProjectRow[];

    const stageRows = (await sql`
      SELECT ps.project_id, ps.name, ps.deadline
      FROM project_stages ps
      JOIN projects p ON p.id = ps.project_id
      WHERE p.closed_at IS NULL AND p.is_archived = FALSE
        AND ps.done_at IS NULL AND ps.deadline IS NOT NULL
    `) as unknown as StageRow[];

    const candidateRows = (await sql`
      SELECT fc.project_id, fc.created_at
      FROM freelancer_candidates fc
      JOIN projects p ON p.id = fc.project_id
      WHERE fc.status = 'submitted'
        AND p.closed_at IS NULL AND p.is_archived = FALSE
    `) as unknown as CandidateRow[];

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
        tasks.push({ rule_id, project_id: pid, project_title: title, owner_id: ownerId, owner_name: ownerName, priority_score: score, message, detail });
      }

      // Rule 1 — Zwieksz sourcing
      if (score <= 2 && f.sourcing < 5) {
        push(1, 'Zwieksz sourcing — za malo kandydatow w lejku');
      }

      // Rule 2 — Przesuń kandydatów dalej
      if (score <= 4 && f.sourcing > 10 && f.weryfikacja === 0) {
        push(2, 'Kandydaci czekaja na weryfikacje — przesun ich dalej');
      }

      // Rule 3 — Deadline etapu za mniej niż 3 dni (all projects)
      const stages = stagesByProject.get(pid) ?? [];
      for (const stage of stages) {
        if (!stage.deadline) continue;
        const deadline = new Date(stage.deadline as string);
        const daysUntil = daysDiff(now, deadline);
        if (daysUntil >= -1 && daysUntil <= 3) {
          const label = daysUntil < 0 ? 'po terminie' : daysUntil === 0 ? 'dzisiaj' : `za ${daysUntil} dni`;
          push(3, `Deadline etapu '${stage.name}' ${label}`, stage.name);
        }
      }

      // Rule 4 — Brak aktywnosci > 2 dni
      if (score <= 2 && row.updated_at) {
        const updatedAt = new Date(row.updated_at as string);
        if (daysDiff(updatedAt, now) > 2) {
          push(4, 'Brak aktywnosci od ponad 2 dni na projekcie priorytetowym');
        }
      }

      // Rule 5 — Kandydat czeka na decyzje > 3 dni (all projects)
      const candidates = candidatesByProject.get(pid) ?? [];
      for (const cand of candidates) {
        if (!cand.created_at) continue;
        const createdAt = new Date(cand.created_at as string);
        if (daysDiff(createdAt, now) > 3) {
          push(5, 'Kandydat freelancera czeka na zatwierdzenie CV od ponad 3 dni');
          break;
        }
      }

      // Rule 6 — Niska konwersja weryfikacja→spotkania
      if (score <= 4 && f.weryfikacja > 5 && f.spotkania === 0) {
        push(6, 'Niska konwersja: duzo zweryfikowanych kandydatow, zero umowionych spotkan');
      }

      // Rule 7 — Wąskie gardło w lejku
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

    return NextResponse.json({ ok: true, tasks });
  } catch (e) {
    if (e instanceof Error && e.message === 'UNAUTHORIZED') {
      return NextResponse.json({ ok: false, error: 'Brak dostepu' }, { status: 401 });
    }
    return NextResponse.json({ ok: false, error: 'Blad serwera' }, { status: 500 });
  }
}
