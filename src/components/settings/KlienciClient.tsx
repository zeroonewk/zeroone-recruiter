'use client';

import { useState } from 'react';

export type Client = {
  id: string;
  name: string;
  notes: string | null;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
};

function formatDate(dateStr: string): string {
  return new Intl.DateTimeFormat('pl-PL').format(new Date(dateStr));
}

function truncate(str: string | null, max: number): string {
  if (!str) return '';
  return str.length > max ? str.slice(0, max) + '...' : str;
}

// ─── Modal ────────────────────────────────────────────────────────────────────

type ModalProps = {
  client: Client | null;
  onClose: () => void;
  onSaved: () => void;
};

function KlientModal({ client, onClose, onSaved }: ModalProps) {
  const [name, setName] = useState(client?.name ?? '');
  const [notes, setNotes] = useState(client?.notes ?? '');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const isEdit = client !== null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const url = client !== null ? `/api/klienci/${client.id}` : '/api/klienci';
      const method = client !== null ? 'PATCH' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          notes: notes.trim() || null,
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
          {isEdit ? 'Edytuj klienta' : 'Dodaj klienta'}
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
              htmlFor="modal-notes"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Notatki{' '}
              <span className="text-gray-400 font-normal">(opcjonalne)</span>
            </label>
            <textarea
              id="modal-notes"
              rows={4}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#FF5A3C] focus:border-transparent resize-none"
            />
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
              disabled={loading || name.trim().length < 2}
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

type Props = { initialItems: Client[] };

export default function KlienciClient({ initialItems }: Props) {
  const [items, setItems] = useState<Client[]>(initialItems);
  const [showArchived, setShowArchived] = useState(false);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function fetchItems(archived: boolean) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/klienci?archived=${archived}`);
      const data = (await res.json()) as { ok: boolean; items?: Client[]; error?: string };
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
    setEditingClient(null);
    setModalOpen(true);
  }

  function openEdit(client: Client) {
    setEditingClient(client);
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setEditingClient(null);
  }

  async function handleSaved() {
    closeModal();
    await fetchItems(showArchived);
  }

  async function handleArchive(client: Client) {
    if (!confirm(`Zarchiwizowac klienta "${client.name}"?`)) return;
    setError(null);
    try {
      const res = await fetch(`/api/klienci/${client.id}`, { method: 'DELETE' });
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

  async function handleRestore(client: Client) {
    setError(null);
    try {
      const res = await fetch(`/api/klienci/${client.id}`, {
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

  async function handleToggleArchived(checked: boolean) {
    setShowArchived(checked);
    await fetchItems(checked);
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Klienci</h1>
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
            Dodaj klienta
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
              <th className="text-left px-4 py-3 text-xs uppercase tracking-wider text-gray-600 font-medium">
                Nazwa
              </th>
              <th className="text-left px-4 py-3 text-xs uppercase tracking-wider text-gray-600 font-medium">
                Notatki
              </th>
              <th className="text-left px-4 py-3 text-xs uppercase tracking-wider text-gray-600 font-medium">
                Utworzono
              </th>
              <th className="text-left px-4 py-3 text-xs uppercase tracking-wider text-gray-600 font-medium">
                Akcje
              </th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td
                  colSpan={4}
                  className="px-4 py-8 text-center text-gray-500 text-sm"
                >
                  Ladowanie...
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td
                  colSpan={4}
                  className="px-4 py-8 text-center text-gray-500 text-sm"
                >
                  Brak klientow. Dodaj pierwszego klienta.
                </td>
              </tr>
            ) : (
              items.map((client) => (
                <tr
                  key={client.id}
                  className={`border-t border-gray-100 hover:bg-gray-50 transition-colors${client.is_archived ? ' bg-gray-50' : ''}`}
                >
                  <td
                    className={`px-4 py-3 text-sm font-medium${client.is_archived ? ' text-gray-500' : ' text-gray-900'}`}
                  >
                    {client.name}
                  </td>
                  <td
                    className={`px-4 py-3 text-sm${client.is_archived ? ' text-gray-400' : ' text-gray-600'}`}
                  >
                    {truncate(client.notes, 60)}
                  </td>
                  <td
                    className={`px-4 py-3 text-sm${client.is_archived ? ' text-gray-400' : ' text-gray-600'}`}
                  >
                    {formatDate(client.created_at)}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <button
                      onClick={() => openEdit(client)}
                      className="text-[#FF5A3C] hover:underline mr-4"
                    >
                      Edytuj
                    </button>
                    {client.is_archived ? (
                      <button
                        onClick={() => handleRestore(client)}
                        className="text-gray-600 hover:underline"
                      >
                        Przywroc
                      </button>
                    ) : (
                      <button
                        onClick={() => handleArchive(client)}
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
        <KlientModal
          client={editingClient}
          onClose={closeModal}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
}
