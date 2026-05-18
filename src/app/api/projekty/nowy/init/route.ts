import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { requireSession } from '@/lib/auth';
import { checkProjectPrerequisites } from '@/lib/projects-prereqs';

export async function GET() {
  try {
    await requireSession();

    const prereqs = await checkProjectPrerequisites();
    if (!prereqs.ok) {
      return NextResponse.json({ ok: false, missing: prereqs.missing });
    }

    const [clients, types, statuses, users, stages] = await Promise.all([
      sql`SELECT id, name FROM clients WHERE is_archived = FALSE ORDER BY name ASC`,
      sql`SELECT id, name, default_points FROM project_types WHERE is_archived = FALSE ORDER BY name ASC`,
      sql`SELECT id, name, color, is_success FROM result_statuses WHERE is_archived = FALSE ORDER BY position ASC`,
      sql`SELECT id, name, email FROM users WHERE is_active = TRUE ORDER BY name ASC`,
      sql`SELECT id, name, position, default_days_offset FROM workflow_stages_template WHERE is_archived = FALSE ORDER BY position ASC`,
    ]);

    const defaultStatus =
      (statuses as { id: string; is_success: boolean }[]).find((s) => !s.is_success) ??
      statuses[0];

    return NextResponse.json({
      ok: true,
      data: {
        clients,
        types,
        statuses,
        users,
        stages_template: stages,
        default_status_id: (defaultStatus as { id: string }).id,
      },
    });
  } catch (e) {
    if (e instanceof Error && e.message === 'UNAUTHORIZED') {
      return NextResponse.json({ ok: false, error: 'Brak dostepu' }, { status: 401 });
    }
    return NextResponse.json({ ok: false, error: 'Blad serwera' }, { status: 500 });
  }
}
