import { NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth';
import { computeShiftPreview } from '@/lib/przesun-terminy';

export async function GET() {
  try {
    const session = await requireSession();
    if (session.role !== 'admin') {
      return NextResponse.json({ ok: false, error: 'Brak uprawnien' }, { status: 403 });
    }

    const projects = await computeShiftPreview();
    return NextResponse.json({ ok: true, projects });
  } catch (e) {
    if (e instanceof Error && e.message === 'UNAUTHORIZED') {
      return NextResponse.json({ ok: false, error: 'Brak dostepu' }, { status: 401 });
    }
    console.error('[GET /api/admin/przesun-terminy/podglad]', e);
    return NextResponse.json({ ok: false, error: 'Blad serwera' }, { status: 500 });
  }
}
