import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { sql } from '@/lib/db';
import UzytkownicyClient, { type User } from '@/components/settings/UzytkownicyClient';

export default async function UzytkownicyPage() {
  const session = await getSession();
  if (session?.role !== 'admin') redirect('/ustawienia/klienci');

  const items = (await sql`
    SELECT id, email, name, role, is_active, created_at, updated_at
    FROM users
    ORDER BY name ASC
  `) as User[];

  return <UzytkownicyClient initialItems={items} currentUserId={session.sub} />;
}
