import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getSession } from '@/lib/auth';
import AppShell from '@/components/layout/AppShell';

export default async function HomePage() {
  const session = await getSession();
  if (!session) redirect('/zaloguj');

  return (
    <AppShell user={{ name: session.name, email: session.email, role: session.role }}>
      <main className="max-w-7xl mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-3">
          Czesc, {session.name}!
        </h1>
        <p className="text-gray-600 mb-4">Aplikacja w budowie.</p>
        <Link
          href="/ustawienia"
          className="text-[#FF5A3C] hover:underline text-sm"
        >
          Przejdz do ustawien
        </Link>
      </main>
    </AppShell>
  );
}
