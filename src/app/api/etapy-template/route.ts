import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { requireSession } from '@/lib/auth';

type StageRow = {
  id: string;
  name: string;
  position: number;
  default_days_offset: number;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
};

export async function GET(request: NextRequest) {
  try {
    await requireSession();
    const archived = request.nextUrl.searchParams.get('archived') === 'true';

    const rows = (await sql`
      SELECT id, name, position, default_days_offset, is_archived, created_at, updated_at
      FROM workflow_stages_template
      WHERE (${archived} = TRUE OR is_archived = FALSE)
      ORDER BY is_archived ASC, position ASC
    `) as StageRow[];

    return NextResponse.json({ ok: true, items: rows });
  } catch (e) {
    if (e instanceof Error && e.message === 'UNAUTHORIZED') {
      return NextResponse.json({ ok: false, error: 'Brak dostepu' }, { status: 401 });
    }
    return NextResponse.json({ ok: false, error: 'Blad serwera' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireSession();

    const body = await request.json().catch(() => null);
    const rawName = typeof body?.name === 'string' ? body.name.trim() : '';
    const rawOffset = Number(body?.default_days_offset);

    if (rawName.length < 2 || rawName.length > 100) {
      return NextResponse.json(
        { ok: false, error: 'Nazwa musi miec od 2 do 100 znakow' },
        { status: 400 }
      );
    }
    if (!Number.isInteger(rawOffset) || rawOffset < 0 || rawOffset > 365) {
      return NextResponse.json(
        { ok: false, error: 'Domyslny deadline musi byc liczba calkowita od 0 do 365' },
        { status: 400 }
      );
    }

    const posRows = (await sql`
      SELECT COALESCE(MAX(position), 0) + 1 AS next_pos
      FROM workflow_stages_template
      WHERE is_archived = FALSE
    `) as { next_pos: number }[];
    const nextPos = posRows[0]?.next_pos ?? 1;

    const rows = (await sql`
      INSERT INTO workflow_stages_template (name, position, default_days_offset)
      VALUES (${rawName}, ${nextPos}, ${rawOffset})
      RETURNING id, name, position, default_days_offset, is_archived, created_at, updated_at
    `) as StageRow[];

    return NextResponse.json({ ok: true, item: rows[0] }, { status: 201 });
  } catch (e) {
    if (e instanceof Error && e.message === 'UNAUTHORIZED') {
      return NextResponse.json({ ok: false, error: 'Brak dostepu' }, { status: 401 });
    }
    return NextResponse.json({ ok: false, error: 'Blad serwera' }, { status: 500 });
  }
}
