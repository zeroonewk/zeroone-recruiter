import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { requireSession } from '@/lib/auth';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const VALID_STATUSES = ['submitted', 'stage1', 'stage2', 'selected'] as const;
type CandidateStatus = (typeof VALID_STATUSES)[number];

// Kolumna z data osiagniecia danego etapu (stala lista — bezpieczne do wstawienia w SQL).
const STAGE_DATE_COLUMN: Record<Exclude<CandidateStatus, 'submitted'>, string> = {
  stage1: 'stage1_at',
  stage2: 'stage2_at',
  selected: 'selected_at',
};

// "Dzis" liczone w strefie czasowej firmy, zeby zgadzalo sie z data w UI.
const TODAY_SQL = `(now() AT TIME ZONE 'Europe/Warsaw')::date`;

type RouteContext = { params: Promise<{ id: string }> };

type CandidateItem = {
  id: string;
  full_name: string;
  cv_url: string;
  status: CandidateStatus;
  project_id: string;
  user_id: string;
  stage1_at: string | null;
  stage2_at: string | null;
  selected_at: string | null;
};

const RETURNING = `RETURNING id, full_name, cv_url, status, project_id, user_id,
  stage1_at::text AS stage1_at, stage2_at::text AS stage2_at, selected_at::text AS selected_at`;

function isValidCalendarDate(s: string): boolean {
  if (!DATE_RE.test(s)) return false;
  const d = new Date(s + 'T00:00:00Z');
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

function bad(error: string, status = 400) {
  return NextResponse.json({ ok: false, error }, { status });
}

// Body: { status?: CandidateStatus, date?: 'YYYY-MM-DD' }
// - status o jeden krok w przod: ustawia date etapu docelowego (date lub dzis)
// - status o jeden krok w tyl: czysci date etapu, z ktorego sie cofamy
// - samo date (bez zmiany statusu): poprawia date aktualnego etapu
export async function PATCH(request: NextRequest, { params }: RouteContext) {
  try {
    const session = await requireSession();

    const { id } = await params;
    if (!UUID_RE.test(id)) return bad('Nieprawidlowe id');

    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    if (!body) return bad('Nieprawidlowe body');

    const hasStatus = body.status !== undefined && body.status !== null;
    const hasDate = body.date !== undefined && body.date !== null && body.date !== '';

    if (hasStatus && !VALID_STATUSES.includes(body.status as CandidateStatus)) {
      return bad('Nieprawidlowy status. Dozwolone: submitted, stage1, stage2, selected');
    }
    if (hasDate && (typeof body.date !== 'string' || !isValidCalendarDate(body.date))) {
      return bad('Nieprawidlowa data (oczekiwany format RRRR-MM-DD)');
    }
    if (!hasStatus && !hasDate) return bad('Brak statusu lub daty');

    const date = hasDate ? (body.date as string) : null;

    const currentRows = (await sql.query(
      `SELECT fc.status, p.owner_id,
              ($2::date > ${TODAY_SQL}) AS is_future
       FROM freelancer_candidates fc
       JOIN projects p ON p.id = fc.project_id
       WHERE fc.id = $1::uuid`,
      [id, date]
    )) as { status: CandidateStatus; owner_id: string; is_future: boolean | null }[];

    const current = currentRows[0];
    if (!current) return bad('Kandydat nie istnieje', 404);

    if (session.role !== 'admin' && session.sub !== current.owner_id) {
      return bad('Brak uprawnien', 403);
    }
    if (current.is_future) return bad('Data nie moze byc z przyszlosci');

    const newStatus = hasStatus ? (body.status as CandidateStatus) : current.status;

    let rows: CandidateItem[];

    if (newStatus === current.status) {
      // Tryb samej daty: korekta daty aktualnego etapu
      if (!date) return bad('Brak zmiany statusu i brak daty');
      if (current.status === 'submitted') {
        return bad('Kandydat nie ma jeszcze zaliczonego etapu - brak daty do poprawienia');
      }
      const col = STAGE_DATE_COLUMN[current.status];
      rows = (await sql.query(
        `UPDATE freelancer_candidates SET ${col} = $2::date
         WHERE id = $1::uuid AND status = $3
         ${RETURNING}`,
        [id, date, current.status]
      )) as CandidateItem[];
    } else {
      const currentIdx = VALID_STATUSES.indexOf(current.status);
      const newIdx = VALID_STATUSES.indexOf(newStatus);
      if (Math.abs(newIdx - currentIdx) !== 1) {
        return bad('Dozwolone tylko przejscie o jeden krok w przod lub w tyl');
      }

      if (newIdx > currentIdx) {
        // W przod: data etapu docelowego (podana lub dzis)
        const col = STAGE_DATE_COLUMN[newStatus as Exclude<CandidateStatus, 'submitted'>];
        rows = (await sql.query(
          `UPDATE freelancer_candidates
           SET status = $2, ${col} = COALESCE($3::date, ${TODAY_SQL})
           WHERE id = $1::uuid AND status = $4
           ${RETURNING}`,
          [id, newStatus, date, current.status]
        )) as CandidateItem[];
      } else {
        // W tyl: czyscimy date etapu, z ktorego sie cofamy
        const col = STAGE_DATE_COLUMN[current.status as Exclude<CandidateStatus, 'submitted'>];
        rows = (await sql.query(
          `UPDATE freelancer_candidates
           SET status = $2, ${col} = NULL
           WHERE id = $1::uuid AND status = $3
           ${RETURNING}`,
          [id, newStatus, current.status]
        )) as CandidateItem[];
      }
    }

    // Brak wiersza = status zmienil sie w miedzyczasie (rownolegla edycja)
    if (!rows[0]) return bad('Status kandydata zmienil sie w miedzyczasie - odswiez strone', 409);

    return NextResponse.json({ ok: true, item: rows[0] });
  } catch (e) {
    if (e instanceof Error && e.message === 'UNAUTHORIZED') {
      return bad('Brak dostepu', 401);
    }
    return bad('Blad serwera', 500);
  }
}
