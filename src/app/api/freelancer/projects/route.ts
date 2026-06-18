import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { requireSession } from '@/lib/auth';

export async function GET() {
  try {
    const session = await requireSession();

    const rows = (await sql`
      SELECT
        p.id,
        p.title,
        p.points,
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
      WHERE pf.user_id = ${session.sub}::uuid
        AND p.closed_at IS NULL
      ORDER BY p.title ASC
    `) as {
      id: string;
      title: string;
      points: number;
      client_name: string;
      job_url: string | null;
    }[];

    return NextResponse.json({ ok: true, items: rows });
  } catch (e) {
    if (e instanceof Error && e.message === 'UNAUTHORIZED') {
      return NextResponse.json({ ok: false, error: 'Brak dostepu' }, { status: 401 });
    }
    return NextResponse.json({ ok: false, error: 'Blad serwera' }, { status: 500 });
  }
}
