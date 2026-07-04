import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { sql } from '@/lib/db';
import TypyProjektowClient, { type ProjectType } from '@/components/settings/TypyProjektowClient';

export default async function TypyProjektowPage() {
  const session = await getSession();
  if (!session) redirect('/zaloguj');

  const items = (await sql`
    SELECT id, name, default_points, priority_class, is_archived, created_at, updated_at
    FROM project_types
    WHERE NOT is_archived
    ORDER BY name ASC
  `) as ProjectType[];

  return <TypyProjektowClient initialItems={items} />;
}
