'use client';

import { useEffect, useRef, memo } from 'react';

/**
 * HeroPiston — Direct scroll-synced "piston" collapse for the Hero.
 *
 * ═══════════════════════════════════════════════════════════════════
 *  PROPORTIONAL TRACKING VERSION (2026-04-08)
 *
 *  This version removes all animated transitions and state-based
 *  thresholds. The Hero moves 1:1 with the user's scroll position.
 *  Move your thumb 1 inch → Hero moves 1 inch. It behaves like a
 *  physical part of the scroll list.
 *
 *  How it works:
 *    1. On mount, measure the Hero's natural height.
 *    2. On every scroll frame (rAF-throttled), compute:
 *         scrollRatio = clamp(scrollTop / heroHeight, 0, 1)
 *    3. Inject two CSS custom properties directly on the wrapper DOM
 *       node via ref (no React re-render, no setState):
 *         --piston-ty:   -scrollRatio * 100  (% for translateY)
 *         --piston-rows:  1 - scrollRatio     (fr for grid row)
 *    4. CSS picks them up:
 *         transform: translateY(calc(var(--piston-ty) * 1%))
 *         grid-template-rows: var(--piston-rows, 1fr)
 *    5. When scrollRatio hits 1, Hero is fully hidden and takes 0 space.
 *       When user scrolls back, it tracks back proportionally.
 *
 *  Performance:
 *    - Zero React re-renders during scroll (ref + CSS variables only)
 *    - rAF throttle ensures max one DOM write per frame
 *    - will-change: transform for GPU compositor layer
 *    - No transitions — scroll IS the animation
 *
 *  Layout:
 *    - Grid wrapper with dynamic row height handles space reclamation
 *    - overflow: hidden on inner div clips content during collapse
 *    - z-index 1 keeps Hero below date headers (z-index 50)
 *
 * Props:
 *   children — The <HeroSection /> component
 * ═══════════════════════════════════════════════════════════════════
 */

// ── Helpers ─────────────────────────────────────────────────────────────

/** Walk up the DOM to find the nearest scrollable ancestor. */
function getScrollParent(el) {
  let parent = el?.parentElement;
  while (parent) {
    const { overflowY } = getComputedStyle(parent);
    if (overflowY === 'auto' || overflowY === 'scroll') return parent;
    parent = parent.parentElement;
  }
  return null;
}

function clamp(val, min, max) {
  return Math.min(Math.max(val, min), max);
}

// ── Memoized inner wrapper ──────────────────────────────────────────────
// Prevents the HeroSection tree from re-rendering on parent updates.
const HeroContent = memo(function HeroContent({ children }) {
  return children;
});
HeroContent.displayName = 'HeroContent';

// ── Component ───────────────────────────────────────────────────────────

export default function HeroPiston({ children }) {
  const anchorRef = useRef(null);
  const gridRef = useRef(null);
  const innerRef = useRef(null);
  const heroHeight = useRef(0);
  const rafPending = useRef(false);

  useEffect(() => {
    const anchor = anchorRef.current;
    const grid = gridRef.current;
    const inner = innerRef.current;
    if (!anchor || !grid || !inner) return;

    // ── Measure hero height ──
    const measure = () => {
      // scrollHeight of the inner div = natural content height
      heroHeight.current = inner.scrollHeight || 260; // fallback to ~HeroSection min
    };
    measure();

    // ── Find scroll container ──
    const scrollEl = getScrollParent(anchor);
    if (!scrollEl) return;

    // ── Scroll handler: rAF-throttled, zero React re-renders ──
    const onScroll = () => {
      if (rafPending.current) return;
      rafPending.current = true;

      requestAnimationFrame(() => {
        rafPending.current = false;
        const h = heroHeight.current;
        if (h <= 0) return;

        const scrollY = scrollEl.scrollTop;
        const ratio = clamp(scrollY / h, 0, 1);

        // Direct DOM mutation — bypasses React for 60fps performance
        // translateY: 0% at top, -100% when fully scrolled past hero
        grid.style.setProperty('--piston-ty', `${-ratio * 100}`);
        // grid row: 1fr at top, 0fr when fully collapsed
        grid.style.setProperty('--piston-rows', `${1 - ratio}fr`);
      });
    };

    // Initial position (in case page loads mid-scroll)
    onScroll();

    scrollEl.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', measure, { passive: true });

    return () => {
      scrollEl.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', measure);
    };
  }, []); // single mount — all updates via DOM refs

  return (
    <>
      {/* Anchor: 1px div for getScrollParent() traversal */}
      <div
        ref={anchorRef}
        data-piston-anchor="true"
        style={{ height: '1px', width: '100%', flexShrink: 0 }}
      />

      {/* Grid wrapper: row height driven by --piston-rows CSS variable.
          No transitions — scroll IS the animation. */}
      <div
        ref={gridRef}
        style={{
          display: 'grid',
          gridTemplateRows: 'var(--piston-rows, 1fr)',
          position: 'relative',
          zIndex: 1,
          // CSS variables initialized (overwritten by scroll handler)
          '--piston-ty': '0',
          '--piston-rows': '1fr',
        }}
      >
        {/* Inner: overflow:hidden clips content as grid row shrinks.
            translateY driven by --piston-ty for the upward drift.
            GPU-promoted via will-change + translateZ. */}
        <div
          ref={innerRef}
          style={{
            overflow: 'hidden',
            transform: 'translateY(calc(var(--piston-ty) * 1%)) translateZ(0)',
            willChange: 'transform',
            backfaceVisibility: 'hidden',
            WebkitBackfaceVisibility: 'hidden',
          }}
        >
          <HeroContent>{children}</HeroContent>
        </div>
      </div>
    </>
  );
}
