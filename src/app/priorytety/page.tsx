import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { sql } from '@/lib/db';
import { normalizeFunnel, FUNNEL_LEVELS } from '@/lib/funnel';
import { toDateString } from '@/lib/dates';
import AppShell from '@/components/layout/AppShell';
import PrioryteyClient from '@/components/priorytety/PrioryteyClient';
import type { PriorityItem } from '@/app/api/priorytety/route';
import type { Task } from '@/app/api/zadania/route';

export const dynamic = 'force-dynamic';

type StageRowRaw = {
  project_id: string;
  name: string;
  deadline: unknown;
};

type CandidateRowRaw = {
  project_id: string;
  created_at: unknown;
};

type ProjectTaskRow = {
  id: string;
  title: string;
  funnel: unknown;
  updated_at: unknown;
  priority_score: number;
  owner_id: string;
  owner_name: string;
};

function daysDiff(a: Date, b: Date) {
  return Math.floor((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}

export default async function PrioryteyPage() {
  const session = await getSession();
  if (!session) redirect('/zaloguj');

  const [rows, taskProjectRows, stageRows, candidateRows] = await Promise.all([
    sql`
      SELECT
        p.id, p.title, p.funnel, p.opened_at,
        c.name AS client_name, c.priority_class AS client_priority,
        pt.name AS type_name, pt.priority_class AS type_priority,
        (c.priority_class * pt.priority_class) AS priority_score,
        u.name AS owner_name, u.id AS owner_id,
        rs.name AS status_name, rs.is_success, rs.color AS status_color
      FROM projects p
      JOIN clients c ON c.id = p.client_id
      JOIN project_types pt ON pt.id = p.project_type_id
      JOIN users u ON u.id = p.owner_id
      JOIN result_statuses rs ON rs.id = p.status_id
      WHERE p.closed_at IS NULL AND p.is_archived = FALSE
      ORDER BY c.priority_class ASC, (c.priority_class * pt.priority_class) ASC, p.title ASC
    `,
    sql`
      SELECT p.id, p.title, p.funnel, p.updated_at,
        (c.priority_class * pt.priority_class) AS priority_score,
        u.id AS owner_id, u.name AS owner_name
      FROM projects p
      JOIN clients c ON c.id = p.client_id
      JOIN project_types pt ON pt.id = p.project_type_id
      JOIN users u ON u.id = p.owner_id
      WHERE p.closed_at IS NULL AND p.is_archived = FALSE
    `,
    sql`
      SELECT ps.project_id, ps.name, ps.deadline
      FROM project_stages ps
      JOIN projects p ON p.id = ps.project_id
      WHERE p.closed_at IS NULL AND p.is_archived = FALSE
        AND ps.done_at IS NULL AND ps.deadline IS NOT NULL
    `,
    sql`
      SELECT fc.project_id, fc.created_at
      FROM freelancer_candidates fc
      JOIN projects p ON p.id = fc.project_id
      WHERE fc.status = 'submitted'
        AND p.closed_at IS NULL AND p.is_archived = FALSE
    `,
  ]);

  const items: PriorityItem[] = (rows as Record<string, unknown>[]).map((r) => ({
    id: r.id as string,
    title: r.title as string,
    funnel: normalizeFunnel(r.funnel),
    client_name: r.client_name as string,
    client_priority: r.client_priority as number,
    type_name: r.type_name as string,
    type_priority: r.type_priority as number,
    priority_score: r.priority_score as number,
    owner_name: r.owner_name as string,
    owner_id: r.owner_id as string,
    status_name: r.status_name as string,
    status_color: r.status_color as string,
    is_success: r.is_success as boolean,
    opened_at: toDateString(r.opened_at) ?? '',
  }));

  const ownerMap = new Map<string, string>();
  for (const item of items) {
    ownerMap.set(item.owner_id, item.owner_name);
  }
  const owners = Array.from(ownerMap.entries())
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name));

  // Build tasks
  const typedStageRows = stageRows as unknown as StageRowRaw[];
  const typedCandidateRows = candidateRows as unknown as CandidateRowRaw[];
  const typedProjectTaskRows = taskProjectRows as unknown as ProjectTaskRow[];

  const stagesByProject = new Map<string, StageRowRaw[]>();
  for (const s of typedStageRows) {
    const arr = stagesByProject.get(s.project_id) ?? [];
    arr.push(s);
    stagesByProject.set(s.project_id, arr);
  }
  const candidatesByProject = new Map<string, CandidateRowRaw[]>();
  for (const c of typedCandidateRows) {
    const arr = candidatesByProject.get(c.project_id) ?? [];
    arr.push(c);
    candidatesByProject.set(c.project_id, arr);
  }

  const now = new Date();
  const tasks: Task[] = [];

  for (const row of typedProjectTaskRows) {
    const f = normalizeFunnel(row.funnel);
    const score = Number(row.priority_score);
    const pid = row.id;
    const title = row.title;
    const ownerId = row.owner_id;
    const ownerName = row.owner_name;

    function push(rule_id: number, message: string, detail?: string) {
      tasks.push({ rule_id, project_id: pid, project_title: title, owner_id: ownerId, owner_name: ownerName, priority_score: score, message, detail });
    }

    if (score <= 2 && f.sourcing < 5) {
      push(1, 'Zwieksz sourcing — za malo kandydatow w lejku');
    }
    if (score <= 4 && f.sourcing > 10 && f.weryfikacja === 0) {
      push(2, 'Kandydaci czekaja na weryfikacje — przesun ich dalej');
    }

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

    if (score <= 2 && row.updated_at) {
      const updatedAt = new Date(row.updated_at as string);
      if (daysDiff(updatedAt, now) > 2) {
        push(4, 'Brak aktywnosci od ponad 2 dni na projekcie priorytetowym');
      }
    }

    const candidates = candidatesByProject.get(pid) ?? [];
    for (const cand of candidates) {
      if (!cand.created_at) continue;
      const createdAt = new Date(cand.created_at as string);
      if (daysDiff(createdAt, now) > 3) {
        push(5, 'Kandydat freelancera czeka na zatwierdzenie CV od ponad 3 dni');
        break;
      }
    }

    if (score <= 4 && f.weryfikacja > 5 && f.spotkania === 0) {
      push(6, 'Niska konwersja: duzo zweryfikowanych kandydatow, zero umowionych spotkan');
    }

    if (score <= 4) {
      const total = FUNNEL_LEVELS.reduce((s, lvl) => s + f[lvl.key], 0);
      if (total > 5) {
        const bottleneck = FUNNEL_LEVELS.find((lvl) => f[lvl.key] / total > 0.7);
        if (bottleneck) {
          push(7, `Waskie gardlo: kandydaci zatrzymani na etapie '${bottleneck.label}'`, bottleneck.label);
        }
      }
    }
  }

  tasks.sort((a, b) => a.priority_score - b.priority_score || a.rule_id - b.rule_id);

  return (
    <AppShell user={{ name: session.name, email: session.email, role: session.role }}>
      <PrioryteyClient initialItems={items} owners={owners} tasks={tasks} />
    </AppShell>
  );
}
