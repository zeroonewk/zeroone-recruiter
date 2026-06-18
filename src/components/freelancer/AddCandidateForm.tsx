'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

type Props = {
  projectId: string;
};

export default function AddCandidateForm({ projectId }: Props) {
  const router = useRouter();
  const [fullName, setFullName] = useState('');
  const [cvUrl, setCvUrl] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch(`/api/freelancer/projects/${projectId}/candidates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ full_name: fullName, cv_url: cvUrl }),
      });
      const data = await res.json();
      if (!data.ok) {
        setError(data.error ?? 'Blad serwera');
        return;
      }
      setFullName('');
      setCvUrl('');
      router.refresh();
    } catch {
      setError('Blad sieci');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
          {error}
        </p>
      )}
      <div className="flex flex-col sm:flex-row gap-3">
        <input
          type="text"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          placeholder="Imie i nazwisko kandydata"
          required
          className="flex-1 border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#FF5A3C]/40 focus:border-[#FF5A3C]"
        />
        <input
          type="url"
          value={cvUrl}
          onChange={(e) => setCvUrl(e.target.value)}
          placeholder="URL do CV (https://...)"
          required
          className="flex-1 border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#FF5A3C]/40 focus:border-[#FF5A3C]"
        />
        <button
          type="submit"
          disabled={loading}
          className="bg-[#FF5A3C] hover:bg-[#E64428] text-white text-sm font-medium px-4 py-2 rounded-md transition-colors disabled:opacity-50 whitespace-nowrap"
        >
          {loading ? 'Dodawanie...' : 'Dodaj kandydata'}
        </button>
      </div>
    </form>
  );
}
