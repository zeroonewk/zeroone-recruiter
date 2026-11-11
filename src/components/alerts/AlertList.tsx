'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { AlertLevel, ProjectAlert } from '@/lib/alerts-shared';

export const LEVEL_BADGE: Record<AlertLevel, { label: string; cls: string }> = {
  critical: { label: 'Krytyczne', cls: 'bg-red-100 text-red-700' },
  warning: { label: 'Ostrzezenie', cls: 'bg-orange-100 text-orange-700' },
  parallel: { label: 'W toku rownolegle', cls: 'bg-blue-100 text-blue-700' },
};

export function AlertBadge({ level }: { level: AlertLevel }) {
  const b = LEVEL_BADGE[level];
  return (
    <span className={`inline-flex shrink-0 px-2 py-0.5 rounded text-xs font-medium ${b.cls}`}>
      {b.label}
    </span>
  );
}

function AlertRow({ a }: { a: ProjectAlert }) {
  const stagesCount = a.level === 'parallel' ? a.parallel_stages : a.overdue_stages;
  return (
    <li className="flex items-start gap-3 text-sm py-2 border-t border-gray-100 first:border-t-0">
      <AlertBadge level={a.level} />
      <div className="min-w-0 flex-1">
        <Link
          href={`/projekty/${a.project_id}`}
          className="font-medium text-gray-900 hover:text-[#FF5A3C] truncate block"
        >
          {a.title}
        </Link>
        <p className="text-gray-500 truncate">
          {a.owner_name} · {a.client_name}
        </p>
        {a.reasons.length > 0 && (
          <p className="text-xs text-gray-600 mt-0.5">{a.reasons.join(' · ')}</p>
        )}
      </div>
      <span className="shrink-0 text-xs text-gray-500 whitespace-nowrap">
        {a.level === 'parallel' ? 'rownolegle' : 'po terminie'}: {stagesCount}
      </span>
    </li>
  );
}

type Props = {
  alerts: ProjectAlert[];
  emptyText?: string;
};

// Lista "Wymaga uwagi": najpierw krytyczne, potem ostrzezenia, na koncu
// "w toku rownolegle" (zwiniete domyslnie).
export default function AlertList({ alerts, emptyText = 'Brak projektow wymagajacych uwagi' }: Props) {
  const [showParallel, setShowParallel] = useState(false);

  const critical = alerts.filter((a) => a.level === 'critical');
  const warning = alerts.filter((a) => a.level === 'warning');
  const parallel = alerts.filter((a) => a.level === 'parallel');

  if (alerts.length === 0) {
    return <p className="text-sm text-gray-400">{emptyText}</p>;
  }

  return (
    <div className="space-y-4">
      {critical.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold text-red-700 mb-1">Krytyczne ({critical.length})</h4>
          <ul>
            {critical.map((a) => (
              <AlertRow key={a.project_id} a={a} />
            ))}
          </ul>
        </div>
      )}

      {warning.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold text-orange-700 mb-1">Ostrzezenia ({warning.length})</h4>
          <ul>
            {warning.map((a) => (
              <AlertRow key={a.project_id} a={a} />
            ))}
          </ul>
        </div>
      )}

      {parallel.length > 0 && (
        <div>
          <button
            type="button"
            onClick={() => setShowParallel((v) => !v)}
            className="text-sm font-semibold text-blue-700 hover:text-blue-900"
            aria-expanded={showParallel}
          >
            {showParallel ? '▾' : '▸'} W toku rownolegle ({parallel.length})
          </button>
          {showParallel && (
            <ul className="mt-1">
              {parallel.map((a) => (
                <AlertRow key={a.project_id} a={a} />
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
