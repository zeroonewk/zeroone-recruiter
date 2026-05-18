import { sql } from '@/lib/db';
import { verifyPassword, signSession, setSessionCookie } from '@/lib/auth';

type UserRow = {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'recruiter';
  password_hash: string;
  is_active: boolean;
};

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const email = typeof body?.email === 'string' ? body.email.trim() : '';
    const password = typeof body?.password === 'string' ? body.password : '';

    if (!email || !password) {
      return Response.json(
        { ok: false, error: 'Email i haslo sa wymagane' },
        { status: 400 }
      );
    }

    const rows = (await sql`
      SELECT id, email, name, role, password_hash, is_active
      FROM users
      WHERE LOWER(email) = LOWER(${email})
      LIMIT 1
    `) as UserRow[];

    const user = rows[0];
    if (!user) {
      return Response.json(
        { ok: false, error: 'Nieprawidlowy email lub haslo' },
        { status: 401 }
      );
    }

    if (!user.is_active) {
      return Response.json(
        { ok: false, error: 'Konto nieaktywne' },
        { status: 401 }
      );
    }

    const valid = await verifyPassword(password, user.password_hash);
    if (!valid) {
      return Response.json(
        { ok: false, error: 'Nieprawidlowy email lub haslo' },
        { status: 401 }
      );
    }

    const token = await signSession({
      sub: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    });
    await setSessionCookie(token);

    return Response.json({
      ok: true,
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
    });
  } catch (e) {
    console.error('[POST /api/zaloguj] ERROR:', e);
    return Response.json(
      { ok: false, error: 'Blad serwera' },
      { status: 500 }
    );
  }
}
