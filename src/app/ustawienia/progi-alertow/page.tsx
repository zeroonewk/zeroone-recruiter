import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { loadAlertSettings } from '@/lib/alerts';
import ProgiAlertowClient from '@/components/settings/ProgiAlertowClient';

export const dynamic = 'force-dynamic';

export default async function ProgiAlertowPage() {
  const session = await getSession();
  if (session?.role !== 'admin') redirect('/ustawienia/klienci');

  const settings = await loadAlertSettings();

  return <ProgiAlertowClient initialSettings={settings} />;
}
