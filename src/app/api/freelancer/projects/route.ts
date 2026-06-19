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
        p.closed_at,
        c.name AS client_name,
        (
          SELECT elem->>'url'
          FROM jsonb_array_elements(p.links) AS elem
          WHERE elem->>'label' = 'job_url'
          LIMIT 1
        ) AS job_url,
        fp.amount AS payout_amount
      FROM projects p
      JOIN clients c ON c.id = p.client_id
      JOIN project_freelancers pf ON pf.project_id = p.id
      LEFT JOIN freelancer_payouts fp ON fp.project_id = p.id AND fp.user_id = ${session.sub}::uuid
      WHERE pf.user_id = ${session.sub}::uuid
      ORDER BY (p.closed_at IS NULL) DESC, p.title ASC
    `) as {
      id: string;
      title: string;
      points: number;
      closed_at: string | null;
      client_name: string;
      job_url: string | null;
      payout_amount: string | null;
    }[];

    return NextResponse.json({ ok: true, items: rows });
  } catch (e) {
    if (e instanceof Error && e.message === 'UNAUTHORIZED') {
      return NextResponse.json({ ok: false, error: 'Brak dostepu' }, { status: 401 });
    }
    return NextResponse.json({ ok: false, error: 'Blad serwera' }, { status: 500 });
  }
}
