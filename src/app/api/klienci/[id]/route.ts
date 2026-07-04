import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { requireSession } from '@/lib/auth';

type ClientRow = {
  id: string;
  name: string;
  notes: string | null;
  priority_class: number;
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
      SELECT id, name, notes, priority_class, is_archived, created_at, updated_at
      FROM clients
      WHERE id = ${id}
    `) as ClientRow[];

    if (!rows[0]) {
      return NextResponse.json({ ok: false, error: 'Klient nie istnieje' }, { status: 404 });
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
      if (rawName.length < 2 || rawName.length > 200) {
        return NextResponse.json(
          { ok: false, error: 'Nazwa musi miec od 2 do 200 znakow' },
          { status: 400 }
        );
      }
      setClauses.push(`name = $${i++}`);
      values.push(rawName);
    }

    if ('notes' in body) {
      const rawNotes = body.notes === null ? null : typeof body.notes === 'string' ? body.notes.trim() || null : null;
      if (rawNotes !== null && rawNotes.length > 2000) {
        return NextResponse.json(
          { ok: false, error: 'Notatki nie moga przekraczac 2000 znakow' },
          { status: 400 }
        );
      }
      setClauses.push(`notes = $${i++}`);
      values.push(rawNotes);
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

    if ('priority_class' in body) {
      const rawPriority = Number(body.priority_class);
      if (![1, 2, 3].includes(rawPriority)) {
        return NextResponse.json(
          { ok: false, error: 'priority_class musi byc 1, 2 lub 3' },
          { status: 400 }
        );
      }
      setClauses.push(`priority_class = $${i++}`);
      values.push(rawPriority);
    }

    if (setClauses.length === 0) {
      const rows = (await sql`
        SELECT id, name, notes, priority_class, is_archived, created_at, updated_at
        FROM clients WHERE id = ${id}
      `) as ClientRow[];
      if (!rows[0]) {
        return NextResponse.json({ ok: false, error: 'Klient nie istnieje' }, { status: 404 });
      }
      return NextResponse.json({ ok: true, item: rows[0] });
    }

    values.push(id);
    const queryStr = `UPDATE clients SET ${setClauses.join(', ')} WHERE id = $${i} RETURNING id, name, notes, priority_class, is_archived, created_at, updated_at`;
    const rows = (await sql.query(queryStr, values)) as ClientRow[];

    if (!rows[0]) {
      return NextResponse.json({ ok: false, error: 'Klient nie istnieje' }, { status: 404 });
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
      UPDATE clients SET is_archived = TRUE WHERE id = ${id}
      RETURNING id
    `) as { id: string }[];

    if (!rows[0]) {
      return NextResponse.json({ ok: false, error: 'Klient nie istnieje' }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof Error && e.message === 'UNAUTHORIZED') {
      return NextResponse.json({ ok: false, error: 'Brak dostepu' }, { status: 401 });
    }
    return NextResponse.json({ ok: false, error: 'Blad serwera' }, { status: 500 });
  }
}
