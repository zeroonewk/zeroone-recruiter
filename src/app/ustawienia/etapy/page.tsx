import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { sql } from '@/lib/db';
import EtapyClient, { type WorkflowStageTemplate } from '@/components/settings/EtapyClient';

export default async function EtapyPage() {
  const session = await getSession();
  if (!session) redirect('/zaloguj');

  const items = (await sql`
    SELECT id, name, position, default_days_offset, is_archived, created_at, updated_at
    FROM workflow_stages_template
    WHERE NOT is_archived
    ORDER BY position ASC
  `) as WorkflowStageTemplate[];

  return <EtapyClient initialItems={items} />;
}
