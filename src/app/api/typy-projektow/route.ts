import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { requireSession } from '@/lib/auth';

type ProjectTypeRow = {
  id: string;
  name: string;
  default_points: number;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
};

export async function GET(request: NextRequest) {
  try {
    await requireSession();
    const archived = request.nextUrl.searchParams.get('archived') === 'true';

    const rows = (await sql`
      SELECT id, name, default_points, is_archived, created_at, updated_at
      FROM project_types
      WHERE (${archived} = TRUE OR is_archived = FALSE)
      ORDER BY is_archived ASC, name ASC
    `) as ProjectTypeRow[];

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
    const rawPoints = Number(body?.default_points);

    if (rawName.length < 2 || rawName.length > 100) {
      return NextResponse.json(
        { ok: false, error: 'Nazwa musi miec od 2 do 100 znakow' },
        { status: 400 }
      );
    }
    if (!Number.isInteger(rawPoints) || rawPoints < 1 || rawPoints > 25) {
      return NextResponse.json(
        { ok: false, error: 'Domyslne punkty musza byc liczba calkowita od 1 do 25' },
        { status: 400 }
      );
    }

    const rows = (await sql`
      INSERT INTO project_types (name, default_points)
      VALUES (${rawName}, ${rawPoints})
      RETURNING id, name, default_points, is_archived, created_at, updated_at
    `) as ProjectTypeRow[];

    return NextResponse.json({ ok: true, item: rows[0] }, { status: 201 });
  } catch (e) {
    if (e instanceof Error && e.message === 'UNAUTHORIZED') {
      return NextResponse.json({ ok: false, error: 'Brak dostepu' }, { status: 401 });
    }
    return NextResponse.json({ ok: false, error: 'Blad serwera' }, { status: 500 });
  }
}
