import { sql } from '@/lib/db';
import type { DateRange } from '@/lib/date-ranges';

// Wspolne definicje liczb Status Meeting (kafelki "Liczby" + panel "Analiza okresu").
// ownerId = null -> wszyscy rekruterzy; w przeciwnym razie tylko projekty p.owner_id = ownerId.

export type PeriodNumbers = {
  stages_closed: number;   // Etapy zrealizowane
  success_count: number;   // Projekty zamkniete (status sukcesu)
  success_points: number;  // Punkty zdobyte
  new_projects: number;    // Nowe projekty
  freelancer_recs: number; // Rekomendacje freelancerow
  freelancer_meetings: number; // Spotkania z klientem (Etap 2) wg stage2_at
  freelancer_selected: number; // Wybrani (zatrudnienia) wg selected_at
  freelancer_estimate: number; // Szacunek wynagrodzen freelancerow (zl) za zdarzenia z okresu
};

export const EMPTY_PERIOD_NUMBERS: PeriodNumbers = {
  stages_closed: 0,
  success_count: 0,
  success_points: 0,
  new_projects: 0,
  freelancer_recs: 0,
  freelancer_meetings: 0,
  freelancer_selected: 0,
  freelancer_estimate: 0,
};

// Zdarzenia z kandydatami freelancerow (is_external) w projektach rekrutera — JEDNO ZRODLO
// PRAWDY dla tabeli "Rekomendacje freelancerow", jej dymkow i panelu "Analiza okresu".
// Jeden wiersz = jedno zdarzenie w okresie, wg wlasnej daty:
//   submitted (created_at), stage1 (stage1_at), stage2 (stage2_at), selected (selected_at).
//
// Kwota zdarzenia (Szacunek, zgodnie z zasada z lib/freelancer-earnings.ts, ale per zdarzenie):
// - selected => wartosc projektu (project_value, brak => points)
// - stage1 / stage2 => cv_rate / meeting_rate, tylko gdy freelancer NIE ma w tym projekcie
//   zadnego kandydata 'selected' (w ogole, nie tylko w okresie); w przeciwnym razie
//   kwota 0 i included = TRUE ("wliczone w kwote za wybranego")
// - submitted => brak kwoty (NULL)
// Stawki: brak lub wartosc niepoprawna => 0; zero zostaje zerem (bez falsy-fallbackow).
const rateSql = (key: string, fallback: string) =>
  `CASE WHEN jsonb_typeof(p.freelancer_rates->'${key}') = 'number'
             AND (p.freelancer_rates->>'${key}')::numeric >= 0
        THEN (p.freelancer_rates->>'${key}')::numeric
        ELSE ${fallback} END`;

// Buduje CTE zdarzen (jedno zrodlo prawdy dla zarobku ze zdarzen):
//   fe_events_all — wszystkie zdarzenia z cala historia (do sald), z kwota zarobku
//   fe_events     — zdarzenia w okresie [$2, $3] (gdy withRange)
// $1 = ownerId (filtr rekrutera, NULL = wszyscy); userParam opcjonalnie zaweza do jednego freelancera.
function freelancerEventsCte({ withRange, userParam }: { withRange: boolean; userParam?: string }): string {
  return `
  fe_base AS (
    SELECT
      fc.user_id,
      u.name,
      fc.full_name AS candidate_name,
      p.title AS project_title,
      fc.created_at::date AS submitted_on,
      fc.stage1_at,
      fc.stage2_at,
      fc.selected_at,
      EXISTS (
        SELECT 1 FROM freelancer_candidates fs
        WHERE fs.user_id = fc.user_id AND fs.project_id = fc.project_id AND fs.status = 'selected'
      ) AS pair_has_selected,
      ${rateSql('cv_rate', '0')} AS cv_rate,
      ${rateSql('meeting_rate', '0')} AS meeting_rate,
      ${rateSql('project_value', 'COALESCE(p.points, 0)::numeric')} AS project_value
    FROM freelancer_candidates fc
    JOIN users u ON u.id = fc.user_id
    JOIN projects p ON p.id = fc.project_id
    WHERE u.is_external = TRUE
      AND ($1::uuid IS NULL OR p.owner_id = $1::uuid)
      ${userParam ? `AND fc.user_id = ${userParam}::uuid` : ''}
  ),
  fe_events_all AS (
    SELECT b.user_id, b.name, b.candidate_name, b.project_title, e.kind, e.event_date, e.amount, e.included
    FROM fe_base b
    CROSS JOIN LATERAL (VALUES
      ('submitted', b.submitted_on, NULL::numeric, FALSE),
      ('stage1', b.stage1_at,
         CASE WHEN b.pair_has_selected THEN 0 ELSE b.cv_rate END, b.pair_has_selected),
      ('stage2', b.stage2_at,
         CASE WHEN b.pair_has_selected THEN 0 ELSE b.meeting_rate END, b.pair_has_selected),
      ('selected', b.selected_at, b.project_value, FALSE)
    ) AS e(kind, event_date, amount, included)
    WHERE e.event_date IS NOT NULL
  )${withRange ? `,
  fe_events AS (
    SELECT * FROM fe_events_all WHERE event_date BETWEEN $2::date AND $3::date
  )` : ''}`;
}

