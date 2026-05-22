import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { requireSession } from '@/lib/auth';
import { normalizeFunnel, FUNNEL_LEVELS, type FunnelData } from '@/lib/funnel';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const URL_RE = /^https?:\/\//;

type LinkInput = { label: string; url: string };

export type ProjectFull = {
  id: string;
  title: string;
  points: number;
  notes: string | null;
  links: LinkInput[];
  opened_at: string;
  closed_at: string | null;
  is_archived: boolean;
  funnel: FunnelData;
  client_id: string;
  client_name: string;
  type_id: string;
  type_name: string;
  owner_id: string;
  owner_name: string;
  owner_email: string;
  status_id: string;
  status_name: string;
  status_color: string;
  status_is_success: boolean;
};

export type ProjectStage = {
  id: string;
  name: string;
  position: number;
  deadline: string;
  done_at: string | null;
  notes: string | null;
};

type RouteContext = { params: Promise<{ id: string }> };

type ProjectFullRaw = Omit<ProjectFull, 'funnel'> & { funnel: unknown };

async function fetchProjectFull(id: string): Promise<ProjectFull | null> {
  const rows = (await sql`
    SELECT
      p.id, p.title, p.points, p.notes, p.links, p.opened_at, p.closed_at, p.is_archived,
      p.funnel,
      c.id AS client_id, c.name AS client_name,
      pt.id AS type_id, pt.name AS type_name,
      u.id AS owner_id, u.name AS owner_name, u.email AS owner_email,
      rs.id AS status_id, rs.name AS status_name, rs.color AS status_color,
      rs.is_success AS status_is_success
    FROM projects p
    JOIN clients c ON c.id = p.client_id
    JOIN project_types pt ON pt.id = p.project_type_id
    JOIN users u ON u.id = p.owner_id
    JOIN result_statuses rs ON rs.id = p.status_id
    WHERE p.id = ${id}::uuid
    LIMIT 1
  `) as ProjectFullRaw[];
  if (!rows[0]) return null;
  return { ...rows[0], funnel: normalizeFunnel(rows[0].funnel) };
}

