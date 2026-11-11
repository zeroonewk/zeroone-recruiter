import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { requireSession } from '@/lib/auth';
import { loadAlertSettings, type AlertSettings } from '@/lib/alerts';

const FIELDS = ['stage_critical_days', 'prio1_critical_days', 'idle_critical_days'] as const;

function errorResponse(e: unknown, label: string) {
  if (e instanceof Error && e.message === 'UNAUTHORIZED') {
    return NextResponse.json({ ok: false, error: 'Brak dostepu' }, { status: 401 });
  }
  console.error(label, e);
  return NextResponse.json({ ok: false, error: 'Blad serwera' }, { status: 500 });
}

export async function GET() {
  try {
    const session = await requireSession();
    if (session.role !== 'admin') {
      return NextResponse.json({ ok: false, error: 'Brak uprawnien' }, { status: 403 });
    }
    const settings = await loadAlertSettings();
    return NextResponse.json({ ok: true, settings });
  } catch (e) {
    return errorResponse(e, '[GET /api/admin/progi-alertow]');
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const session = await requireSession();
    if (session.role !== 'admin') {
      return NextResponse.json({ ok: false, error: 'Brak uprawnien' }, { status: 403 });
    }

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) {
      return NextResponse.json({ ok: false, error: 'Nieprawidlowe body' }, { status: 400 });
    }

    const parsed = {} as AlertSettings;
    for (const field of FIELDS) {
      const v = body[field];
      if (typeof v !== 'number' || !Number.isInteger(v) || v < 1 || v > 365) {
        return NextResponse.json(
          { ok: false, error: `Pole ${field} musi byc liczba calkowita 1-365` },
          { status: 400 }
        );
      }
      parsed[field] = v;
    }

    const rows = (await sql`
      UPDATE alert_settings
      SET stage_critical_days = ${parsed.stage_critical_days},
          prio1_critical_days = ${parsed.prio1_critical_days},
          idle_critical_days = ${parsed.idle_critical_days},
          updated_at = NOW()
      WHERE id = 1
      RETURNING stage_critical_days, prio1_critical_days, idle_critical_days
    `) as AlertSettings[];

    if (!rows[0]) {
      return NextResponse.json({ ok: false, error: 'Brak wiersza ustawien' }, { status: 404 });
    }

    return NextResponse.json({ ok: true, settings: rows[0] });
  } catch (e) {
    return errorResponse(e, '[PATCH /api/admin/progi-alertow]');
  }
}
