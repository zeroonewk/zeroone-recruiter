import { NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth';
import { computeTasks } from '@/lib/zadania';

export type { Task } from '@/lib/zadania';

export async function GET() {
  try {
    await requireSession();
    const tasks = await computeTasks();
    return NextResponse.json({ ok: true, tasks });
  } catch (e) {
    if (e instanceof Error && e.message === 'UNAUTHORIZED') {
      return NextResponse.json({ ok: false, error: 'Brak dostepu' }, { status: 401 });
    }
    console.error('[GET /api/zadania]', e);
    return NextResponse.json({ ok: false, error: 'Blad serwera' }, { status: 500 });
  }
}
