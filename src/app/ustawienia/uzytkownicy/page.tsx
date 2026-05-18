import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';

export default async function UzytkownicyPage() {
  const session = await getSession();
  if (session?.role !== 'admin') redirect('/ustawienia/klienci');

  return (
    <>
      <h1 className="text-2xl font-bold mb-2">Uzytkownicy</h1>
      <p className="text-gray-600">Wkrotce...</p>
    </>
  );
}
