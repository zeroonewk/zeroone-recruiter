import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { requireSession } from '@/lib/auth';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: RouteContext) {
  try {
    const session = await requireSession();
    const { id } = await params;

    if (!UUID_RE.test(id)) {
      return NextResponse.json({ ok: false, error: 'Nieprawidlowe id' }, { status: 400 });
    }

    const rows = (await sql`
      SELECT
        p.id,
        p.title,
        p.points,
        p.closed_at,
        p.status_id,
        p.freelancer_rates,
        c.name AS client_name,
        (
          SELECT elem->>'url'
          FROM jsonb_array_elements(p.links) AS elem
          WHERE elem->>'label' = 'job_url'
          LIMIT 1
        ) AS job_url
      FROM projects p
      JOIN clients c ON c.id = p.client_id
      JOIN project_freelancers pf ON pf.project_id = p.id
      WHERE p.id = ${id}::uuid
        AND pf.user_id = ${session.sub}::uuid
      LIMIT 1
    `) as {
      id: string;
      title: string;
      points: number;
      closed_at: string | null;
      status_id: string;
      freelancer_rates: unknown;
      client_name: string;
      job_url: string | null;
    }[];

    if (!rows[0]) {
      return NextResponse.json({ ok: false, error: 'Projekt nie istnieje' }, { status: 404 });
    }

    return NextResponse.json({ ok: true, project: rows[0] });
  } catch (e) {
    if (e instanceof Error && e.message === 'UNAUTHORIZED') {
      return NextResponse.json({ ok: false, error: 'Brak dostepu' }, { status: 401 });
    }
    return NextResponse.json({ ok: false, error: 'Blad serwera' }, { status: 500 });
  }
}
