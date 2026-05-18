import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { sql } from '@/lib/db';
import StatusyClient, { type ResultStatus } from '@/components/settings/StatusyClient';

export default async function StatusyPage() {
  const session = await getSession();
  if (!session) redirect('/zaloguj');

  const items = (await sql`
    SELECT id, name, color, is_success, position, is_archived, created_at, updated_at
    FROM result_statuses
    WHERE NOT is_archived
    ORDER BY position ASC
  `) as ResultStatus[];

  return <StatusyClient initialItems={items} />;
}
