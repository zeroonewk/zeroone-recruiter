'use client';

import { useState } from 'react';

export type WorkflowStageTemplate = {
  id: string;
  name: string;
  position: number;
  default_days_offset: number;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
};

function formatDaysOffset(n: number): string {
  if (n === 0) return 'W dniu startu';
  return `+${n} dni od startu projektu`;
}

// ─── Modal ────────────────────────────────────────────────────────────────────

type ModalProps = {
  item: WorkflowStageTemplate | null;
  onClose: () => void;
  onSaved: () => void;
};

function EtapModal({ item, onClose, onSaved }: ModalProps) {
  const [name, setName] = useState(item?.name ?? '');
  const [daysOffset, setDaysOffset] = useState(
    item?.default_days_offset !== undefined ? String(item.default_days_offset) : '0'
  );
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const offsetNum = Number(daysOffset);
  const isDisabled =
    loading ||
    name.trim().length < 2 ||
    !Number.isInteger(offsetNum) ||
    offsetNum < 0 ||
    offsetNum > 365;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const url = item !== null ? `/api/etapy-template/${item.id}` : '/api/etapy-template';
      const method = item !== null ? 'PATCH' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          default_days_offset: offsetNum,
        }),
      });
      const data = (await res.json()) as { ok: boolean; error?: string };
      if (data.ok) {
        onSaved();
      } else {
        setError(data.error ?? 'Blad serwera');
      }
    } catch {
      setError('Blad polaczenia z serwerem');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-md w-full p-6">
        <h2 className="text-lg font-bold text-gray-900 mb-4">
          {item !== null ? 'Edytuj etap' : 'Dodaj etap'}
        </h2>

        <form onSubmit={handleSubmit} noValidate>
          <div className="mb-4">
            <label
              htmlFor="modal-name"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Nazwa
            </label>
            <input
              id="modal-name"
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#FF5A3C] focus:border-transparent"
            />
          </div>

          <div className="mb-4">
            <label
              htmlFor="modal-offset"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Domyslny deadline (dni od startu projektu)
            </label>
            <input
              id="modal-offset"
              type="number"
              min={0}
              max={365}
              step={1}
              required
              value={daysOffset}
              onChange={(e) => setDaysOffset(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#FF5A3C] focus:border-transparent"
            />
            <p className="mt-1 text-xs text-gray-500">
              0 = w dniu rozpoczecia projektu. Np. 7 = tydzien po starcie. Wartosc uzywana jako
              podpowiedz przy zakladaniu projektu, mozna ja zmienic per projekt.
            </p>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-md px-3 py-2 mb-4">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm border border-gray-300 rounded-md text-gray-700 hover:bg-gray-100 transition-colors"
            >
              Anuluj
            </button>
            <button
              type="submit"
              disabled={isDisabled}
              className="px-4 py-2 text-sm bg-[#FF5A3C] hover:bg-[#E64428] text-white rounded-md font-medium disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? 'Zapisywanie...' : 'Zapisz'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

type Props = { initialItems: WorkflowStageTemplate[] };

export default function EtapyClient({ initialItems }: Props) {
  const [items, setItems] = useState<WorkflowStageTemplate[]>(initialItems);
  const [showArchived, setShowArchived] = useState(false);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<WorkflowStageTemplate | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function fetchItems(archived: boolean) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/etapy-template?archived=${archived}`);
      const data = (await res.json()) as {
        ok: boolean;
        items?: WorkflowStageTemplate[];
        error?: string;
      };
      if (data.ok && data.items) {
        setItems(data.items);
      } else {
        setError(data.error ?? 'Blad wczytywania listy');
      }
    } catch {
      setError('Blad polaczenia z serwerem');
    } finally {
      setLoading(false);
    }
  }

  function openAdd() {
    setEditingItem(null);
    setModalOpen(true);
  }

  function openEdit(item: WorkflowStageTemplate) {
    setEditingItem(item);
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setEditingItem(null);
  }

  async function handleSaved() {
    closeModal();
    await fetchItems(showArchived);
  }

  async function handleArchive(item: WorkflowStageTemplate) {
    if (
      !confirm(
        `Zarchiwizowac etap "${item.name}"? Nowe projekty nie beda zawieraly tego etapu. Istniejace projekty zachowuja swoje etapy.`
      )
    )
      return;
    setError(null);
    try {
      const res = await fetch(`/api/etapy-template/${item.id}`, { method: 'DELETE' });
      const data = (await res.json()) as { ok: boolean; error?: string };
      if (data.ok) {
        await fetchItems(showArchived);
      } else {
        setError(data.error ?? 'Blad archiwizacji');
      }
    } catch {
      setError('Blad polaczenia z serwerem');
    }
  }

  async function handleRestore(item: WorkflowStageTemplate) {
    setError(null);
    try {
      const res = await fetch(`/api/etapy-template/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_archived: false }),
      });
      const data = (await res.json()) as { ok: boolean; error?: string };
      if (data.ok) {
        await fetchItems(showArchived);
      } else {
        setError(data.error ?? 'Blad przywracania');
      }
    } catch {
      setError('Blad polaczenia z serwerem');
    }
  }

  async function handleMove(item: WorkflowStageTemplate, direction: 'up' | 'down') {
    setError(null);
    try {
      const res = await fetch(`/api/etapy-template/${item.id}/move`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ direction }),
      });
      const data = (await res.json()) as { ok: boolean; error?: string };
      if (data.ok) {
        await fetchItems(showArchived);
      } else {
        setError(data.error ?? 'Blad przesuwania');
      }
    } catch {
      setError('Blad polaczenia z serwerem');
    }
  }

  async function handleToggleArchived(checked: boolean) {
    setShowArchived(checked);
    await fetchItems(checked);
  }

  const activeItems = items.filter((item) => !item.is_archived);
  const firstActiveId = activeItems[0]?.id;
  const lastActiveId = activeItems[activeItems.length - 1]?.id;

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Etapy procesu</h1>
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showArchived}
              onChange={(e) => handleToggleArchived(e.target.checked)}
              className="rounded"
            />
            Pokaz zarchiwizowane
          </label>
          <button
            onClick={openAdd}
            className="px-4 py-2 bg-[#FF5A3C] hover:bg-[#E64428] text-white text-sm font-medium rounded-md transition-colors"
          >
            Dodaj etap
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-md px-3 py-2 mb-4">
          {error}
        </div>
      )}

      {/* Table */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="bg-gray-50">
              <th className="text-left px-4 py-3 text-xs uppercase tracking-wider text-gray-600 font-medium w-24">
                Pozycja
              </th>
              <th className="text-left px-4 py-3 text-xs uppercase tracking-wider text-gray-600 font-medium">
                Nazwa
              </th>
              <th className="text-left px-4 py-3 text-xs uppercase tracking-wider text-gray-600 font-medium">
                Domyslny deadline
              </th>
              <th className="text-left px-4 py-3 text-xs uppercase tracking-wider text-gray-600 font-medium">
                Akcje
              </th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-gray-500 text-sm">
                  Ladowanie...
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-gray-500 text-sm">
                  Brak etapow. Dodaj pierwszy etap.
                </td>
              </tr>
            ) : (
              items.map((item) => (
                <tr
                  key={item.id}
                  className={`border-t border-gray-100 hover:bg-gray-50 transition-colors${item.is_archived ? ' bg-gray-50' : ''}`}
                >
                  {/* Pozycja + strzałki */}
                  <td className="px-4 py-3 text-sm">
                    <div className="flex items-center gap-1">
                      <span
                        className={`w-6 tabular-nums${item.is_archived ? ' text-gray-400' : ' text-gray-700'}`}
                      >
                        {item.is_archived ? '' : item.position}
                      </span>
                      {!item.is_archived && (
                        <div className="flex flex-col">
                          <button
                            onClick={() => handleMove(item, 'up')}
                            disabled={item.id === firstActiveId}
                            className="p-1 text-gray-500 hover:text-[#FF5A3C] disabled:opacity-20 disabled:cursor-not-allowed leading-none transition-colors"
                            aria-label="Przesuń w górę"
                          >
                            ↑
                          </button>
                          <button
                            onClick={() => handleMove(item, 'down')}
                            disabled={item.id === lastActiveId}
                            className="p-1 text-gray-500 hover:text-[#FF5A3C] disabled:opacity-20 disabled:cursor-not-allowed leading-none transition-colors"
                            aria-label="Przesuń w dół"
                          >
                            ↓
                          </button>
                        </div>
                      )}
                    </div>
                  </td>

                  <td
                    className={`px-4 py-3 text-sm font-medium${item.is_archived ? ' text-gray-500' : ' text-gray-900'}`}
                  >
                    {item.name}
                  </td>

                  <td
                    className={`px-4 py-3 text-sm${item.is_archived ? ' text-gray-400' : ' text-gray-600'}`}
                  >
                    {formatDaysOffset(item.default_days_offset)}
                  </td>

                  <td className="px-4 py-3 text-sm">
                    <button
                      onClick={() => openEdit(item)}
                      className="text-[#FF5A3C] hover:underline mr-4"
                    >
                      Edytuj
                    </button>
                    {item.is_archived ? (
                      <button
                        onClick={() => handleRestore(item)}
                        className="text-gray-600 hover:underline"
                      >
                        Przywroc
                      </button>
                    ) : (
                      <button
                        onClick={() => handleArchive(item)}
                        className="text-gray-600 hover:underline"
                      >
                        Archiwizuj
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Modal */}
      {modalOpen && (
        <EtapModal item={editingItem} onClose={closeModal} onSaved={handleSaved} />
      )}
    </div>
  );
}
