'use client';

import React from 'react';

type Props = {
  user: { name: string; email: string; role: 'admin' | 'recruiter' };
  children: React.ReactNode;
};

export default function AppShell({ user, children }: Props) {
  async function handleLogout() {
    await fetch('/api/wyloguj', { method: 'POST' });
    window.location.href = '/zaloguj';
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="fixed top-0 left-0 right-0 z-50 h-16 bg-white border-b border-gray-200 px-6 flex items-center justify-between">
        <span className="font-bold tracking-wider text-[#FF5A3C]">ZEROONE</span>
        <div className="flex items-center gap-3">
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
