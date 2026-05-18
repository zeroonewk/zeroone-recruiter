import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import AppShell from '@/components/layout/AppShell';
import SettingsSidebar from '@/components/layout/SettingsSidebar';

export default async function UstawieniaLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session) redirect('/zaloguj');

  return (
    <AppShell user={{ name: session.name, email: session.email, role: session.role }}>
      <div className="max-w-7xl mx-auto px-4 py-6 flex gap-6">
        <SettingsSidebar userRole={session.role} />
        <main className="flex-1 min-w-0 p-6">{children}</main>
      </div>
    </AppShell>
  );
}
