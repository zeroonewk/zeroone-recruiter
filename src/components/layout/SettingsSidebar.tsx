'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

type Props = {
  userRole: 'admin' | 'recruiter';
};

const navItems = [
  { label: 'Klienci', href: '/ustawienia/klienci' },
  { label: 'Typy projektow', href: '/ustawienia/typy-projektow' },
  { label: 'Etapy procesu', href: '/ustawienia/etapy' },
  { label: 'Statusy projektow', href: '/ustawienia/statusy' },
] as const;

export default function SettingsSidebar({ userRole }: Props) {
  const pathname = usePathname();

  return (
    <aside className="w-60 shrink-0 sticky top-16 self-start">
      <nav className="flex flex-col gap-1 p-4">
        {navItems.map((item) => {
          const active = pathname === item.href || pathname.startsWith(item.href + '/');
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`block px-3 py-2 rounded-md text-sm transition-colors ${
                active
                  ? 'bg-[#FF5A3C]/10 text-[#FF5A3C] font-medium'
                  : 'text-gray-700 hover:bg-gray-100'
              }`}
            >
              {item.label}
            </Link>
          );
        })}
        {userRole === 'admin' && (
          <Link
            href="/ustawienia/uzytkownicy"
            className={`block px-3 py-2 rounded-md text-sm transition-colors ${
              pathname === '/ustawienia/uzytkownicy' ||
              pathname.startsWith('/ustawienia/uzytkownicy/')
                ? 'bg-[#FF5A3C]/10 text-[#FF5A3C] font-medium'
                : 'text-gray-700 hover:bg-gray-100'
            }`}
          >
            Uzytkownicy
          </Link>
        )}
      </nav>
    </aside>
  );
}
