'use client';

export default function LogoutButton() {
  async function handleLogout() {
    await fetch('/api/wyloguj', { method: 'POST' });
    window.location.href = '/zaloguj';
  }

  return (
    <button
      onClick={handleLogout}
      className="text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors"
    >
      Wyloguj
    </button>
  );
}
