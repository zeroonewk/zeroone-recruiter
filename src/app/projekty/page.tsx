import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getSession } from '@/lib/auth';
import AppShell from '@/components/layout/AppShell';

export default async function ProjektyPage() {
  const session = await getSession();
  if (!session) redirect('/zaloguj');

  return (
    <AppShell user={{ name: session.name, email: session.email, role: session.role }}>
      <main className="max-w-7xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold text-gray-900">Projekty</h1>
          <Link
            href="/projekty/nowy"
            className="px-4 py-2 bg-[#FF5A3C] hover:bg-[#E64428] text-white text-sm font-medium rounded-md transition-colors"
          >
            Nowy projekt
          </Link>
        </div>
        <p className="text-gray-600">Lista projektow w budowie...</p>
      </main>
    </AppShell>
  );
}
