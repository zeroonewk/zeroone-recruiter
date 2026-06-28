import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { requireSession } from '@/lib/auth';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: RouteContext) {
  try {
    await requireSession();

    const { id } = await params;
    if (!UUID_RE.test(id)) {
      return NextResponse.json({ ok: false, error: 'Nieprawidlowe id' }, { status: 400 });
    }

    const rows = (await sql`
      SELECT
        fc.id,
        fc.full_name,
        fc.cv_url,
        fc.status,
        fc.user_id,
        u.name AS freelancer_name
      FROM freelancer_candidates fc
      JOIN users u ON u.id = fc.user_id
      WHERE fc.project_id = ${id}::uuid
      ORDER BY u.name ASC, fc.created_at ASC
    `) as {
      id: string;
      full_name: string;
      cv_url: string;
      status: string;
      user_id: string;
      freelancer_name: string;
    }[];

    return NextResponse.json({ ok: true, items: rows });
  } catch (e) {
    if (e instanceof Error && e.message === 'UNAUTHORIZED') {
      return NextResponse.json({ ok: false, error: 'Brak dostepu' }, { status: 401 });
    }
    return NextResponse.json({ ok: false, error: 'Blad serwera' }, { status: 500 });
  }
}
