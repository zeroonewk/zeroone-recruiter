import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth';
import { applyShift } from '@/lib/przesun-terminy';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: NextRequest) {
  try {
    const session = await requireSession();
    if (session.role !== 'admin') {
      return NextResponse.json({ ok: false, error: 'Brak uprawnien' }, { status: 403 });
    }

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) {
      return NextResponse.json({ ok: false, error: 'Nieprawidlowe body' }, { status: 400 });
    }

    const raw = body.project_ids ?? [];
    if (!Array.isArray(raw) || raw.some((id) => typeof id !== 'string' || !UUID_RE.test(id))) {
      return NextResponse.json({ ok: false, error: 'Nieprawidlowe project_ids' }, { status: 400 });
    }
    const ids = Array.from(new Set(raw as string[]));

    // Puste = wszystkie projekty z podgladu (przeliczane na serwerze).
    const { projects, stages } = await applyShift(ids.length > 0 ? ids : null);

    return NextResponse.json({ ok: true, projects, stages });
  } catch (e) {
    if (e instanceof Error && e.message === 'UNAUTHORIZED') {
      return NextResponse.json({ ok: false, error: 'Brak dostepu' }, { status: 401 });
    }
    console.error('[POST /api/admin/przesun-terminy/zatwierdz]', e);
    return NextResponse.json({ ok: false, error: 'Blad serwera' }, { status: 500 });
  }
}
