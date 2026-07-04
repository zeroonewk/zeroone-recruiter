import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { requireSession } from '@/lib/auth';
import { toDateString } from '@/lib/dates';

// ── GET ───────────────────────────────────────────────────────────────────────

export type ProjectListItem = {
  id: string;
  title: string;
  points: number;
  opened_at: string;
  closed_at: string | null;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
  client_id: string;
  client_name: string;
  client_priority: number;
  type_id: string;
  type_name: string;
  type_priority: number;
  priority_score: number;
  owner_id: string;
  owner_name: string;
  owner_email: string;
  status_id: string;
  status_name: string;
  status_color: string;
  status_is_success: boolean;
  current_stage_name: string | null;
  current_stage_deadline: string | null;
  current_stage_position: number | null;
  is_overdue: boolean;
  has_freelancers: boolean;
};

export async function GET(request: NextRequest) {
  try {
    await requireSession();
    const archived = request.nextUrl.searchParams.get('archived') === 'true';

    const rows = (await sql`
      SELECT
        p.id, p.title, p.points, p.opened_at, p.closed_at, p.is_archived,
        p.created_at, p.updated_at,
        c.id AS client_id, c.name AS client_name, c.priority_class AS client_priority,
        pt.id AS type_id, pt.name AS type_name, pt.priority_class AS type_priority,
        (c.priority_class * pt.priority_class) AS priority_score,
        u.id AS owner_id, u.name AS owner_name, u.email AS owner_email,
        rs.id AS status_id, rs.name AS status_name, rs.color AS status_color,
        rs.is_success AS status_is_success,
        cur_stage.name AS current_stage_name,
        cur_stage.deadline AS current_stage_deadline,
        cur_stage.position AS current_stage_position,
        COALESCE(cur_stage.is_overdue, false) AS is_overdue,
        EXISTS(SELECT 1 FROM project_freelancers pf WHERE pf.project_id = p.id) AS has_freelancers
      FROM projects p
      JOIN clients c ON c.id = p.client_id
      JOIN project_types pt ON pt.id = p.project_type_id
      JOIN users u ON u.id = p.owner_id
      JOIN result_statuses rs ON rs.id = p.status_id
      LEFT JOIN LATERAL (
        SELECT ps.id, ps.name, ps.position, ps.deadline,
               (ps.deadline < CURRENT_DATE) AS is_overdue
        FROM project_stages ps
        WHERE ps.project_id = p.id AND ps.done_at IS NULL
          AND p.closed_at IS NULL
          AND rs.is_success = FALSE
        ORDER BY
          (ps.deadline < CURRENT_DATE) DESC,
          ps.deadline ASC
        LIMIT 1
      ) cur_stage ON true
      WHERE (${archived} = TRUE OR p.is_archived = FALSE)
      ORDER BY rs.is_success ASC, p.is_archived ASC, p.opened_at DESC
    `) as Record<string, unknown>[];

    const items: ProjectListItem[] = rows.map((r) => ({
      id: r.id as string,
      title: r.title as string,
      points: r.points as number,
      opened_at: toDateString(r.opened_at) ?? '',
      closed_at: toDateString(r.closed_at),
      is_archived: r.is_archived as boolean,
      created_at: toDateString(r.created_at) ?? '',
      updated_at: toDateString(r.updated_at) ?? '',
      client_id: r.client_id as string,
      client_name: r.client_name as string,
      client_priority: r.client_priority as number,
      type_id: r.type_id as string,
      type_name: r.type_name as string,
      type_priority: r.type_priority as number,
      priority_score: r.priority_score as number,
      owner_id: r.owner_id as string,
      owner_name: r.owner_name as string,
      owner_email: r.owner_email as string,
      status_id: r.status_id as string,
      status_name: r.status_name as string,
      status_color: r.status_color as string,
      status_is_success: r.status_is_success as boolean,
      current_stage_name: (r.current_stage_name as string | null) ?? null,
      current_stage_deadline: toDateString(r.current_stage_deadline),
      current_stage_position: (r.current_stage_position as number | null) ?? null,
      is_overdue: r.is_overdue as boolean,
      has_freelancers: r.has_freelancers as boolean,
    }));

    return NextResponse.json({ ok: true, items });
  } catch (e) {
    if (e instanceof Error && e.message === 'UNAUTHORIZED') {
      return NextResponse.json({ ok: false, error: 'Brak dostepu' }, { status: 401 });
    }
    return NextResponse.json({ ok: false, error: 'Blad serwera' }, { status: 500 });
  }
}

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
    if (!Number.isInteger(points) || points < 0 || points > 25) {
      return NextResponse.json(
        { ok: false, error: 'Punkty musza byc liczba calkowita od 0 do 25' },
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

    const rawFreelancerIds = Array.isArray(body.freelancer_ids) ? body.freelancer_ids : [];
    const freelancerIds: string[] = [];
    for (const fid of rawFreelancerIds) {
      if (typeof fid !== 'string' || !UUID_RE.test(fid)) {
        return NextResponse.json(
          { ok: false, error: 'Nieprawidlowe UUID w freelancer_ids' },
          { status: 400 }
        );
      }
      freelancerIds.push(fid);
    }

    const rawRates = body.freelancer_rates;
    let freelancerRates = { cv_rate: 1, meeting_rate: 5, project_value: null as number | null };
    if (rawRates != null) {
      if (typeof rawRates !== 'object' || Array.isArray(rawRates)) {
        return NextResponse.json({ ok: false, error: 'Nieprawidlowe freelancer_rates' }, { status: 400 });
      }
      const r = rawRates as Record<string, unknown>;
      const cv_rate = Number(r.cv_rate);
      const meeting_rate = Number(r.meeting_rate);
      if (!Number.isInteger(cv_rate) || cv_rate < 0) {
        return NextResponse.json({ ok: false, error: 'cv_rate musi byc nieujemna liczba calkowita' }, { status: 400 });
      }
      if (!Number.isInteger(meeting_rate) || meeting_rate < 0) {
        return NextResponse.json({ ok: false, error: 'meeting_rate musi byc nieujemna liczba calkowita' }, { status: 400 });
      }
      const project_value = r.project_value == null ? null : Number(r.project_value);
      if (project_value !== null && (!Number.isInteger(project_value) || project_value < 0)) {
        return NextResponse.json({ ok: false, error: 'project_value musi byc nieujemna liczba calkowita lub null' }, { status: 400 });
      }
      freelancerRates = { cv_rate, meeting_rate, project_value };
    }

    const rawDisableStages = Boolean(body.disable_stages);

    const rawStages = Array.isArray(body.stages) ? body.stages : [];
    if (!rawDisableStages && rawStages.length === 0) {
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
      INSERT INTO projects (title, client_id, project_type_id, owner_id, status_id, points, links, notes, opened_at, freelancer_rates, disable_stages)
      VALUES (
        ${title},
        ${client_id}::uuid,
        ${project_type_id}::uuid,
        ${owner_id}::uuid,
        ${status_id}::uuid,
        ${points},
        ${JSON.stringify(links)}::jsonb,
        ${notes},
        ${opened_at}::date,
        ${JSON.stringify(freelancerRates)}::jsonb,
        ${rawDisableStages}
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
    if (points > 0) {
      await sql`
        INSERT INTO project_point_allocations (project_id, user_id, points)
        VALUES (${projectId}::uuid, ${owner_id}::uuid, ${points})
      `;
    }

    // ── Insert freelancer assignments ──────────────────────────────────────
    if (freelancerIds.length > 0) {
      await sql`
        INSERT INTO project_freelancers (project_id, user_id)
        SELECT ${projectId}::uuid, unnest(${freelancerIds}::uuid[])
      `;
    }

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
