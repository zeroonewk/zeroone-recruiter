import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { requireSession, hashPassword } from '@/lib/auth';

type UserRow = {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'recruiter';
  is_active: boolean;
  is_external: boolean;
  created_at: string;
  updated_at: string;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function getAdminSession() {
  const session = await requireSession();
  if (session.role !== 'admin') return null;
  return session;
}

export async function GET() {
  try {
    const session = await getAdminSession();
    if (!session) {
      return NextResponse.json({ ok: false, error: 'Brak uprawnien' }, { status: 403 });
    }

    const rows = (await sql`
      SELECT id, email, name, role, is_active, is_external, created_at, updated_at
      FROM users
      ORDER BY name ASC
    `) as UserRow[];

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
    const session = await getAdminSession();
    if (!session) {
      return NextResponse.json({ ok: false, error: 'Brak uprawnien' }, { status: 403 });
    }

    const body = await request.json().catch(() => null);
    const rawEmail = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
    const rawName = typeof body?.name === 'string' ? body.name.trim() : '';
    const rawRole = typeof body?.role === 'string' ? body.role : '';
    const rawPassword = typeof body?.password === 'string' ? body.password : '';
    const rawIsExternal = typeof body?.is_external === 'boolean' ? body.is_external : false;

    if (!EMAIL_RE.test(rawEmail)) {
      return NextResponse.json({ ok: false, error: 'Nieprawidlowy email' }, { status: 400 });
    }
    if (rawName.length < 2 || rawName.length > 100) {
      return NextResponse.json(
        { ok: false, error: 'Imie i nazwisko musi miec od 2 do 100 znakow' },
        { status: 400 }
      );
    }
    if (rawRole !== 'admin' && rawRole !== 'recruiter') {
      return NextResponse.json({ ok: false, error: 'Nieprawidlowa rola' }, { status: 400 });
    }
    if (rawPassword.length < 8) {
      return NextResponse.json(
        { ok: false, error: 'Haslo musi miec minimum 8 znakow' },
        { status: 400 }
      );
    }

    const hash = await hashPassword(rawPassword);

    const rows = (await sql`
      INSERT INTO users (email, name, role, password_hash, is_external)
      VALUES (${rawEmail}, ${rawName}, ${rawRole}, ${hash}, ${rawIsExternal})
      RETURNING id, email, name, role, is_active, is_external, created_at, updated_at
    `) as UserRow[];

    return NextResponse.json({ ok: true, item: rows[0] }, { status: 201 });
  } catch (e) {
    if (e instanceof Error && e.message === 'UNAUTHORIZED') {
      return NextResponse.json({ ok: false, error: 'Brak dostepu' }, { status: 401 });
    }
    const pgErr = e as { code?: string };
    if (pgErr.code === '23505') {
      return NextResponse.json(
        { ok: false, error: 'Uzytkownik z tym emailem juz istnieje' },
        { status: 400 }
      );
    }
    return NextResponse.json({ ok: false, error: 'Blad serwera' }, { status: 500 });
  }
}
