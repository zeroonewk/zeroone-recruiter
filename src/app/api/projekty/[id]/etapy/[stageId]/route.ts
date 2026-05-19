import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { requireSession } from '@/lib/auth';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

type StageRow = {
  id: string;
  name: string;
  position: number;
  deadline: string;
  done_at: string | null;
  notes: string | null;
};

type RouteContext = { params: Promise<{ id: string; stageId: string }> };

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  try {
    await requireSession();
    const { id, stageId } = await params;

    if (!UUID_RE.test(id) || !UUID_RE.test(stageId)) {
      return NextResponse.json({ ok: false, error: 'Nieprawidlowe id' }, { status: 400 });
    }

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) {
      return NextResponse.json({ ok: false, error: 'Nieprawidlowe body' }, { status: 400 });
    }

    const setClauses: string[] = [];
    const values: unknown[] = [];
    let i = 1;

    if ('deadline' in body) {
      const deadline = typeof body.deadline === 'string' ? body.deadline : '';
      if (!DATE_RE.test(deadline)) {
        return NextResponse.json(
          { ok: false, error: 'Nieprawidlowa data deadline (format YYYY-MM-DD)' },
          { status: 400 }
        );
      }
      setClauses.push(`deadline = $${i++}::date`);
      values.push(deadline);
    }

    if ('done_at' in body) {
      if (body.done_at === null) {
        setClauses.push(`done_at = $${i++}`);
        values.push(null);
      } else {
        const done_at = typeof body.done_at === 'string' ? body.done_at : '';
        if (!DATE_RE.test(done_at)) {
          return NextResponse.json(
            { ok: false, error: 'Nieprawidlowa data done_at (format YYYY-MM-DD)' },
            { status: 400 }
          );
        }
        setClauses.push(`done_at = $${i++}::date`);
        values.push(done_at);
      }
    }

    if (setClauses.length === 0) {
      return NextResponse.json({ ok: false, error: 'Brak pol do aktualizacji' }, { status: 400 });
    }

    const existsRows = (await sql`
      SELECT id FROM project_stages
      WHERE id = ${stageId}::uuid AND project_id = ${id}::uuid
    `) as { id: string }[];

    if (!existsRows || existsRows.length === 0) {
      return NextResponse.json({ ok: false, error: 'Etap nie istnieje' }, { status: 404 });
    }

    values.push(stageId);
    values.push(id);
    const queryStr = `
      UPDATE project_stages
      SET ${setClauses.join(', ')}, updated_at = NOW()
      WHERE id = $${i}::uuid AND project_id = $${i + 1}::uuid
      RETURNING id, name, position, deadline, done_at, notes
    `;
    const rows = (await sql.query(queryStr, values)) as StageRow[];

    if (!rows || rows.length === 0) {
      return NextResponse.json({ ok: false, error: 'Etap nie istnieje' }, { status: 404 });
    }

    return NextResponse.json({ ok: true, stage: rows[0] });
  } catch (e) {
    if (e instanceof Error && e.message === 'UNAUTHORIZED') {
      return NextResponse.json({ ok: false, error: 'Brak dostepu' }, { status: 401 });
    }
    console.error('[PATCH /api/projekty/[id]/etapy/[stageId]]', e);
    return NextResponse.json({ ok: false, error: 'Blad serwera' }, { status: 500 });
  }
}