const FREELANCER_EVENTS_CTE = freelancerEventsCte({ withRange: true });

export async function fetchPeriodNumbers(ownerId: string | null, range: DateRange): Promise<PeriodNumbers> {
  const rows = (await sql.query(
    `WITH ${FREELANCER_EVENTS_CTE}
     SELECT
       (SELECT COUNT(*)::int FROM project_stages ps
        JOIN projects p ON p.id = ps.project_id
        WHERE ps.done_at BETWEEN $2::date AND $3::date
          AND ($1::uuid IS NULL OR p.owner_id = $1::uuid)) AS stages_closed,
       (SELECT COUNT(*)::int FROM projects p
        JOIN result_statuses rs ON rs.id = p.status_id
        WHERE p.closed_at BETWEEN $2::date AND $3::date
          AND rs.is_success = TRUE
          AND ($1::uuid IS NULL OR p.owner_id = $1::uuid)) AS success_count,
       (SELECT COALESCE(SUM(p.points), 0)::int FROM projects p
        JOIN result_statuses rs ON rs.id = p.status_id
        WHERE p.closed_at BETWEEN $2::date AND $3::date
          AND rs.is_success = TRUE
          AND ($1::uuid IS NULL OR p.owner_id = $1::uuid)) AS success_points,
       (SELECT COUNT(*)::int FROM projects p
        WHERE p.opened_at BETWEEN $2::date AND $3::date
          AND p.is_archived = FALSE
          AND ($1::uuid IS NULL OR p.owner_id = $1::uuid)) AS new_projects,
       (SELECT COUNT(*) FILTER (WHERE kind = 'submitted')::int FROM fe_events) AS freelancer_recs,
       (SELECT COUNT(*) FILTER (WHERE kind = 'stage2')::int FROM fe_events) AS freelancer_meetings,
       (SELECT COUNT(*) FILTER (WHERE kind = 'selected')::int FROM fe_events) AS freelancer_selected,
       (SELECT COALESCE(SUM(amount), 0)::float8 FROM fe_events) AS freelancer_estimate`,
    [ownerId, range.start, range.end]
  )) as PeriodNumbers[];
  return rows[0] ?? EMPTY_PERIOD_NUMBERS;
}

export type FreelancerEventKind = 'submitted' | 'stage1' | 'stage2' | 'selected';

export type FreelancerEvent = {
  candidate_name: string;
  project_title: string;
  date: string; // YYYY-MM-DD
  kind: FreelancerEventKind;
  amount?: number;    // tylko pozycje Szacunku (stage1/stage2/selected)
  included?: boolean; // true => wliczone w kwote za wybranego (amount = 0)
};

export type FreelancerEventLists = {
  submitted: FreelancerEvent[];
  stage1: FreelancerEvent[];
  stage2: FreelancerEvent[];
  selected: FreelancerEvent[];
  estimate: FreelancerEvent[]; // pozycje Szacunku: stage1, stage2, selected
};

export type FreelancerPaymentItem = {
  id: string;
  amount: number;
  paid_on: string; // YYYY-MM-DD
  note: string | null;
};

