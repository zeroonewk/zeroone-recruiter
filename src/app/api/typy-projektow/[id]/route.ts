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
      SELECT id, name, default_points, is_archived, created_at, updated_at
      FROM project_types
      WHERE id = ${id}
    `) as ProjectTypeRow[];

    if (!rows[0]) {
      return NextResponse.json({ ok: false, error: 'Typ projektu nie istnieje' }, { status: 404 });
    }

    return NextResponse.json({ ok: true, item: rows[0] });
  } catch (e) {
    if (e instanceof Error && e.message === 'UNAUTHORIZED') {
      return NextResponse.json({ ok: false, error: 'Brak dostepu' }, { status: 401 });
    }
    return NextResponse.json({ ok: false, error: 'Blad serwera' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  try {
    await requireSession();
    const { id } = await params;

    if (!UUID_RE.test(id)) {
      return NextResponse.json({ ok: false, error: 'Nieprawidlowe id' }, { status: 400 });
    }

    const body = await request.json().catch(() => ({})) as Record<string, unknown>;

    const setClauses: string[] = [];
    const values: unknown[] = [];
    let i = 1;

    if ('name' in body) {
      const rawName = typeof body.name === 'string' ? body.name.trim() : '';
      if (rawName.length < 2 || rawName.length > 100) {
        return NextResponse.json(
          { ok: false, error: 'Nazwa musi miec od 2 do 100 znakow' },
          { status: 400 }
        );
      }
      setClauses.push(`name = $${i++}`);
      values.push(rawName);
    }

    if ('default_points' in body) {
      const rawPoints = Number(body.default_points);
      if (!Number.isInteger(rawPoints) || rawPoints < 1 || rawPoints > 25) {
        return NextResponse.json(
          { ok: false, error: 'Domyslne punkty musza byc liczba calkowita od 1 do 25' },
          { status: 400 }
        );
      }
      setClauses.push(`default_points = $${i++}`);
      values.push(rawPoints);
    }

    if ('is_archived' in body) {
      if (typeof body.is_archived !== 'boolean') {
        return NextResponse.json(
          { ok: false, error: 'is_archived musi byc wartoscia logiczna' },
          { status: 400 }
        );
      }
      setClauses.push(`is_archived = $${i++}`);
      values.push(body.is_archived);
    }

    if (setClauses.length === 0) {
      const rows = (await sql`
        SELECT id, name, default_points, is_archived, created_at, updated_at
        FROM project_types WHERE id = ${id}
      `) as ProjectTypeRow[];
      if (!rows[0]) {
        return NextResponse.json({ ok: false, error: 'Typ projektu nie istnieje' }, { status: 404 });
      }
      return NextResponse.json({ ok: true, item: rows[0] });
    }

    values.push(id);
    const queryStr = `UPDATE project_types SET ${setClauses.join(', ')} WHERE id = $${i} RETURNING id, name, default_points, is_archived, created_at, updated_at`;
    const rows = (await sql.query(queryStr, values)) as ProjectTypeRow[];

    if (!rows[0]) {
      return NextResponse.json({ ok: false, error: 'Typ projektu nie istnieje' }, { status: 404 });
    }

    return NextResponse.json({ ok: true, item: rows[0] });
  } catch (e) {
    if (e instanceof Error && e.message === 'UNAUTHORIZED') {
      return NextResponse.json({ ok: false, error: 'Brak dostepu' }, { status: 401 });
    }
    return NextResponse.json({ ok: false, error: 'Blad serwera' }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: RouteContext) {
  try {
    await requireSession();
    const { id } = await params;

    if (!UUID_RE.test(id)) {
      return NextResponse.json({ ok: false, error: 'Nieprawidlowe id' }, { status: 400 });
    }

    const rows = (await sql`
      UPDATE project_types SET is_archived = TRUE WHERE id = ${id}
      RETURNING id
    `) as { id: string }[];

    if (!rows[0]) {
      return NextResponse.json({ ok: false, error: 'Typ projektu nie istnieje' }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof Error && e.message === 'UNAUTHORIZED') {
      return NextResponse.json({ ok: false, error: 'Brak dostepu' }, { status: 401 });
    }
    return NextResponse.json({ ok: false, error: 'Blad serwera' }, { status: 500 });
  }
}
