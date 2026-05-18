import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { sql } from '@/lib/db';
import KlienciClient, { type Client } from '@/components/settings/KlienciClient';

export default async function KlienciPage() {
  const session = await getSession();
  if (!session) redirect('/zaloguj');

  const items = (await sql`
    SELECT id, name, notes, is_archived, created_at, updated_at
    FROM clients
    WHERE NOT is_archived
    ORDER BY name ASC
  `) as Client[];

  return <KlienciClient initialItems={items} />;
}