export type FreelancerRecommendation = {
  user_id: string;
  name: string;
  submitted: number; // zgloszone w okresie (created_at)
  accepted: number;  // Etap 1 osiagniety w okresie (stage1_at)
  meetings: number;  // Etap 2 osiagniety w okresie (stage2_at)
  selected: number;  // wybrani w okresie (selected_at)
  estimate: number;  // Szacunek prowizji (zl) = suma amount z events.estimate
  events: FreelancerEventLists;
  // Rozliczenia (wyplaty NIE podlegaja filtrowi rekrutera, zarobki — tak)
  earned_before: number; // zarobek ze zdarzen z data < start
  paid_before: number;   // wyplaty z paid_on < start
  carry_in: number;      // Z przeniesienia = earned_before - paid_before
  paid: number;          // Wyplacone w okresie
  carry_out: number;     // Do przeniesienia = carry_in + estimate - paid
  payments: FreelancerPaymentItem[]; // wyplaty w okresie (paid_on malejaco)
};

type EventRow = {
  user_id: string;
  name: string;
  candidate_name: string;
  project_title: string;
  kind: FreelancerEventKind;
  date: string;
  amount: number | null;
  included: boolean;
};

type EarnedBeforeRow = { user_id: string; name: string; earned_before: number };
type PaymentAggRow = { user_id: string; name: string; paid_before: number; paid: number };
type PaymentListRow = FreelancerPaymentItem & { user_id: string };

// Wyplaty freelancerow (is_external). Bez filtra rekrutera — sa przypisane do freelancera.
const PAYMENTS_FROM = `
  FROM freelancer_payments fp
  JOIN users u ON u.id = fp.user_id
  WHERE u.is_external = TRUE`;

const EPS = 0.005; // saldo "niezerowe" = co najmniej 1 grosz

