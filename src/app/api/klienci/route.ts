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

export async function GET(request: NextRequest) {
  try {
    await requireSession();
    const archived = request.nextUrl.searchParams.get('archived') === 'true';

    const rows = (await sql`
      SELECT id, name, notes, priority_class, is_archived, created_at, updated_at
      FROM clients
      WHERE (CASE WHEN ${archived} THEN TRUE ELSE is_archived = FALSE END)
      ORDER BY is_archived ASC, name ASC
    `) as ClientRow[];

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
    const rawNotes = typeof body?.notes === 'string' ? body.notes.trim() : null;
    const rawPriority = Number(body?.priority_class ?? 2);

    if (rawName.length < 2 || rawName.length > 200) {
      return NextResponse.json(
        { ok: false, error: 'Nazwa musi miec od 2 do 200 znakow' },
        { status: 400 }
      );
    }
    if (rawNotes !== null && rawNotes.length > 2000) {
      return NextResponse.json(
        { ok: false, error: 'Notatki nie moga przekraczac 2000 znakow' },
        { status: 400 }
      );
    }
    if (![1, 2, 3].includes(rawPriority)) {
      return NextResponse.json(
        { ok: false, error: 'priority_class musi byc 1, 2 lub 3' },
        { status: 400 }
      );
    }

    const rows = (await sql`
      INSERT INTO clients (name, notes, priority_class)
      VALUES (${rawName}, ${rawNotes}, ${rawPriority})
      RETURNING id, name, notes, priority_class, is_archived, created_at, updated_at
    `) as ClientRow[];

    return NextResponse.json({ ok: true, item: rows[0] }, { status: 201 });
  } catch (e) {
    if (e instanceof Error && e.message === 'UNAUTHORIZED') {
      return NextResponse.json({ ok: false, error: 'Brak dostepu' }, { status: 401 });
    }
    return NextResponse.json({ ok: false, error: 'Blad serwera' }, { status: 500 });
  }
}
