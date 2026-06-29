import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { requireSession } from '@/lib/auth';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(_req: NextRequest, { params }: RouteContext) {
  try {
    const session = await requireSession();

    if (session.role !== 'admin') {
      return NextResponse.json({ ok: false, error: 'Brak uprawnien' }, { status: 403 });
    }

    const { id } = await params;
    if (!UUID_RE.test(id)) {
      return NextResponse.json({ ok: false, error: 'Nieprawidlowe id' }, { status: 400 });
    }

    const projectRows = (await sql`
      SELECT id, closed_at, status_id FROM projects WHERE id = ${id}::uuid LIMIT 1
    `) as { id: string; closed_at: unknown; status_id: string }[];

    const project = projectRows[0];
    if (!project) {
      return NextResponse.json({ ok: false, error: 'Projekt nie istnieje' }, { status: 404 });
    }

    if (project.closed_at === null) {
      return NextResponse.json({ ok: false, error: 'Projekt nie jest zamkniety' }, { status: 400 });
    }

    const statusRows = (await sql`
      SELECT id FROM result_statuses
      WHERE is_success = FALSE AND name ILIKE '%aktywny%'
      LIMIT 1
    `) as { id: string }[];

    if (statusRows.length === 0) {
      return NextResponse.json(
        { ok: false, error: 'Nie znaleziono statusu Aktywny' },
        { status: 500 }
      );
    }

    const aktywnyId = statusRows[0].id;

    await sql`
      UPDATE projects
      SET closed_at = NULL, status_id = ${aktywnyId}::uuid, updated_at = NOW()
      WHERE id = ${id}::uuid
    `;

    await sql`DELETE FROM point_transactions WHERE project_id = ${id}::uuid`;
    await sql`DELETE FROM freelancer_payouts WHERE project_id = ${id}::uuid`;

    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof Error && e.message === 'UNAUTHORIZED') {
      return NextResponse.json({ ok: false, error: 'Brak dostepu' }, { status: 401 });
    }
    console.error('[POST /api/projekty/[id]/cofnij]', e);
    return NextResponse.json({ ok: false, error: 'Blad serwera' }, { status: 500 });
  }
}