// Liczby w tabeli sa wyliczane z tych samych pozycji, ktore pokazuja dymki,
// wiec liczba = dlugosc listy, a Szacunek = suma kwot pozycji (z definicji).
// Salda licza sie z calej historii zdarzen (fe_events_all) i wyplat — bez snapshotow.
export async function fetchFreelancerRecommendations(
  ownerId: string | null,
  range: DateRange
): Promise<FreelancerRecommendation[]> {
  const params = [ownerId, range.start, range.end];
  // Salda tylko bez filtra rekrutera (wyplaty nie sa przypisane do rekrutera, wiec
  // saldo przy filtrze mieszaloby zarobki jednego rekrutera z wszystkimi wyplatami).
  const withBalances = ownerId === null;
  const none = <T,>() => Promise.resolve([] as T[]);
  const [eventRows, earnedRows, paymentAggRows, paymentRows] = await Promise.all([
    sql.query(
      `WITH ${FREELANCER_EVENTS_CTE}
       SELECT
         user_id, name, candidate_name, project_title, kind,
         event_date::text AS date,
         amount::float8 AS amount,
         included
       FROM fe_events
       ORDER BY event_date ASC, candidate_name ASC`,
      params
    ) as Promise<unknown> as Promise<EventRow[]>,

    // Z przeniesienia (czesc zarobkowa): wszystkie zdarzenia przed poczatkiem okresu
    !withBalances ? none<EarnedBeforeRow>() : sql.query(
      `WITH ${FREELANCER_EVENTS_CTE}
       SELECT user_id, name, COALESCE(SUM(amount), 0)::float8 AS earned_before
       FROM fe_events_all
       WHERE event_date < $2::date
       GROUP BY user_id, name`,
      params
    ) as Promise<unknown> as Promise<EarnedBeforeRow[]>,

    !withBalances ? none<PaymentAggRow>() : sql.query(
      `SELECT fp.user_id, u.name,
         COALESCE(SUM(fp.amount) FILTER (WHERE fp.paid_on < $1::date), 0)::float8 AS paid_before,
         COALESCE(SUM(fp.amount) FILTER (WHERE fp.paid_on BETWEEN $1::date AND $2::date), 0)::float8 AS paid
       ${PAYMENTS_FROM}
         AND fp.paid_on <= $2::date
       GROUP BY fp.user_id, u.name`,
      [range.start, range.end]
    ) as Promise<unknown> as Promise<PaymentAggRow[]>,

    !withBalances ? none<PaymentListRow>() : sql.query(
      `SELECT fp.id, fp.user_id, fp.amount::float8 AS amount, fp.paid_on::text AS paid_on, fp.note
       ${PAYMENTS_FROM}
         AND fp.paid_on BETWEEN $1::date AND $2::date
       ORDER BY fp.paid_on DESC, fp.created_at DESC`,
      [range.start, range.end]
    ) as Promise<unknown> as Promise<PaymentListRow[]>,
  ]);

  const byUser = new Map<string, FreelancerRecommendation>();
  const get = (user_id: string, name: string) => {
    let rec = byUser.get(user_id);
    if (!rec) {
      rec = {
        user_id,
        name,
        submitted: 0,
        accepted: 0,
        meetings: 0,
        selected: 0,
        estimate: 0,
        events: { submitted: [], stage1: [], stage2: [], selected: [], estimate: [] },
        earned_before: 0,
        paid_before: 0,
        carry_in: 0,
        paid: 0,
        carry_out: 0,
        payments: [],
      };
      byUser.set(user_id, rec);
    }
    return rec;
  };

  for (const r of eventRows) {
    const rec = get(r.user_id, r.name);
    const ev: FreelancerEvent = {
      candidate_name: r.candidate_name,
      project_title: r.project_title,
      date: r.date,
      kind: r.kind,
    };
    rec.events[r.kind].push(ev);
    if (r.kind !== 'submitted') {
      const amount = typeof r.amount === 'number' ? r.amount : 0;
      rec.events.estimate.push({ ...ev, amount, included: r.included });
    }
  }
  for (const r of earnedRows) get(r.user_id, r.name).earned_before = r.earned_before;
  for (const r of paymentAggRows) {
    const rec = get(r.user_id, r.name);
    rec.paid_before = r.paid_before;
    rec.paid = r.paid;
  }
  for (const r of paymentRows) {
    const rec = byUser.get(r.user_id);
    if (rec) rec.payments.push({ id: r.id, amount: r.amount, paid_on: r.paid_on, note: r.note });
  }

  return Array.from(byUser.values())
    .map((rec) => {
      const estimate = rec.events.estimate.reduce((sum, e) => sum + (e.amount ?? 0), 0);
      const carry_in = rec.earned_before - rec.paid_before;
      return {
        ...rec,
        submitted: rec.events.submitted.length,
        accepted: rec.events.stage1.length,
        meetings: rec.events.stage2.length,
        selected: rec.events.selected.length,
        estimate,
        carry_in,
        carry_out: carry_in + estimate - rec.paid,
      };
    })
    // Wiersz: zdarzenie w okresie, a bez filtra rekrutera takze niezerowe saldo z przeniesienia
    // lub wyplata w okresie (przy filtrze saldo nie jest liczone, wiec warunek nie dziala)
    .filter(
      (rec) =>
        rec.submitted + rec.accepted + rec.meetings + rec.selected > 0 ||
        Math.abs(rec.carry_in) >= EPS ||
        rec.payments.length > 0
    )
    .sort(
      (a, b) =>
        b.submitted - a.submitted ||
        b.accepted - a.accepted ||
        b.meetings - a.meetings ||
        b.selected - a.selected ||
        a.name.localeCompare(b.name, 'pl')
    );
}

// Aktualne saldo freelancera (cala historia, wszyscy rekruterzy) — do okna "Wyplaty".
// Te same zrodla co tabela: fe_events_all (zarobek ze zdarzen) i freelancer_payments.
export async function fetchFreelancerBalance(
  userId: string
): Promise<{ earned: number; paid: number; balance: number }> {
  const [earnedRows, paidRows] = await Promise.all([
    sql.query(
      `WITH ${freelancerEventsCte({ withRange: false, userParam: '$2' })}
       SELECT COALESCE(SUM(amount), 0)::float8 AS earned FROM fe_events_all`,
      [null, userId]
    ) as Promise<unknown> as Promise<{ earned: number }[]>,
    sql.query(
      `SELECT COALESCE(SUM(fp.amount), 0)::float8 AS paid ${PAYMENTS_FROM} AND fp.user_id = $1::uuid`,
      [userId]
    ) as Promise<unknown> as Promise<{ paid: number }[]>,
  ]);
  const earned = earnedRows[0]?.earned ?? 0;
  const paid = paidRows[0]?.paid ?? 0;
  return { earned, paid, balance: earned - paid };
}
