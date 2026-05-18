import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { requireSession, hashPassword } from '@/lib/auth';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: RouteContext) {
  try {
    const session = await requireSession();
    if (session.role !== 'admin') {
      return NextResponse.json({ ok: false, error: 'Brak uprawnien' }, { status: 403 });
    }
    const { id } = await params;

    if (!UUID_RE.test(id)) {
      return NextResponse.json({ ok: false, error: 'Nieprawidlowe id' }, { status: 400 });
    }

    const body = await request.json().catch(() => null);
    const newPassword = typeof body?.new_password === 'string' ? body.new_password : '';

    if (newPassword.length < 8) {
      return NextResponse.json(
        { ok: false, error: 'Haslo musi miec minimum 8 znakow' },
        { status: 400 }
      );
    }

    const hash = await hashPassword(newPassword);

    const rows = (await sql`
      UPDATE users SET password_hash = ${hash} WHERE id = ${id} RETURNING id
    `) as { id: string }[];

    if (!rows[0]) {
      return NextResponse.json({ ok: false, error: 'Uzytkownik nie istnieje' }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof Error && e.message === 'UNAUTHORIZED') {
      return NextResponse.json({ ok: false, error: 'Brak dostepu' }, { status: 401 });
    }
    return NextResponse.json({ ok: false, error: 'Blad serwera' }, { status: 500 });
  }
}
