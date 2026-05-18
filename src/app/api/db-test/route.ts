import { sql } from '@/lib/db';

export async function GET() {
  try {
    const rows = await sql`SELECT NOW() as now, current_database() as db`;
    return Response.json({ ok: true, result: rows[0] });
  } catch (e) {
    return Response.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
