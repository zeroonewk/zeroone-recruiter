import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { requireSession } from '@/lib/auth';
import { normalizeFunnel, FUNNEL_LEVELS, type FunnelData } from '@/lib/funnel';
import { toDateString } from '@/lib/dates';

export type PriorityItem = {
  id: string;
  title: string;
  funnel: FunnelData;
  client_name: string;
  client_priority: number;
  type_name: string;
  type_priority: number;
  priority_score: number;
  owner_name: string;
  owner_id: string;
  status_name: string;
  status_color: string;
  is_success: boolean;
  opened_at: string;
};

export async function GET() {
  try {
    await requireSession();

    const rows = (await sql`
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
    `) as Record<string, unknown>[];

    const items: PriorityItem[] = rows.map((r) => ({
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

    return NextResponse.json({ ok: true, items });
  } catch (e) {
    if (e instanceof Error && e.message === 'UNAUTHORIZED') {
      return NextResponse.json({ ok: false, error: 'Brak dostepu' }, { status: 401 });
    }
    return NextResponse.json({ ok: false, error: 'Blad serwera' }, { status: 500 });
  }
}
