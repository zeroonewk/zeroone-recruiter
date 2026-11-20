'use client';

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

// Wspolny mechanizm dymkow (InfoTip, HoverCard):
// - dymek w portalu z position: fixed — nie ucina go overflow kontenerow
// - pozycja przycinana do krawedzi ekranu (EDGE px), otwiera sie w gore lub w dol wg miejsca
// - align: 'center' | 'start' | 'end' ('end' = otwiera sie w lewo, dla ostatnich kolumn)
// - desktop: hover / focus; mobile: tap przypina/odpina; tap poza dymkiem, Escape,
//   scroll strony lub resize zamykaja

export type FloatAlign = 'center' | 'start' | 'end';

const GAP = 8;
const EDGE = 8;
const HOVER_CLOSE_DELAY = 120; // ms — pozwala przejechac myszka z triggera na dymek

type Pos = { top: number; left: number; width: number; arrow: number; placement: 'top' | 'bottom' };

export default function Floating({
  content,
  children,
  align = 'center',
  width = 260,
  label,
  triggerClassName,
  panelClassName,
  arrow = false,
  role = 'tooltip',
}: {
  content: ReactNode;
  children: ReactNode;          // zawartosc triggera (przycisku)
  align?: FloatAlign;
  width?: number;               // maksymalna szerokosc dymku (px)
  label?: string;               // aria-label triggera
  triggerClassName?: string;
  panelClassName?: string;
  arrow?: boolean;              // ciemna strzalka (dla ciemnego dymku InfoTip)
  role?: 'tooltip' | 'dialog';
}) {
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [pos, setPos] = useState<Pos | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const id = useId();

  const cancelClose = () => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  };

  const close = useCallback(() => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = null;
    setOpen(false);
    setPinned(false);
    setPos(null);
  }, []);

  const scheduleClose = () => {
    if (pinned) return;
    cancelClose();
    closeTimer.current = setTimeout(() => {
      setOpen(false);
      setPos(null);
    }, HOVER_CLOSE_DELAY);
  };

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    const r = triggerRef.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const w = Math.min(width, vw - 2 * EDGE);
    const h = panelRef.current?.offsetHeight ?? 0;

    let left =
      align === 'start' ? r.left - 12 :
      align === 'end' ? r.right - w + 12 :
      r.left + r.width / 2 - w / 2;
    left = Math.max(EDGE, Math.min(left, vw - w - EDGE));

    const spaceAbove = r.top - GAP - EDGE;
    const spaceBelow = vh - r.bottom - GAP - EDGE;
    const placement: Pos['placement'] = h <= spaceAbove || spaceAbove >= spaceBelow ? 'top' : 'bottom';
    const top = placement === 'top' ? Math.max(EDGE, r.top - h - GAP) : r.bottom + GAP;
    const arrow = Math.max(10, Math.min(r.left + r.width / 2 - left, w - 10));
    setPos({ top, left, width: w, arrow, placement });
  }, [open, align, width, content]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t) || panelRef.current?.contains(t)) return;
      close();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    // Przewijanie wnetrza dymku nie zamyka go; przewijanie strony — tak.
    const onScroll = (e: Event) => {
      if (panelRef.current && e.target instanceof Node && panelRef.current.contains(e.target)) return;
      close();
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', close);
    };
  }, [open, close]);

  useEffect(() => () => { if (closeTimer.current) clearTimeout(closeTimer.current); }, []);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label={label}
        aria-describedby={open && role === 'tooltip' ? id : undefined}
        aria-controls={open && role === 'dialog' ? id : undefined}
        aria-expanded={open}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          cancelClose();
          if (pinned) close();
          else { setPinned(true); setOpen(true); }
        }}
        onMouseEnter={() => { cancelClose(); setOpen(true); }}
        onMouseLeave={scheduleClose}
        onFocus={() => setOpen(true)}
        onBlur={() => { if (!pinned) { setOpen(false); setPos(null); } }}
        className={triggerClassName}
      >
        {children}
      </button>
      {open &&
        createPortal(
          <div
            ref={panelRef}
            id={id}
            role={role}
            onMouseEnter={cancelClose}
            onMouseLeave={scheduleClose}
            style={{
              position: 'fixed',
              top: pos?.top ?? -9999,
              left: pos?.left ?? -9999,
              width: pos?.width ?? width,
              visibility: pos ? 'visible' : 'hidden',
            }}
            className={`z-[1000] whitespace-normal break-words text-left normal-case tracking-normal font-normal ${panelClassName ?? ''}`}
          >
            {content}
            {pos && arrow && (
              <span
                className={`absolute -translate-x-1/2 border-4 border-transparent ${
                  pos.placement === 'top' ? 'top-full border-t-gray-900' : 'bottom-full border-b-gray-900'
                }`}
                style={{ left: pos.arrow }}
              />
            )}
          </div>,
          document.body
        )}
    </>
  );
}
