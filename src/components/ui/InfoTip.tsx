'use client';

import Floating, { type FloatAlign } from '@/components/ui/Floating';

// Ikona "i" z ciemnym dymkiem. Pozycjonowanie, portal i obsluga hover/tap — wspolne (Floating).

export default function InfoTip({ text, align = 'center' }: { text: string; align?: FloatAlign }) {
  return (
    <Floating
      content={text}
      align={align}
      width={260}
      label={text}
      arrow
      triggerClassName="inline-flex items-center justify-center w-4 h-4 min-w-4 ml-1.5 align-[-0.15em] rounded-full text-gray-500 hover:text-gray-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#FF5A3C] cursor-help normal-case tracking-normal"
      panelClassName="px-3 py-2 bg-gray-900 text-white text-xs leading-relaxed rounded-md shadow-lg"
    >
      <svg viewBox="0 0 16 16" width="16" height="16" fill="none" aria-hidden="true">
        <circle cx="8" cy="8" r="7.25" stroke="currentColor" strokeWidth="1.5" />
        <path d="M8 7v4.25" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        <circle cx="8" cy="4.75" r="0.95" fill="currentColor" />
      </svg>
    </Floating>
  );
}
