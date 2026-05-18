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

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const COLOR_RE = /^#[0-9A-Fa-f]{6}$/;

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: RouteContext) {
  try {
    await requireSession();
    const { id } = await params;

    if (!UUID_RE.test(id)) {
      return NextResponse.json({ ok: false, error: 'Nieprawidlowe id' }, { status: 400 });
    }

    const rows = (await sql`
      SELECT id, name, color, is_success, position, is_archived, created_at, updated_at
      FROM result_statuses
      WHERE id = ${id}
    `) as StatusRow[];

    if (!rows[0]) {
      return NextResponse.json({ ok: false, error: 'Status nie istnieje' }, { status: 404 });
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

    if ('color' in body) {
      const rawColor = typeof body.color === 'string' ? body.color : '';
      if (!COLOR_RE.test(rawColor)) {
        return NextResponse.json(
          { ok: false, error: 'Nieprawidlowy format koloru (#RRGGBB)' },
          { status: 400 }
        );
      }
      setClauses.push(`color = $${i++}`);
      values.push(rawColor);
    }

    if ('is_success' in body) {
      if (typeof body.is_success !== 'boolean') {
        return NextResponse.json(
          { ok: false, error: 'is_success musi byc wartoscia logiczna' },
          { status: 400 }
        );
      }
      setClauses.push(`is_success = $${i++}`);
      values.push(body.is_success);
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
        SELECT id, name, color, is_success, position, is_archived, created_at, updated_at
        FROM result_statuses WHERE id = ${id}
      `) as StatusRow[];
      if (!rows[0]) {
        return NextResponse.json({ ok: false, error: 'Status nie istnieje' }, { status: 404 });
      }
      return NextResponse.json({ ok: true, item: rows[0] });
    }

    values.push(id);
    const queryStr = `UPDATE result_statuses SET ${setClauses.join(', ')} WHERE id = $${i} RETURNING id, name, color, is_success, position, is_archived, created_at, updated_at`;
    const rows = (await sql.query(queryStr, values)) as StatusRow[];

    if (!rows[0]) {
      return NextResponse.json({ ok: false, error: 'Status nie istnieje' }, { status: 404 });
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
      UPDATE result_statuses SET is_archived = TRUE WHERE id = ${id}
      RETURNING id
    `) as { id: string }[];

    if (!rows[0]) {
      return NextResponse.json({ ok: false, error: 'Status nie istnieje' }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof Error && e.message === 'UNAUTHORIZED') {
      return NextResponse.json({ ok: false, error: 'Brak dostepu' }, { status: 401 });
    }
    return NextResponse.json({ ok: false, error: 'Blad serwera' }, { status: 500 });
  }
}
