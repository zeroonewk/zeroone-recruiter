import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { requireSession } from '@/lib/auth';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const URL_RE = /^https?:\/\//;

type RouteContext = { params: Promise<{ id: string }> };

async function assertFreelancerAccess(projectId: string, userId: string): Promise<boolean> {
  const rows = (await sql`
    SELECT 1 FROM project_freelancers
    WHERE project_id = ${projectId}::uuid AND user_id = ${userId}::uuid
    LIMIT 1
  `) as unknown[];
  return rows.length > 0;
}

export async function GET(_req: NextRequest, { params }: RouteContext) {
  try {
    const session = await requireSession();
    const { id } = await params;

    if (!UUID_RE.test(id)) {
      return NextResponse.json({ ok: false, error: 'Nieprawidlowe id' }, { status: 400 });
    }

    const hasAccess = await assertFreelancerAccess(id, session.sub);
    if (!hasAccess) {
      return NextResponse.json({ ok: false, error: 'Brak dostepu' }, { status: 403 });
    }

    const rows = (await sql`
      SELECT id, full_name, cv_url, status
      FROM freelancer_candidates
      WHERE project_id = ${id}::uuid AND user_id = ${session.sub}::uuid
      ORDER BY created_at ASC
    `) as { id: string; full_name: string; cv_url: string; status: string }[];

    return NextResponse.json({ ok: true, items: rows });
  } catch (e) {
    if (e instanceof Error && e.message === 'UNAUTHORIZED') {
      return NextResponse.json({ ok: false, error: 'Brak dostepu' }, { status: 401 });
    }
    return NextResponse.json({ ok: false, error: 'Blad serwera' }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  try {
    const session = await requireSession();
    const { id } = await params;

    if (!UUID_RE.test(id)) {
      return NextResponse.json({ ok: false, error: 'Nieprawidlowe id' }, { status: 400 });
    }

    const hasAccess = await assertFreelancerAccess(id, session.sub);
    if (!hasAccess) {
      return NextResponse.json({ ok: false, error: 'Brak dostepu' }, { status: 403 });
    }

    const ACTIVE_STATUS_ID = 'dd43a0a8-cd05-4b27-ac43-d9fcbd563cbf';

    const projectRows = (await sql`
      SELECT closed_at, status_id FROM projects WHERE id = ${id}::uuid LIMIT 1
    `) as { closed_at: string | null; status_id: string }[];

    if (!projectRows[0]) {
      return NextResponse.json({ ok: false, error: 'Projekt nie istnieje' }, { status: 404 });
    }
    if (projectRows[0].closed_at !== null || projectRows[0].status_id !== ACTIVE_STATUS_ID) {
      return NextResponse.json({ ok: false, error: 'Projekt nie jest aktywny' }, { status: 400 });
    }

    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    if (!body) {
      return NextResponse.json({ ok: false, error: 'Nieprawidlowe body' }, { status: 400 });
    }

    const full_name = typeof body.full_name === 'string' ? body.full_name.trim() : '';
    if (full_name.length < 2 || full_name.length > 200) {
      return NextResponse.json(
        { ok: false, error: 'Imie i nazwisko musi miec od 2 do 200 znakow' },
        { status: 400 }
      );
    }

    const cv_url = typeof body.cv_url === 'string' ? body.cv_url.trim() : '';
    if (!URL_RE.test(cv_url)) {
      return NextResponse.json(
        { ok: false, error: 'URL CV musi zaczynac sie od http:// lub https://' },
        { status: 400 }
      );
    }

    const inserted = (await sql`
      INSERT INTO freelancer_candidates (project_id, user_id, full_name, cv_url, status)
      VALUES (${id}::uuid, ${session.sub}::uuid, ${full_name}, ${cv_url}, 'submitted')
      RETURNING id, full_name, cv_url, status
    `) as { id: string; full_name: string; cv_url: string; status: string }[];

    return NextResponse.json({ ok: true, item: inserted[0] }, { status: 201 });
  } catch (e) {
    if (e instanceof Error && e.message === 'UNAUTHORIZED') {
      return NextResponse.json({ ok: false, error: 'Brak dostepu' }, { status: 401 });
    }
    return NextResponse.json({ ok: false, error: 'Blad serwera' }, { status: 500 });
  }
}