export async function GET(_req: NextRequest, { params }: RouteContext) {
  try {
    await requireSession();
    const { id } = await params;

    if (!UUID_RE.test(id)) {
      return NextResponse.json({ ok: false, error: 'Nieprawidlowe id' }, { status: 400 });
    }

    const [project, stageRows] = await Promise.all([
      fetchProjectFull(id),
      sql`
        SELECT id, name, position, deadline, done_at, notes
        FROM project_stages
        WHERE project_id = ${id}::uuid
        ORDER BY position ASC
      `,
    ]);

    if (!project) {
      return NextResponse.json({ ok: false, error: 'Projekt nie istnieje' }, { status: 404 });
    }

    return NextResponse.json({ ok: true, project, stages: stageRows as ProjectStage[] });
  } catch (e) {
    if (e instanceof Error && e.message === 'UNAUTHORIZED') {
      return NextResponse.json({ ok: false, error: 'Brak dostepu' }, { status: 401 });
    }
    return NextResponse.json({ ok: false, error: 'Blad serwera' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
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

    const setClauses: string[] = [];
    const values: unknown[] = [];
    let i = 1;

    if ('title' in body) {
      const title = typeof body.title === 'string' ? body.title.trim() : '';
      if (title.length < 2 || title.length > 200) {
        return NextResponse.json(
          { ok: false, error: 'Tytul musi miec od 2 do 200 znakow' },
          { status: 400 }
        );
      }
      setClauses.push(`title = $${i++}`);
      values.push(title);
    }

    if ('notes' in body) {
      const notes =
        body.notes == null
          ? null
          : typeof body.notes === 'string'
          ? body.notes.trim()
          : null;
      if (notes !== null && notes.length > 5000) {
        return NextResponse.json(
          { ok: false, error: 'Notatki nie moga przekraczac 5000 znakow' },
          { status: 400 }
        );
      }
      setClauses.push(`notes = $${i++}`);
      values.push(notes);
    }

    if ('points' in body) {
      if (session.role !== 'admin') {
        return NextResponse.json(
          { ok: false, error: 'Tylko admin moze zmieniac punkty' },
          { status: 403 }
        );
      }
      const points = Number(body.points);
      if (!Number.isInteger(points) || points < 1 || points > 25) {
        return NextResponse.json(
          { ok: false, error: 'Punkty musza byc liczba calkowita od 1 do 25' },
          { status: 400 }
        );
      }
      setClauses.push(`points = $${i++}`);
      values.push(points);
    }

    if ('links' in body) {
      const rawLinks = Array.isArray(body.links) ? body.links : null;
      if (rawLinks === null) {
        return NextResponse.json({ ok: false, error: 'Nieprawidlowe linki' }, { status: 400 });
      }
      if (rawLinks.length > 20) {
        return NextResponse.json({ ok: false, error: 'Maksymalnie 20 linkow' }, { status: 400 });
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
      setClauses.push(`links = $${i++}::jsonb`);
      values.push(JSON.stringify(links));
    }

    if ('status_id' in body) {
      if (typeof body.status_id !== 'string' || !UUID_RE.test(body.status_id)) {
        return NextResponse.json(
          { ok: false, error: 'Nieprawidlowe status_id' },
          { status: 400 }
        );
      }
      setClauses.push(`status_id = $${i++}::uuid`);
      values.push(body.status_id);
    }

    if ('funnel' in body) {
      const rawFunnel = body.funnel;
      if (!rawFunnel || typeof rawFunnel !== 'object' || Array.isArray(rawFunnel)) {
        return NextResponse.json(
          { ok: false, error: 'Nieprawidlowe dane lejka' },
          { status: 400 }
        );
      }
      const fobj = rawFunnel as Record<string, unknown>;
      const funnelKeys = FUNNEL_LEVELS.map((l) => l.key);
      if (Object.keys(fobj).length !== 7 || !funnelKeys.every((k) => k in fobj)) {
        return NextResponse.json(
          { ok: false, error: 'Nieprawidlowe dane lejka' },
          { status: 400 }
        );
      }
      for (const k of funnelKeys) {
        const v = fobj[k];
        if (!Number.isInteger(v) || (v as number) < 0) {
          return NextResponse.json(
            { ok: false, error: 'Nieprawidlowe dane lejka' },
            { status: 400 }
          );
        }
      }
      const funnel = Object.fromEntries(
        funnelKeys.map((k) => [k, fobj[k] as number])
      ) as FunnelData;
      setClauses.push(`funnel = $${i++}::jsonb`);
      values.push(JSON.stringify(funnel));
    }

    if ('is_archived' in body) {
      const is_archived = Boolean(body.is_archived);
      if (is_archived && session.role !== 'admin') {
        const ownerRows = (await sql`
          SELECT owner_id FROM projects WHERE id = ${id}::uuid
        `) as { owner_id: string }[];
        if (!ownerRows || ownerRows.length === 0) {
          return NextResponse.json({ ok: false, error: 'Projekt nie istnieje' }, { status: 404 });
        }
        if (session.sub !== ownerRows[0].owner_id) {
          return NextResponse.json(
            { ok: false, error: 'Tylko admin lub owner moze archiwizowac' },
            { status: 403 }
          );
        }
      }
      setClauses.push(`is_archived = $${i++}`);
      values.push(is_archived);
    }

    if (setClauses.length === 0) {
      return NextResponse.json({ ok: false, error: 'Brak pol do aktualizacji' }, { status: 400 });
    }

    values.push(id);
    const queryStr = `
      UPDATE projects
      SET ${setClauses.join(', ')}, updated_at = NOW()
      WHERE id = $${i}::uuid
      RETURNING id
    `;
    const updated = (await sql.query(queryStr, values)) as { id: string }[];

    if (!updated || updated.length === 0) {
      return NextResponse.json({ ok: false, error: 'Projekt nie istnieje' }, { status: 404 });
    }

    const project = await fetchProjectFull(id);
    return NextResponse.json({ ok: true, project });
  } catch (e) {
    if (e instanceof Error && e.message === 'UNAUTHORIZED') {
      return NextResponse.json({ ok: false, error: 'Brak dostepu' }, { status: 401 });
    }
    console.error('[PATCH /api/projekty/[id]]', e);
    return NextResponse.json({ ok: false, error: 'Blad serwera' }, { status: 500 });
  }
}
