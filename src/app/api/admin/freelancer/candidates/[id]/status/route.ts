import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { requireSession } from '@/lib/auth';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VALID_STATUSES = ['submitted', 'stage1', 'stage2', 'selected'] as const;
type CandidateStatus = (typeof VALID_STATUSES)[number];

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  try {
    const session = await requireSession();

    if (session.role !== 'admin') {
      return NextResponse.json({ ok: false, error: 'Brak uprawnien' }, { status: 403 });
    }

    const { id } = await params;
    if (!UUID_RE.test(id)) {
      return NextResponse.json({ ok: false, error: 'Nieprawidlowe id' }, { status: 400 });
    }

    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    if (!body) {
      return NextResponse.json({ ok: false, error: 'Nieprawidlowe body' }, { status: 400 });
    }

    const newStatus = typeof body.status === 'string' ? body.status : '';
    if (!VALID_STATUSES.includes(newStatus as CandidateStatus)) {
      return NextResponse.json(
        { ok: false, error: 'Nieprawidlowy status. Dozwolone: submitted, stage1, stage2, selected' },
        { status: 400 }
      );
    }

    const currentRows = (await sql`
      SELECT status FROM freelancer_candidates WHERE id = ${id}::uuid
    `) as { status: string }[];

    if (!currentRows[0]) {
      return NextResponse.json({ ok: false, error: 'Kandydat nie istnieje' }, { status: 404 });
    }

    const currentIdx = VALID_STATUSES.indexOf(currentRows[0].status as CandidateStatus);
    const newIdx = VALID_STATUSES.indexOf(newStatus as CandidateStatus);
    if (Math.abs(newIdx - currentIdx) !== 1) {
      return NextResponse.json(
        { ok: false, error: 'Dozwolone tylko przejscie o jeden krok w przod lub w tyl' },
        { status: 400 }
      );
    }

    const rows = (await sql`
      UPDATE freelancer_candidates
      SET status = ${newStatus}
      WHERE id = ${id}::uuid
      RETURNING id, full_name, cv_url, status, project_id, user_id
    `) as { id: string; full_name: string; cv_url: string; status: string; project_id: string; user_id: string }[];

    if (!rows[0]) {
      return NextResponse.json({ ok: false, error: 'Kandydat nie istnieje' }, { status: 404 });
    }

    return NextResponse.json({ ok: true, item: rows[0] });
  } catch (e) {
    if (e instanceof Error && e.message === 'UNAUTHORIZED') {
      return NextResponse.json({ ok: false, error: 'Brak dostepu' }, { status: 401 });
    }
    return NextResponse.json({ ok: false, error: 'Blad serwera' }, { status: 500 });
  }
}
