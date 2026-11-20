'use client';

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

// Ikona "i" z dymkiem. Dymek renderowany w portalu (position: fixed), wiec nie jest
// ucinany przez overflow kontenerow; pozycja przycinana do krawedzi ekranu.
// Desktop: hover/focus. Mobile: tap otwiera/zamyka, tap poza dymkiem zamyka.

type Align = 'center' | 'start' | 'end';

const TIP_WIDTH = 260;
const GAP = 8;
const EDGE = 8;

export default function InfoTip({ text, align = 'center' }: { text: string; align?: Align }) {
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false); // otwarty tapnieciem/kliknieciem
  const [pos, setPos] = useState<{ top: number; left: number; width: number; arrow: number; placement: 'top' | 'bottom' } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const tipRef = useRef<HTMLSpanElement>(null);
  const id = useId();

  const close = useCallback(() => {
    setOpen(false);
    setPinned(false);
  }, []);

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    const r = triggerRef.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const width = Math.min(TIP_WIDTH, vw - 2 * EDGE);
    const tipHeight = tipRef.current?.offsetHeight ?? 0;

    let left =
      align === 'start' ? r.left - 12 :
      align === 'end' ? r.right - width + 12 :
      r.left + r.width / 2 - width / 2;
    left = Math.max(EDGE, Math.min(left, vw - width - EDGE));

    const placement: 'top' | 'bottom' = r.top - tipHeight - GAP < EDGE ? 'bottom' : 'top';
    const top = placement === 'top' ? r.top - tipHeight - GAP : r.bottom + GAP;
    const arrow = Math.max(10, Math.min(r.left + r.width / 2 - left, width - 10));
    setPos({ top, left, width, arrow, placement });
  }, [open, align, text]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t) || tipRef.current?.contains(t)) return;
      close();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [open, close]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label={text}
        aria-describedby={open ? id : undefined}
        aria-expanded={open}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (pinned) close();
          else { setPinned(true); setOpen(true); }
        }}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => { if (!pinned) setOpen(false); }}
        onFocus={() => setOpen(true)}
        onBlur={() => { if (!pinned) setOpen(false); }}
        className="inline-flex items-center justify-center w-4 h-4 min-w-4 ml-1.5 align-[-0.15em] rounded-full text-gray-500 hover:text-gray-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#FF5A3C] cursor-help normal-case tracking-normal"
      >
        <svg viewBox="0 0 16 16" width="16" height="16" fill="none" aria-hidden="true">
          <circle cx="8" cy="8" r="7.25" stroke="currentColor" strokeWidth="1.5" />
          <path d="M8 7v4.25" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          <circle cx="8" cy="4.75" r="0.95" fill="currentColor" />
        </svg>
      </button>
      {open &&
        createPortal(
          <span
            ref={tipRef}
            id={id}
            role="tooltip"
            style={{
              position: 'fixed',
              top: pos?.top ?? -9999,
              left: pos?.left ?? -9999,
              width: pos?.width ?? TIP_WIDTH,
              visibility: pos ? 'visible' : 'hidden',
            }}
            className="z-[1000] px-3 py-2 bg-gray-900 text-white text-xs font-normal normal-case tracking-normal leading-relaxed rounded-md shadow-lg whitespace-normal break-words text-left"
          >
            {text}
            {pos && (
              <span
                className={`absolute -translate-x-1/2 border-4 border-transparent ${
                  pos.placement === 'top' ? 'top-full border-t-gray-900' : 'bottom-full border-b-gray-900'
                }`}
                style={{ left: pos.arrow }}
              />
            )}
          </span>,
          document.body
        )}
    </>
  );
}
