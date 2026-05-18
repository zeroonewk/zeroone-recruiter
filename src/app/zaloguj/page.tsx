'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function ZalogujPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/zaloguj', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();

      if (data.ok) {
        router.push('/');
      } else {
        setError(data.error ?? 'Blad logowania');
      }
    } catch {
      setError('Blad polaczenia z serwerem');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="w-full max-w-[400px] bg-white border border-gray-200 rounded-lg p-8">
        <div className="mb-6">
          <div className="text-xl font-bold tracking-widest text-black mb-4">
            ZEROONE
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            Zeroone Recruiter
          </h1>
          <p className="text-gray-600 text-sm">Zaloguj sie do panelu</p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-md px-3 py-2 mb-4">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate>
          <div className="mb-4">
            <label
              htmlFor="email"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              placeholder="twoj@email.pl"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#FF5A3C] focus:border-transparent"
            />
          </div>

          <div className="mb-6">
            <label
              htmlFor="password"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Haslo
            </label>
            <input
              id="password"
              type="password"
              required
              placeholder="Haslo"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#FF5A3C] focus:border-transparent"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-[#FF5A3C] hover:bg-[#E64428] text-white font-medium py-2.5 rounded-md disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? 'Logowanie...' : 'Zaloguj sie'}
          </button>
        </form>
      </div>
    </div>
  );
}
