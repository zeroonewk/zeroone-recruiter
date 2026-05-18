import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getSession } from '@/lib/auth';
import { sql } from '@/lib/db';
import { checkProjectPrerequisites } from '@/lib/projects-prereqs';
import AppShell from '@/components/layout/AppShell';
import NowyProjektForm from '@/components/projects/NowyProjektForm';

type InitData = {
  clients: { id: string; name: string }[];
  types: { id: string; name: string; default_points: number }[];
  statuses: { id: string; name: string; color: string; is_success: boolean }[];
  users: { id: string; name: string; email: string }[];
  stages_template: { id: string; name: string; position: number; default_days_offset: number }[];
  default_status_id: string;
};

const MISSING_LINKS: Record<string, string> = {
  klient: '/ustawienia/klienci',
  'typ projektu': '/ustawienia/typy-projektow',
  status: '/ustawienia/statusy',
  'etap procesu': '/ustawienia/etapy',
  uzytkownik: '/ustawienia/uzytkownicy',
};

export default async function NowyProjektPage() {
  const session = await getSession();
  if (!session) redirect('/zaloguj');

  const prereqs = await checkProjectPrerequisites();

  if (!prereqs.ok) {
    return (
      <AppShell user={{ name: session.name, email: session.email, role: session.role }}>
        <main className="max-w-3xl mx-auto px-4 py-8">
          <div className="bg-white border border-gray-200 rounded-lg p-6">
            <h1 className="text-xl font-bold text-gray-900 mb-2">Brak konfiguracji</h1>
            <p className="text-gray-600 text-sm mb-4">
              Przed zalozeniem projektu uzupelnij brakujace slowniki:
            </p>
            <ul className="space-y-2">
              {prereqs.missing.map((item) => (
                <li key={item}>
                  <Link
                    href={MISSING_LINKS[item] ?? '/ustawienia'}
                    className="text-[#FF5A3C] hover:underline text-sm"
                  >
                    Dodaj: {item}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </main>
      </AppShell>
    );
  }

  const [clients, types, statuses, users, stages] = await Promise.all([
    sql`SELECT id, name FROM clients WHERE is_archived = FALSE ORDER BY name ASC`,
    sql`SELECT id, name, default_points FROM project_types WHERE is_archived = FALSE ORDER BY name ASC`,
    sql`SELECT id, name, color, is_success FROM result_statuses WHERE is_archived = FALSE ORDER BY position ASC`,
    sql`SELECT id, name, email FROM users WHERE is_active = TRUE ORDER BY name ASC`,
    sql`SELECT id, name, position, default_days_offset FROM workflow_stages_template WHERE is_archived = FALSE ORDER BY position ASC`,
  ]);

  const statusList = statuses as { id: string; is_success: boolean }[];
  const defaultStatus = statusList.find((s) => !s.is_success) ?? statusList[0];

  const initData: InitData = {
    clients: clients as InitData['clients'],
    types: types as InitData['types'],
    statuses: statuses as InitData['statuses'],
    users: users as InitData['users'],
    stages_template: stages as InitData['stages_template'],
    default_status_id: (defaultStatus as { id: string }).id,
  };

  return (
    <AppShell user={{ name: session.name, email: session.email, role: session.role }}>
      <NowyProjektForm initData={initData} currentUserId={session.sub} />
    </AppShell>
  );
}
