import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { requireSession } from '@/lib/auth';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: RouteContext) {
  try {
    const session = await requireSession();
    const { id } = await params;

    if (!UUID_RE.test(id)) {
      return NextResponse.json({ ok: false, error: 'Nieprawidlowe id' }, { status: 400 });
    }

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) {
      return NextResponse.json({ ok: false, error: 'Nieprawidlowe body' }, { status: 400 });
    }

    const { status_id, closed_at, allocations } = body;

    if (typeof status_id !== 'string' || !UUID_RE.test(status_id)) {
      return NextResponse.json({ ok: false, error: 'Nieprawidlowe status_id' }, { status: 400 });
    }

    if (typeof closed_at !== 'string' || !DATE_RE.test(closed_at)) {
      return NextResponse.json({ ok: false, error: 'Nieprawidlowa data zamkniecia' }, { status: 400 });
    }

    if (!Array.isArray(allocations) || allocations.length === 0) {
      return NextResponse.json({ ok: false, error: 'Brak alokacji punktow' }, { status: 400 });
    }

    if (allocations.length > 20) {
      return NextResponse.json({ ok: false, error: 'Maksymalnie 20 alokacji' }, { status: 400 });
    }

    const seenUserIds = new Set<string>();
    const parsed: { user_id: string; points: number }[] = [];

    for (const a of allocations) {
      const user_id = typeof a?.user_id === 'string' ? a.user_id.trim() : '';
      if (!UUID_RE.test(user_id)) {
        return NextResponse.json(
          { ok: false, error: 'Nieprawidlowe user_id w alokacji' },
          { status: 400 }
        );
      }
      if (seenUserIds.has(user_id)) {
        return NextResponse.json(
          { ok: false, error: 'Duplikat user_id w alokacjach' },
          { status: 400 }
        );
      }
      seenUserIds.add(user_id);
      const points = Number(a?.points);
      if (!Number.isInteger(points) || points < 1) {
        return NextResponse.json(
          { ok: false, error: 'Punkty alokacji musza byc dodatnia liczba calkowita' },
          { status: 400 }
        );
      }
      parsed.push({ user_id, points });
    }

    const userIds = parsed.map((a) => a.user_id);

    const [projectRows, statusRows, userCountRows] = await Promise.all([
      sql`SELECT points, owner_id FROM projects WHERE id = ${id}::uuid LIMIT 1`,
      sql`SELECT is_success FROM result_statuses WHERE id = ${status_id}::uuid LIMIT 1`,
      sql.query(
        `SELECT COUNT(*)::int AS cnt FROM users WHERE id = ANY($1::uuid[]) AND is_active = TRUE`,
        [userIds]
      ),
    ]);

    const project = (projectRows as { points: number; owner_id: string }[])[0];
    if (!project) {
      return NextResponse.json({ ok: false, error: 'Projekt nie istnieje' }, { status: 404 });
    }

    const status = (statusRows as { is_success: boolean }[])[0];
    if (!status) {
      return NextResponse.json({ ok: false, error: 'Status nie istnieje' }, { status: 404 });
    }
    if (!status.is_success) {
      return NextResponse.json(
        { ok: false, error: 'Wybrany status nie jest statusem sukcesu' },
        { status: 400 }
      );
    }

    if (session.role !== 'admin' && session.sub !== project.owner_id) {
      return NextResponse.json({ ok: false, error: 'Brak uprawnien' }, { status: 403 });
    }

    const activeCount = ((userCountRows as { cnt: number }[])[0]?.cnt ?? 0);
    if (activeCount !== parsed.length) {
      return NextResponse.json(
        { ok: false, error: 'Niektorzy uzytkownicy nie sa aktywni lub nie istnieja' },
        { status: 400 }
      );
    }

    const totalPoints = parsed.reduce((acc, a) => acc + a.points, 0);
    if (totalPoints !== project.points) {
      return NextResponse.json(
        {
          ok: false,
          error: `Suma punktow alokacji (${totalPoints}) musi rownic sie puli projektu (${project.points})`,
        },
        { status: 400 }
      );
    }

    const allocJson = JSON.stringify(parsed);

    await sql.query(
      `UPDATE projects SET status_id = $1::uuid, closed_at = $2::date, updated_at = NOW() WHERE id = $3::uuid`,
      [status_id, closed_at, id]
    );

    await sql.query(
      `DELETE FROM project_point_allocations WHERE project_id = $1::uuid`,
      [id]
    );

    await sql.query(
      `INSERT INTO project_point_allocations (project_id, user_id, points)
       SELECT $1::uuid, (r->>'user_id')::uuid, (r->>'points')::int
       FROM jsonb_array_elements($2::jsonb) AS r`,
      [id, allocJson]
    );

    await sql.query(
      `INSERT INTO point_transactions (project_id, user_id, points, reason)
       SELECT $1::uuid, (r->>'user_id')::uuid, (r->>'points')::int, 'project_closed_success'
       FROM jsonb_array_elements($2::jsonb) AS r`,
      [id, allocJson]
    );

    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof Error && e.message === 'UNAUTHORIZED') {
      return NextResponse.json({ ok: false, error: 'Brak dostepu' }, { status: 401 });
    }
    console.error('[POST /api/projekty/[id]/zamknij]', e);
    return NextResponse.json({ ok: false, error: 'Blad serwera' }, { status: 500 });
  }
}
