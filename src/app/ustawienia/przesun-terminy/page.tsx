import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { computeShiftPreview } from '@/lib/przesun-terminy';
import PrzesunTerminyClient from '@/components/settings/PrzesunTerminyClient';

export default async function PrzesunTerminyPage() {
  const session = await getSession();
  if (session?.role !== 'admin') redirect('/ustawienia/klienci');

  const projects = await computeShiftPreview();

  return <PrzesunTerminyClient initialProjects={projects} />;
}
