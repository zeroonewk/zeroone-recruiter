import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { requireSession } from '@/lib/auth';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const URL_RE = /^https?:\/\//;

type LinkInput = { label: string; url: string };
type StageInput = { name: string; position: number; deadline: string };

type ProjectRow = {
  id: string;
  title: string;
  client_id: string;
  project_type_id: string;
  owner_id: string;
  status_id: string;
  points: number;
  links: LinkInput[];
  notes: string | null;
  opened_at: string;
  closed_at: string | null;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
};

export async function POST(request: NextRequest) {
  let projectId: string | null = null;

  try {
    await requireSession();

    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    if (!body) {
      return NextResponse.json({ ok: false, error: 'Nieprawidlowe body' }, { status: 400 });
    }

    // ── Validate ───────────────────────────────────────────────────────────
    const title = typeof body.title === 'string' ? body.title.trim() : '';
    if (title.length < 2 || title.length > 200) {
      return NextResponse.json(
        { ok: false, error: 'Tytul musi miec od 2 do 200 znakow' },
        { status: 400 }
      );
    }

    for (const field of ['client_id', 'project_type_id', 'owner_id', 'status_id'] as const) {
      if (typeof body[field] !== 'string' || !UUID_RE.test(body[field] as string)) {
        return NextResponse.json(
          { ok: false, error: `Nieprawidlowe ${field}` },
          { status: 400 }
        );
      }
    }
    const client_id = body.client_id as string;
    const project_type_id = body.project_type_id as string;
    const owner_id = body.owner_id as string;
    const status_id = body.status_id as string;

    const points = Number(body.points);
    if (!Number.isInteger(points) || points < 1 || points > 25) {
      return NextResponse.json(
        { ok: false, error: 'Punkty musza byc liczba calkowita od 1 do 25' },
        { status: 400 }
      );
    }

    const opened_at = typeof body.opened_at === 'string' ? body.opened_at : '';
    if (!DATE_RE.test(opened_at)) {
      return NextResponse.json(
        { ok: false, error: 'Nieprawidlowa data otwarcia (format YYYY-MM-DD)' },
        { status: 400 }
      );
    }

    const notes = body.notes != null
      ? (typeof body.notes === 'string' ? body.notes.trim() : null)
      : null;
    if (notes !== null && notes.length > 5000) {
      return NextResponse.json(
        { ok: false, error: 'Notatki nie moga przekraczac 5000 znakow' },
        { status: 400 }
      );
    }

    const rawLinks = Array.isArray(body.links) ? body.links : [];
    if (rawLinks.length > 20) {
      return NextResponse.json(
        { ok: false, error: 'Maksymalnie 20 linkow' },
        { status: 400 }
      );
    }
    const links: LinkInput[] = [];
    for (const l of rawLinks) {
      const label = typeof l?.label === 'string' ? l.label.trim() : '';
      const url = typeof l?.url === 'string' ? l.url.trim() : '';
      if (label.length < 1 || label.length > 100) {
        return NextResponse.json(
          { ok: false, error: 'Etykieta linku musi miec od 1 do 100 znakow' },
          { status: 400 }
        );
      }
      if (!URL_RE.test(url)) {
        return NextResponse.json(
          { ok: false, error: 'URL musi zaczynac sie od http:// lub https://' },
          { status: 400 }
        );
      }
      links.push({ label, url });
    }

    const rawStages = Array.isArray(body.stages) ? body.stages : [];
    if (rawStages.length === 0) {
      return NextResponse.json(
        { ok: false, error: 'Projekt musi miec przynajmniej jeden etap' },
        { status: 400 }
      );
    }
    const stages: StageInput[] = [];
    for (const s of rawStages) {
      const name = typeof s?.name === 'string' ? s.name.trim() : '';
      const position = Number(s?.position);
      const deadline = typeof s?.deadline === 'string' ? s.deadline : '';
      if (name.length < 2 || name.length > 100) {
        return NextResponse.json(
          { ok: false, error: 'Nazwa etapu musi miec od 2 do 100 znakow' },
          { status: 400 }
        );
      }
      if (!Number.isInteger(position) || position < 1) {
        return NextResponse.json(
          { ok: false, error: 'Nieprawidlowa pozycja etapu' },
          { status: 400 }
        );
      }
      if (!DATE_RE.test(deadline)) {
        return NextResponse.json(
          { ok: false, error: `Nieprawidlowa data deadline etapu "${name}"` },
          { status: 400 }
        );
      }
      stages.push({ name, position, deadline });
    }

    // ── Insert project ─────────────────────────────────────────────────────
    const projRows = (await sql`
      INSERT INTO projects (title, client_id, project_type_id, owner_id, status_id, points, links, notes, opened_at)
      VALUES (
        ${title},
        ${client_id}::uuid,
        ${project_type_id}::uuid,
        ${owner_id}::uuid,
        ${status_id}::uuid,
        ${points},
        ${JSON.stringify(links)}::jsonb,
        ${notes},
        ${opened_at}::date
      )
      RETURNING id, title, client_id, project_type_id, owner_id, status_id, points, links, notes, opened_at, closed_at, is_archived, created_at, updated_at
    `) as ProjectRow[];

    const project = projRows[0];
    projectId = project.id;

    // ── Bulk insert stages ────────────────────────────────────────────────
    await sql`
      INSERT INTO project_stages (project_id, name, position, deadline)
      SELECT
        ${projectId}::uuid,
        x.name,
        x.position::int,
        x.deadline::date
      FROM jsonb_to_recordset(${JSON.stringify(stages)}::jsonb)
        AS x(name text, position int, deadline text)
    `;

    // ── Insert initial point allocation ────────────────────────────────────
    await sql`
      INSERT INTO project_point_allocations (project_id, user_id, points)
      VALUES (${projectId}::uuid, ${owner_id}::uuid, ${points})
    `;

    return NextResponse.json({ ok: true, project_id: project.id }, { status: 201 });
  } catch (e) {
    if (e instanceof Error && e.message === 'UNAUTHORIZED') {
      return NextResponse.json({ ok: false, error: 'Brak dostepu' }, { status: 401 });
    }
    console.error('[POST /api/projekty]', e);
    if (projectId) {
      try {
        await sql`DELETE FROM projects WHERE id = ${projectId}::uuid`;
      } catch (cleanupErr) {
        console.error('[POST /api/projekty] cleanup failed', cleanupErr);
      }
    }
    return NextResponse.json({ ok: false, error: 'Blad serwera' }, { status: 500 });
  }
}
