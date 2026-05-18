import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { requireSession } from '@/lib/auth';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type RouteContext = { params: Promise<{ id: string }> };

type StageBasic = { id: string; position: number; is_archived: boolean };

export async function POST(request: NextRequest, { params }: RouteContext) {
  try {
    await requireSession();
    const { id } = await params;

    if (!UUID_RE.test(id)) {
      return NextResponse.json({ ok: false, error: 'Nieprawidlowe id' }, { status: 400 });
    }

    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const direction = body.direction;
    if (direction !== 'up' && direction !== 'down') {
      return NextResponse.json(
        { ok: false, error: 'direction musi byc "up" lub "down"' },
        { status: 400 }
      );
    }

    const currentRows = (await sql`
      SELECT id, position, is_archived
      FROM workflow_stages_template
      WHERE id = ${id}
    `) as StageBasic[];

    const current = currentRows[0];
    if (!current) {
      return NextResponse.json({ ok: false, error: 'Etap nie istnieje' }, { status: 404 });
    }
    if (current.is_archived) {
      return NextResponse.json(
        { ok: false, error: 'Nie mozna przesuwac zarchiwizowanego etapu' },
        { status: 400 }
      );
    }

    const neighborRows = direction === 'up'
      ? (await sql`
          SELECT id, position
          FROM workflow_stages_template
          WHERE is_archived = FALSE AND position < ${current.position}
          ORDER BY position DESC
          LIMIT 1
        `) as StageBasic[]
      : (await sql`
          SELECT id, position
          FROM workflow_stages_template
          WHERE is_archived = FALSE AND position > ${current.position}
          ORDER BY position ASC
          LIMIT 1
        `) as StageBasic[];

    const neighbor = neighborRows[0];
    if (!neighbor) {
      return NextResponse.json(
        { ok: false, error: 'Nie mozna przesunac dalej' },
        { status: 400 }
      );
    }

    await sql`
      UPDATE workflow_stages_template SET position = ${neighbor.position} WHERE id = ${id}
    `;
    await sql`
      UPDATE workflow_stages_template SET position = ${current.position} WHERE id = ${neighbor.id}
    `;

    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof Error && e.message === 'UNAUTHORIZED') {
      return NextResponse.json({ ok: false, error: 'Brak dostepu' }, { status: 401 });
    }
    return NextResponse.json({ ok: false, error: 'Blad serwera' }, { status: 500 });
  }
}
