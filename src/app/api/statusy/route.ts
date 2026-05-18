import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { requireSession } from '@/lib/auth';

type StatusRow = {
  id: string;
  name: string;
  color: string;
  is_success: boolean;
  position: number;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
};

const COLOR_RE = /^#[0-9A-Fa-f]{6}$/;

export async function GET(request: NextRequest) {
  try {
    await requireSession();
    const archived = request.nextUrl.searchParams.get('archived') === 'true';

    const rows = (await sql`
      SELECT id, name, color, is_success, position, is_archived, created_at, updated_at
      FROM result_statuses
      WHERE (${archived} = TRUE OR is_archived = FALSE)
      ORDER BY is_archived ASC, position ASC
    `) as StatusRow[];

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
    const rawColor = typeof body?.color === 'string' ? body.color : '';
    const rawIsSuccess = typeof body?.is_success === 'boolean' ? body.is_success : null;

    if (rawName.length < 2 || rawName.length > 100) {
      return NextResponse.json(
        { ok: false, error: 'Nazwa musi miec od 2 do 100 znakow' },
        { status: 400 }
      );
    }
    if (!COLOR_RE.test(rawColor)) {
      return NextResponse.json(
        { ok: false, error: 'Nieprawidlowy format koloru (#RRGGBB)' },
        { status: 400 }
      );
    }
    if (rawIsSuccess === null) {
      return NextResponse.json(
        { ok: false, error: 'Pole is_success jest wymagane' },
        { status: 400 }
      );
    }

    const posRows = (await sql`
      SELECT COALESCE(MAX(position), 0) + 1 AS next_pos
      FROM result_statuses
      WHERE is_archived = FALSE
    `) as { next_pos: number }[];
    const nextPos = posRows[0]?.next_pos ?? 1;

    const rows = (await sql`
      INSERT INTO result_statuses (name, color, is_success, position)
      VALUES (${rawName}, ${rawColor}, ${rawIsSuccess}, ${nextPos})
      RETURNING id, name, color, is_success, position, is_archived, created_at, updated_at
    `) as StatusRow[];

    return NextResponse.json({ ok: true, item: rows[0] }, { status: 201 });
  } catch (e) {
    if (e instanceof Error && e.message === 'UNAUTHORIZED') {
      return NextResponse.json({ ok: false, error: 'Brak dostepu' }, { status: 401 });
    }
    return NextResponse.json({ ok: false, error: 'Blad serwera' }, { status: 500 });
  }
}
