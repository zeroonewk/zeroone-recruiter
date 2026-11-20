'use client';

import type { ReactNode } from 'react';
import Floating, { type FloatAlign } from '@/components/ui/Floating';

// Liczba z jasnym dymkiem szczegolow (lista pozycji). Pozycjonowanie wspolne z InfoTip (Floating).
// Gdy disabled (np. liczba 0) — zwykly tekst, bez dymku i bez stylu klikalnego.

export default function HoverCard({
  children,
  content,
  label,
  align = 'center',
  width = 340,
  disabled = false,
}: {
  children: ReactNode;
  content: ReactNode;
  label: string;
  align?: FloatAlign;
  width?: number;
  disabled?: boolean;
}) {
  if (disabled) return <span>{children}</span>;
  return (
    <Floating
      content={content}
      align={align}
      width={width}
      label={label}
      role="dialog"
      triggerClassName="tabular-nums underline decoration-dotted decoration-gray-400 underline-offset-4 cursor-help hover:decoration-gray-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#FF5A3C] rounded-sm"
      panelClassName="bg-white border border-gray-200 rounded-lg shadow-lg text-xs text-gray-700"
    >
      {children}
    </Floating>
  );
}
