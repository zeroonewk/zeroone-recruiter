'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

type Props = {
  user: { name: string; email: string; role: 'admin' | 'recruiter' };
  children: React.ReactNode;
};

const NAV_LINKS = [
  { label: 'Projekty', href: '/projekty' },
  { label: 'Dashboard', href: '/dashboard' },
  { label: 'Ustawienia', href: '/ustawienia' },
] as const;

export default function AppShell({ user, children }: Props) {
  const pathname = usePathname();

  async function handleLogout() {
    await fetch('/api/wyloguj', { method: 'POST' });
    window.location.href = '/zaloguj';
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="fixed top-0 left-0 right-0 z-50 h-16 bg-white border-b border-gray-200 px-6 flex items-center justify-between gap-4">
        <span className="font-bold tracking-wider text-[#FF5A3C] shrink-0">ZEROONE</span>

        <nav className="flex-1 flex items-center gap-1">
          {NAV_LINKS.map((link) => {
            const active = pathname === link.href || pathname.startsWith(link.href + '/');
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                  active
                    ? 'bg-[#FF5A3C]/10 text-[#FF5A3C]'
                    : 'text-gray-700 hover:bg-gray-100'
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-3 shrink-0">
          <span className="text-sm text-gray-700">{user.name}</span>
          <button
            onClick={handleLogout}
            className="text-sm px-3 py-1.5 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-100 transition-colors"
          >
            Wyloguj
          </button>
        </div>
      </header>
      <div className="pt-16 min-h-[calc(100vh-64px)] bg-gray-50">{children}</div>
    </div>
  );
}
