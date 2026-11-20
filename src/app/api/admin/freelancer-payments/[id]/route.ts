import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { requireSession } from '@/lib/auth';

export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type RouteContext = { params: Promise<{ id: string }> };

// DELETE — usuwa wpis wyplaty (tylko admin)
export async function DELETE(_req: NextRequest, { params }: RouteContext) {
  try {
    const session = await requireSession();
    if (session.role !== 'admin') {
      return NextResponse.json({ ok: false, error: 'Brak uprawnien' }, { status: 403 });
    }

    const { id } = await params;
    if (!UUID_RE.test(id)) {
      return NextResponse.json({ ok: false, error: 'Nieprawidlowe id' }, { status: 400 });
    }

    const rows = (await sql.query(
      `DELETE FROM freelancer_payments WHERE id = $1::uuid RETURNING id`,
      [id]
    )) as { id: string }[];
    if (!rows[0]) {
      return NextResponse.json({ ok: false, error: 'Wpis nie istnieje' }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof Error && e.message === 'UNAUTHORIZED') {
      return NextResponse.json({ ok: false, error: 'Brak dostepu' }, { status: 401 });
    }
    console.error('[DELETE /api/admin/freelancer-payments/[id]]', e);
    return NextResponse.json({ ok: false, error: 'Blad serwera' }, { status: 500 });
  }
}
