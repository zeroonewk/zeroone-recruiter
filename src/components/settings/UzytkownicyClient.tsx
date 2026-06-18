'use client';

import { useState } from 'react';

export type User = {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'recruiter';
  is_active: boolean;
  is_external: boolean;
  created_at: string;
  updated_at: string;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ROLE_LABELS: Record<string, string> = { admin: 'Admin', recruiter: 'Rekruter' };

// ─── User modal (add / edit) ──────────────────────────────────────────────────

type UserModalProps = {
  user: User | null;
  currentUserId: string;
  onClose: () => void;
  onSaved: () => void;
};

function UserModal({ user, currentUserId, onClose, onSaved }: UserModalProps) {
  const isEdit = user !== null;
  const [email, setEmail] = useState(user?.email ?? '');
  const [name, setName] = useState(user?.name ?? '');
  const [role, setRole] = useState<'admin' | 'recruiter'>(user?.role ?? 'recruiter');
  const [isExternal, setIsExternal] = useState(user?.is_external ?? false);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const isSelf = isEdit && user.id === currentUserId;

  const isDisabled =
    loading ||
    name.trim().length < 2 ||
    !EMAIL_RE.test(email.trim()) ||
    (!isEdit && (password.length < 8 || password !== confirmPassword));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isEdit && password !== confirmPassword) {
      setError('Hasla nie sa identyczne');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const url = isEdit ? `/api/uzytkownicy/${user.id}` : '/api/uzytkownicy';
      const method = isEdit ? 'PATCH' : 'POST';
      const payload: Record<string, unknown> = {
        email: email.trim().toLowerCase(),
        name: name.trim(),
        role,
        is_external: isExternal,
      };
      if (!isEdit) payload.password = password;

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
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
          {isEdit ? 'Edytuj uzytkownika' : 'Dodaj uzytkownika'}
        </h2>

        <form onSubmit={handleSubmit} noValidate>
          <div className="mb-4">
            <label htmlFor="u-email" className="block text-sm font-medium text-gray-700 mb-1">
              Email
            </label>
            <input
              id="u-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#FF5A3C] focus:border-transparent"
            />
          </div>

          <div className="mb-4">
            <label htmlFor="u-name" className="block text-sm font-medium text-gray-700 mb-1">
              Imie i nazwisko
            </label>
            <input
              id="u-name"
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#FF5A3C] focus:border-transparent"
            />
          </div>

          <div className="mb-4">
            <label htmlFor="u-role" className="block text-sm font-medium text-gray-700 mb-1">
              Rola
            </label>
            <select
              id="u-role"
              value={role}
              onChange={(e) => setRole(e.target.value as 'admin' | 'recruiter')}
              disabled={isSelf}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#FF5A3C] focus:border-transparent disabled:bg-gray-50 disabled:text-gray-500"
            >
              <option value="recruiter">Rekruter</option>
              <option value="admin">Admin</option>
            </select>
            {isSelf && (
              <p className="mt-1 text-xs text-gray-500">Nie mozesz zmienic wlasnej roli.</p>
            )}
          </div>

          <div className="mb-4">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={isExternal}
                onChange={(e) => setIsExternal(e.target.checked)}
                className="w-4 h-4 accent-[#FF5A3C]"
              />
              <span className="text-sm text-gray-700">
                Freelancer (zewnetrzny wspolpracownik)
              </span>
            </label>
          </div>

          {!isEdit && (
            <>
              <div className="mb-4">
                <label htmlFor="u-pass" className="block text-sm font-medium text-gray-700 mb-1">
                  Haslo
                </label>
                <input
                  id="u-pass"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#FF5A3C] focus:border-transparent"
                />
                <p className="mt-1 text-xs text-gray-500">Minimum 8 znakow.</p>
              </div>

              <div className="mb-4">
                <label
                  htmlFor="u-pass2"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  Powtorz haslo
                </label>
                <input
                  id="u-pass2"
                  type="password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#FF5A3C] focus:border-transparent"
                />
              </div>
            </>
          )}

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

// ─── Password modal ───────────────────────────────────────────────────────────

type PasswordModalProps = {
  user: User;
  onClose: () => void;
  onSaved: () => void;
};

function PasswordModal({ user, onClose, onSaved }: PasswordModalProps) {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const isDisabled =
    loading || newPassword.length < 8 || newPassword !== confirmPassword;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      setError('Hasla nie sa identyczne');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const res = await fetch(`/api/uzytkownicy/${user.id}/haslo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ new_password: newPassword }),
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
        <h2 className="text-lg font-bold text-gray-900 mb-1">Zmien haslo</h2>
        <p className="text-sm text-gray-600 mb-4">{user.name}</p>

        <form onSubmit={handleSubmit} noValidate>
          <div className="mb-4">
            <label htmlFor="p-new" className="block text-sm font-medium text-gray-700 mb-1">
              Haslo
            </label>
            <input
              id="p-new"
              type="password"
              required
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#FF5A3C] focus:border-transparent"
            />
            <p className="mt-1 text-xs text-gray-500">Minimum 8 znakow.</p>
          </div>

          <div className="mb-4">
            <label htmlFor="p-confirm" className="block text-sm font-medium text-gray-700 mb-1">
              Powtorz haslo
            </label>
            <input
              id="p-confirm"
              type="password"
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#FF5A3C] focus:border-transparent"
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

type Props = { initialItems: User[]; currentUserId: string };

export default function UzytkownicyClient({ initialItems, currentUserId }: Props) {
  const [items, setItems] = useState<User[]>(initialItems);
  const [loading, setLoading] = useState(false);
  const [userModalOpen, setUserModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [passwordModalUser, setPasswordModalUser] = useState<User | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function fetchItems() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/uzytkownicy');
      const data = (await res.json()) as { ok: boolean; items?: User[]; error?: string };
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
    setEditingUser(null);
    setUserModalOpen(true);
  }

  function openEdit(user: User) {
    setEditingUser(user);
    setUserModalOpen(true);
  }

  function closeUserModal() {
    setUserModalOpen(false);
    setEditingUser(null);
  }

  async function handleUserSaved() {
    closeUserModal();
    await fetchItems();
  }

  async function handlePasswordSaved() {
    setPasswordModalUser(null);
  }

  async function handleDeactivate(user: User) {
    if (!confirm(`Dezaktywowac uzytkownika "${user.name}"?`)) return;
    setError(null);
    try {
      const res = await fetch(`/api/uzytkownicy/${user.id}`, { method: 'DELETE' });
      const data = (await res.json()) as { ok: boolean; error?: string };
      if (data.ok) {
        await fetchItems();
      } else {
        setError(data.error ?? 'Blad dezaktywacji');
      }
    } catch {
      setError('Blad polaczenia z serwerem');
    }
  }

  async function handleActivate(user: User) {
    setError(null);
    try {
      const res = await fetch(`/api/uzytkownicy/${user.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: true }),
      });
      const data = (await res.json()) as { ok: boolean; error?: string };
      if (data.ok) {
        await fetchItems();
      } else {
        setError(data.error ?? 'Blad aktywacji');
      }
    } catch {
      setError('Blad polaczenia z serwerem');
    }
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Uzytkownicy</h1>
        <button
          onClick={openAdd}
          className="px-4 py-2 bg-[#FF5A3C] hover:bg-[#E64428] text-white text-sm font-medium rounded-md transition-colors"
        >
          Dodaj uzytkownika
        </button>
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
                Imie i nazwisko
              </th>
              <th className="text-left px-4 py-3 text-xs uppercase tracking-wider text-gray-600 font-medium">
                Email
              </th>
              <th className="text-left px-4 py-3 text-xs uppercase tracking-wider text-gray-600 font-medium">
                Rola
              </th>
              <th className="text-left px-4 py-3 text-xs uppercase tracking-wider text-gray-600 font-medium">
                Status
              </th>
              <th className="text-left px-4 py-3 text-xs uppercase tracking-wider text-gray-600 font-medium">
                Akcje
              </th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-gray-500 text-sm">
                  Ladowanie...
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-gray-500 text-sm">
                  Brak uzytkownikow.
                </td>
              </tr>
            ) : (
              items.map((user) => {
                const isSelf = user.id === currentUserId;
                return (
                  <tr
                    key={user.id}
                    className={`border-t border-gray-100 hover:bg-gray-50 transition-colors${!user.is_active ? ' bg-gray-50' : ''}`}
                  >
                    <td className="px-4 py-3 text-sm">
                      <span className={`font-medium${!user.is_active ? ' text-gray-500' : ' text-gray-900'}`}>
                        {user.name}
                      </span>
                      {isSelf && (
                        <span className="ml-2 text-xs text-gray-400">(to Ty)</span>
                      )}
                      {user.is_external && (
                        <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-blue-50 text-blue-700">
                          Freelancer
                        </span>
                      )}
                    </td>
                    <td className={`px-4 py-3 text-sm${!user.is_active ? ' text-gray-400' : ' text-gray-600'}`}>
                      {user.email}
                    </td>
                    <td className={`px-4 py-3 text-sm${!user.is_active ? ' text-gray-400' : ' text-gray-600'}`}>
                      {ROLE_LABELS[user.role] ?? user.role}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {user.is_active ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-50 text-green-700">
                          Aktywny
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-600">
                          Nieaktywny
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <button
                        onClick={() => openEdit(user)}
                        className="text-[#FF5A3C] hover:underline mr-3"
                      >
                        Edytuj
                      </button>
                      <button
                        onClick={() => setPasswordModalUser(user)}
                        className="text-gray-600 hover:underline mr-3"
                      >
                        Zmien haslo
                      </button>
                      {user.is_active ? (
                        <button
                          onClick={() => handleDeactivate(user)}
                          disabled={isSelf}
                          className="text-gray-600 hover:underline disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                          Dezaktywuj
                        </button>
                      ) : (
                        <button
                          onClick={() => handleActivate(user)}
                          className="text-gray-600 hover:underline"
                        >
                          Aktywuj
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* User modal */}
      {userModalOpen && (
        <UserModal
          user={editingUser}
          currentUserId={currentUserId}
          onClose={closeUserModal}
          onSaved={handleUserSaved}
        />
      )}

      {/* Password modal */}
      {passwordModalUser !== null && (
        <PasswordModal
          user={passwordModalUser}
          onClose={() => setPasswordModalUser(null)}
          onSaved={handlePasswordSaved}
        />
      )}
    </div>
  );
}
