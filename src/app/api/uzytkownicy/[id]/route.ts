import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { requireSession } from '@/lib/auth';

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

type UserBasic = { id: string; role: string; is_active: boolean };
type CountRow = { count: number };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type RouteContext = { params: Promise<{ id: string }> };

async function getAdminSession() {
  const session = await requireSession();
  if (session.role !== 'admin') return null;
  return session;
}

export async function GET(_req: NextRequest, { params }: RouteContext) {
  try {
    const session = await getAdminSession();
    if (!session) {
      return NextResponse.json({ ok: false, error: 'Brak uprawnien' }, { status: 403 });
    }
    const { id } = await params;

    if (!UUID_RE.test(id)) {
      return NextResponse.json({ ok: false, error: 'Nieprawidlowe id' }, { status: 400 });
    }

    const rows = (await sql`
      SELECT id, email, name, role, is_active, is_external, created_at, updated_at
      FROM users WHERE id = ${id}
    `) as UserRow[];

    if (!rows[0]) {
      return NextResponse.json({ ok: false, error: 'Uzytkownik nie istnieje' }, { status: 404 });
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
    const session = await getAdminSession();
    if (!session) {
      return NextResponse.json({ ok: false, error: 'Brak uprawnien' }, { status: 403 });
    }
    const { id } = await params;

    if (!UUID_RE.test(id)) {
      return NextResponse.json({ ok: false, error: 'Nieprawidlowe id' }, { status: 400 });
    }

    const body = await request.json().catch(() => ({})) as Record<string, unknown>;

    // Validate incoming fields
    if ('email' in body) {
      const rawEmail = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
      if (!EMAIL_RE.test(rawEmail)) {
        return NextResponse.json({ ok: false, error: 'Nieprawidlowy email' }, { status: 400 });
      }
      body.email = rawEmail;
    }
    if ('name' in body) {
      const rawName = typeof body.name === 'string' ? body.name.trim() : '';
      if (rawName.length < 2 || rawName.length > 100) {
        return NextResponse.json(
          { ok: false, error: 'Imie i nazwisko musi miec od 2 do 100 znakow' },
          { status: 400 }
        );
      }
      body.name = rawName;
    }
    if ('role' in body && body.role !== 'admin' && body.role !== 'recruiter') {
      return NextResponse.json({ ok: false, error: 'Nieprawidlowa rola' }, { status: 400 });
    }
    if ('is_active' in body && typeof body.is_active !== 'boolean') {
      return NextResponse.json(
        { ok: false, error: 'is_active musi byc wartoscia logiczna' },
        { status: 400 }
      );
    }
    if ('is_external' in body && typeof body.is_external !== 'boolean') {
      return NextResponse.json(
        { ok: false, error: 'is_external musi byc wartoscia logiczna' },
        { status: 400 }
      );
    }

    // Fetch current user state
    const currentRows = (await sql`
      SELECT id, role, is_active FROM users WHERE id = ${id}
    `) as UserBasic[];
    const current = currentRows[0];
    if (!current) {
      return NextResponse.json({ ok: false, error: 'Uzytkownik nie istnieje' }, { status: 404 });
    }

    // Self-protection
    if (id === session.sub) {
      if ('role' in body && body.role !== current.role) {
        return NextResponse.json(
          { ok: false, error: 'Nie mozesz zmienic wlasnej roli' },
          { status: 400 }
        );
      }
      if ('is_active' in body && body.is_active !== current.is_active) {
        return NextResponse.json(
          { ok: false, error: 'Nie mozesz sie sam dezaktywowac' },
          { status: 400 }
        );
      }
    }

    // Last-admin protection
    const changingToNonAdmin = 'role' in body && body.role === 'recruiter';
    const deactivating = 'is_active' in body && body.is_active === false;
    if (current.role === 'admin' && (changingToNonAdmin || deactivating)) {
      const countRows = (await sql`
        SELECT COUNT(*)::int AS count FROM users
        WHERE role = 'admin' AND is_active = true AND id != ${id}
      `) as CountRow[];
      if ((countRows[0]?.count ?? 0) === 0) {
        return NextResponse.json(
          { ok: false, error: 'Musi pozostac przynajmniej jeden aktywny admin' },
          { status: 400 }
        );
      }
    }

    // Build dynamic UPDATE
    const setClauses: string[] = [];
    const values: unknown[] = [];
    let i = 1;

    if ('email' in body) { setClauses.push(`email = $${i++}`); values.push(body.email); }
    if ('name' in body) { setClauses.push(`name = $${i++}`); values.push(body.name); }
    if ('role' in body) { setClauses.push(`role = $${i++}`); values.push(body.role); }
    if ('is_active' in body) { setClauses.push(`is_active = $${i++}`); values.push(body.is_active); }
    if ('is_external' in body) { setClauses.push(`is_external = $${i++}`); values.push(body.is_external); }

    if (setClauses.length === 0) {
      const rows = (await sql`
        SELECT id, email, name, role, is_active, is_external, created_at, updated_at FROM users WHERE id = ${id}
      `) as UserRow[];
      return NextResponse.json({ ok: true, item: rows[0] });
    }

    values.push(id);
    const queryStr = `UPDATE users SET ${setClauses.join(', ')} WHERE id = $${i} RETURNING id, email, name, role, is_active, is_external, created_at, updated_at`;
    const rows = (await sql.query(queryStr, values)) as UserRow[];

    if (!rows[0]) {
      return NextResponse.json({ ok: false, error: 'Uzytkownik nie istnieje' }, { status: 404 });
    }
    return NextResponse.json({ ok: true, item: rows[0] });
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

export async function DELETE(_req: NextRequest, { params }: RouteContext) {
  try {
    const session = await getAdminSession();
    if (!session) {
      return NextResponse.json({ ok: false, error: 'Brak uprawnien' }, { status: 403 });
    }
    const { id } = await params;

    if (!UUID_RE.test(id)) {
      return NextResponse.json({ ok: false, error: 'Nieprawidlowe id' }, { status: 400 });
    }

    // Self-protection
    if (id === session.sub) {
      return NextResponse.json(
        { ok: false, error: 'Nie mozesz sie sam dezaktywowac' },
        { status: 400 }
      );
    }

    const currentRows = (await sql`
      SELECT role, is_active FROM users WHERE id = ${id}
    `) as { role: string; is_active: boolean }[];
    const current = currentRows[0];
    if (!current) {
      return NextResponse.json({ ok: false, error: 'Uzytkownik nie istnieje' }, { status: 404 });
    }

    // Last-admin protection
    if (current.role === 'admin') {
      const countRows = (await sql`
        SELECT COUNT(*)::int AS count FROM users
        WHERE role = 'admin' AND is_active = true AND id != ${id}
      `) as { count: number }[];
      if ((countRows[0]?.count ?? 0) === 0) {
        return NextResponse.json(
          { ok: false, error: 'Musi pozostac przynajmniej jeden aktywny admin' },
          { status: 400 }
        );
      }
    }

    const rows = (await sql`
      UPDATE users SET is_active = false WHERE id = ${id} RETURNING id
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
