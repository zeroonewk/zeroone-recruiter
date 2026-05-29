'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import type { ProjectListItem } from '@/app/api/projekty/route';

type FilterOption = { id: string; name: string };

type Props = {
  initialItems: ProjectListItem[];
  statuses: FilterOption[];
  types: FilterOption[];
  clients: FilterOption[];
  users: FilterOption[];
};

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00Z');
  return d.toLocaleDateString('pl-PL', { year: 'numeric', month: '2-digit', day: '2-digit' });
}

const selectCls =
  'px-3 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#FF5A3C] focus:border-transparent bg-white';

export default function ProjektyClient({
  initialItems,
  statuses,
  types,
  clients,
  users,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [search, setSearch] = useState(() => searchParams.get('q') ?? '');
  const [statusId, setStatusId] = useState(() => searchParams.get('status') ?? '');
  const [ownerId, setOwnerId] = useState(() => searchParams.get('owner') ?? '');
  const [clientId, setClientId] = useState(() => searchParams.get('klient') ?? '');
  const [typeId, setTypeId] = useState(() => searchParams.get('typ') ?? '');
  const [showArchived, setShowArchived] = useState(() => searchParams.get('archiwum') === '1');

  function syncUrl(
    q: string,
    st: string,
    ow: string,
    cl: string,
    ty: string,
    arch: boolean,
  ) {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (st) params.set('status', st);
    if (ow) params.set('owner', ow);
    if (cl) params.set('klient', cl);
    if (ty) params.set('typ', ty);
    if (arch) params.set('archiwum', '1');
    const qs = params.toString();
    router.replace(qs ? `/projekty?${qs}` : '/projekty');
  }

  const hasFilters = !!(search || statusId || ownerId || clientId || typeId || showArchived);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return initialItems.filter((p) => {
      if (!showArchived && p.is_archived) return false;
      if (statusId && p.status_id !== statusId) return false;
      if (ownerId && p.owner_id !== ownerId) return false;
      if (clientId && p.client_id !== clientId) return false;
      if (typeId && p.type_id !== typeId) return false;
      if (q && !`${p.title} ${p.client_name}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [initialItems, search, statusId, ownerId, clientId, typeId, showArchived]);

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Projekty</h1>
        <Link
          href="/projekty/nowy"
          className="px-4 py-2 bg-[#FF5A3C] hover:bg-[#E64428] text-white text-sm font-medium rounded-md transition-colors"
        >
          Nowy projekt
        </Link>
      </div>

      {/* Filters */}
      <div className="bg-white border border-gray-200 rounded-lg p-4 mb-6 flex flex-wrap gap-3 items-center">
        <input
          type="text"
          placeholder="Szukaj..."
          value={search}
          onChange={(e) => {
            const v = e.target.value;
            setSearch(v);
            syncUrl(v, statusId, ownerId, clientId, typeId, showArchived);
          }}
          className="px-3 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#FF5A3C] focus:border-transparent min-w-[160px]"
        />
        <select
          value={statusId}
          onChange={(e) => {
            const v = e.target.value;
            setStatusId(v);
            syncUrl(search, v, ownerId, clientId, typeId, showArchived);
          }}
          className={selectCls}
        >
          <option value="">Wszystkie statusy</option>
          {statuses.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <select
          value={clientId}
          onChange={(e) => {
            const v = e.target.value;
            setClientId(v);
            syncUrl(search, statusId, ownerId, v, typeId, showArchived);
          }}
          className={selectCls}
        >
          <option value="">Wszyscy klienci</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select
          value={ownerId}
          onChange={(e) => {
            const v = e.target.value;
            setOwnerId(v);
            syncUrl(search, statusId, v, clientId, typeId, showArchived);
          }}
          className={selectCls}
        >
          <option value="">Wszyscy ownerzy</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>
        <select
          value={typeId}
          onChange={(e) => {
            const v = e.target.value;
            setTypeId(v);
            syncUrl(search, statusId, ownerId, clientId, v, showArchived);
          }}
          className={selectCls}
        >
          <option value="">Wszystkie typy</option>
          {types.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(e) => {
              const v = e.target.checked;
              setShowArchived(v);
              syncUrl(search, statusId, ownerId, clientId, typeId, v);
            }}
            className="rounded"
          />
          Pokaż zarchiwizowane
        </label>
        {hasFilters && (
          <button
            type="button"
            onClick={() => {
              setSearch('');
              setStatusId('');
              setOwnerId('');
              setClientId('');
              setTypeId('');
              setShowArchived(false);
              router.replace('/projekty');
            }}
            className="ml-auto text-sm text-gray-500 hover:text-gray-700 underline"
          >
            Wyczysc filtry
          </button>
        )}
      </div>

      {/* Table / empty state */}
      {filtered.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-lg p-12 text-center">
          <p className="text-gray-500 text-sm">
            {initialItems.length === 0
              ? 'Brak projektow. Dodaj pierwszy projekt.'
              : 'Brak projektow spelniajacych kryteria wyszukiwania.'}
          </p>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="px-4 py-3 text-left font-medium text-gray-700">Projekt</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-700">Klient</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-700">Status</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-700">Owner</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-700">Etap</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-700">Typ</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-700">Pkt</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-700">Otwarty</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => (
                  <tr
                    key={p.id}
                    className={`border-b border-gray-100 hover:bg-gray-50 transition-colors${
                      p.is_archived ? ' opacity-60' : ''
                    }`}
                  >
                    <td className="px-4 py-3">
                      <Link
                        href={`/projekty/${p.id}`}
                        className="font-medium text-gray-900 hover:text-[#FF5A3C] transition-colors"
                      >
                        {p.title}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{p.client_name}</td>
                    <td className="px-4 py-3">
                      <span className="flex items-center gap-1.5">
                        <span
                          className="inline-block w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: p.status_color }}
                        />
                        <span className="text-gray-700">{p.status_name}</span>
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{p.owner_name}</td>
                    <td className="px-4 py-3">
                      {p.current_stage_name ? (
                        <div>
                          <span className="text-gray-700">{p.current_stage_name}</span>
                          {p.current_stage_deadline && (
                            <div
                              className={`text-xs mt-0.5 ${
                                p.is_overdue
                                  ? 'text-red-600 font-medium'
                                  : 'text-gray-400'
                              }`}
                            >
                              {formatDate(p.current_stage_deadline)}
                              {p.is_overdue && ' · Przekroczony'}
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{p.type_name}</td>
                    <td className="px-4 py-3 text-right text-gray-700">{p.points}</td>
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                      {formatDate(p.opened_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-2 border-t border-gray-100 text-xs text-gray-400">
            {filtered.length} {filtered.length === 1 ? 'projekt' : 'projektow'}
          </div>
        </div>
      )}
    </div>
  );
}
