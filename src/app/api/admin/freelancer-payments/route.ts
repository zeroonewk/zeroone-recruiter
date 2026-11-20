import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { requireSession } from '@/lib/auth';
import { TODAY_WARSAW_SQL } from '@/lib/dates';
import { fetchFreelancerBalance } from '@/lib/status-metrics';

export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const AMOUNT_RE = /^-?\d+(\.\d{1,2})?$/;
const MAX_ABS_AMOUNT = 10_000_000;
const MAX_NOTE = 300;

function bad(error: string, status = 400) {
  return NextResponse.json({ ok: false, error }, { status });
}

function isValidCalendarDate(s: string): boolean {
  if (!DATE_RE.test(s)) return false;
  const d = new Date(s + 'T00:00:00Z');
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

async function requireAdmin() {
  const session = await requireSession();
  return session.role === 'admin' ? session : null;
}

function handleError(e: unknown, where: string) {
  if (e instanceof Error && e.message === 'UNAUTHORIZED') return bad('Brak dostepu', 401);
  console.error(where, e);
  return bad('Blad serwera', 500);
}

// GET ?user_id=UUID — wyplaty freelancera (paid_on malejaco) + aktualne saldo
export async function GET(request: NextRequest) {
  try {
    const session = await requireAdmin();
    if (!session) return bad('Brak uprawnien', 403);

    const userId = request.nextUrl.searchParams.get('user_id') ?? '';
    if (!UUID_RE.test(userId)) return bad('Nieprawidlowe user_id');

    const [items, balance] = await Promise.all([
      sql.query(
        `SELECT id, amount::float8 AS amount, paid_on::text AS paid_on, note, created_at::text AS created_at
         FROM freelancer_payments
         WHERE user_id = $1::uuid
         ORDER BY paid_on DESC, created_at DESC`,
        [userId]
      ),
      fetchFreelancerBalance(userId),
    ]);

    return NextResponse.json({ ok: true, items, balance });
  } catch (e) {
    return handleError(e, '[GET /api/admin/freelancer-payments]');
  }
}

// POST { user_id, amount, paid_on, note? }
export async function POST(request: NextRequest) {
  try {
    const session = await requireAdmin();
    if (!session) return bad('Brak uprawnien', 403);

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) return bad('Nieprawidlowe body');

    const userId = typeof body.user_id === 'string' ? body.user_id : '';
    if (!UUID_RE.test(userId)) return bad('Nieprawidlowe user_id');

    // Kwota jako tekst (bez bledow float), max 2 miejsca po przecinku
    const rawAmount =
      typeof body.amount === 'number' && Number.isFinite(body.amount) ? String(body.amount) :
      typeof body.amount === 'string' ? body.amount.trim().replace(',', '.') :
      '';
    if (!AMOUNT_RE.test(rawAmount)) return bad('Kwota musi byc liczba z maks. 2 miejscami po przecinku');
    const amountNum = Number(rawAmount);
    if (amountNum === 0) return bad('Kwota nie moze byc rowna 0');
    if (Math.abs(amountNum) > MAX_ABS_AMOUNT) return bad('Kwota poza zakresem (maks. 10 000 000 zl)');

    const paidOn = typeof body.paid_on === 'string' ? body.paid_on : '';
    if (!isValidCalendarDate(paidOn)) return bad('Nieprawidlowa data (oczekiwany format RRRR-MM-DD)');

    let note: string | null = null;
    if (body.note !== undefined && body.note !== null) {
      if (typeof body.note !== 'string') return bad('Nieprawidlowa notatka');
      const trimmed = body.note.trim();
      if (trimmed.length > MAX_NOTE) return bad(`Notatka moze miec maks. ${MAX_NOTE} znakow`);
      note = trimmed === '' ? null : trimmed;
    }

    const checkRows = (await sql.query(
      `SELECT
         (SELECT is_external FROM users WHERE id = $1::uuid) AS is_external,
         ($2::date > ${TODAY_WARSAW_SQL}) AS is_future`,
      [userId, paidOn]
    )) as { is_external: boolean | null; is_future: boolean }[];
    const check = checkRows[0];
    if (!check || check.is_external === null) return bad('Uzytkownik nie istnieje', 404);
    if (!check.is_external) return bad('Uzytkownik nie jest freelancerem');
    if (check.is_future) return bad('Data nie moze byc z przyszlosci');

    await sql.query(
      `INSERT INTO freelancer_payments (user_id, amount, paid_on, note, created_by)
       VALUES ($1::uuid, $2::numeric, $3::date, $4, $5::uuid)`,
      [userId, rawAmount, paidOn, note, session.sub]
    );

    return NextResponse.json({ ok: true });
  } catch (e) {
    return handleError(e, '[POST /api/admin/freelancer-payments]');
  }
}
