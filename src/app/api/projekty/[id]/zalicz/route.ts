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

    const { allocations, awarded_at } = body;

    if (typeof awarded_at !== 'string' || !DATE_RE.test(awarded_at)) {
      return NextResponse.json({ ok: false, error: 'Nieprawidlowa data' }, { status: 400 });
    }

    if (!Array.isArray(allocations)) {
      return NextResponse.json({ ok: false, error: 'Nieprawidlowe allocations' }, { status: 400 });
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

    const projectRows = (await sql`
      SELECT p.points, p.owner_id, p.closed_at, p.vacancies, p.filled_vacancies,
             (rs.is_success = FALSE AND rs.name ILIKE '%aktywny%') AS is_aktywny
      FROM projects p
      JOIN result_statuses rs ON rs.id = p.status_id
      WHERE p.id = ${id}::uuid
      LIMIT 1
    `) as {
      points: number;
      owner_id: string;
      closed_at: string | null;
      vacancies: number;
      filled_vacancies: number;
      is_aktywny: boolean;
    }[];

    const project = projectRows[0];
    if (!project) {
      return NextResponse.json({ ok: false, error: 'Projekt nie istnieje' }, { status: 404 });
    }

    if (session.role !== 'admin' && session.sub !== project.owner_id) {
      return NextResponse.json({ ok: false, error: 'Brak uprawnien' }, { status: 403 });
    }

    if (project.closed_at !== null) {
      return NextResponse.json({ ok: false, error: 'Projekt jest zamkniety' }, { status: 400 });
    }
    if (!project.is_aktywny) {
      return NextResponse.json({ ok: false, error: 'Projekt musi miec status Aktywny' }, { status: 400 });
    }
    if (project.vacancies <= 1) {
      return NextResponse.json({ ok: false, error: 'Projekt nie ma wielu wakatow' }, { status: 400 });
    }
    if (project.filled_vacancies >= project.vacancies) {
      return NextResponse.json(
        { ok: false, error: 'Wszystkie wakaty zostaly juz obsadzone' },
        { status: 400 }
      );
    }

    if (project.points === 0 && parsed.length > 0) {
      return NextResponse.json(
        { ok: false, error: 'Projekt z 0 punktami nie wymaga alokacji' },
        { status: 400 }
      );
    }

    if (project.points > 0) {
      if (parsed.length === 0) {
        return NextResponse.json({ ok: false, error: 'Brak alokacji punktow' }, { status: 400 });
      }
      const userIds = parsed.map((a) => a.user_id);
      const userCountRows = (await sql.query(
        `SELECT COUNT(*)::int AS cnt FROM users WHERE id = ANY($1::uuid[]) AND is_active = TRUE`,
        [userIds]
      )) as { cnt: number }[];
      const activeCount = userCountRows[0]?.cnt ?? 0;
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
    }

    const updateQuery = sql.query(
      `UPDATE projects SET filled_vacancies = filled_vacancies + 1, updated_at = NOW()
       WHERE id = $1::uuid AND filled_vacancies < vacancies
       RETURNING filled_vacancies, vacancies`,
      [id]
    );

    const queries =
      project.points > 0
        ? [
            sql.query(
              `INSERT INTO point_transactions (project_id, user_id, points, awarded_at, reason)
               SELECT $1::uuid, (r->>'user_id')::uuid, (r->>'points')::int, $2::date, 'vacancy_filled'
               FROM jsonb_array_elements($3::jsonb) AS r`,
              [id, awarded_at, JSON.stringify(parsed)]
            ),
            updateQuery,
          ]
        : [updateQuery];

    const results = await sql.transaction(queries);
    const updateResult = results[results.length - 1] as { filled_vacancies: number; vacancies: number }[];

    if (!updateResult || updateResult.length === 0) {
      return NextResponse.json(
        { ok: false, error: 'Wszystkie wakaty zostaly juz obsadzone' },
        { status: 400 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof Error && e.message === 'UNAUTHORIZED') {
      return NextResponse.json({ ok: false, error: 'Brak dostepu' }, { status: 401 });
    }
    console.error('[POST /api/projekty/[id]/zalicz]', e);
    return NextResponse.json({ ok: false, error: 'Blad serwera' }, { status: 500 });
  }
}
