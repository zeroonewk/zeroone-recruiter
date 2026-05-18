import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import LogoutButton from '@/components/auth/LogoutButton';

export default async function HomePage() {
  const session = await getSession();

  if (!session) {
    redirect('/zaloguj');
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <span className="text-lg font-bold tracking-widest text-black">
            ZEROONE
          </span>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-700">{session.name}</span>
            <LogoutButton />
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-3">
          Czesc, {session.name}!
        </h1>
        <p className="text-gray-600">
          Zalogowano jako {session.email}. Aplikacja w budowie.
        </p>
      </main>
    </div>
  );
}
