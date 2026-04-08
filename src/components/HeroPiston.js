'use client';

import { useEffect, useRef, memo } from 'react';

/**
 * HeroPiston — Direct scroll-synced "piston" collapse for the Hero.
 *
 * ═══════════════════════════════════════════════════════════════════
 *  TOMORROW-HEADER GATED VERSION (2026-04-08)
 *
 *  The Hero stays locked open at 100% while the user is viewing
 *  "Today" events. Collapse only begins once the SECOND date header
 *  (i.e. "Tomorrow") reaches the top of the viewport minus a
 *  search-bar buffer.
 *
 *  How it works:
 *    1. On mount, measure the Hero's natural height.
 *    2. On every scroll frame (rAF-throttled):
 *       a. Find the 2nd [data-date-header] inside the scroll
 *          container. Its offsetTop minus an 80px buffer = threshold.
 *       b. If no 2nd header found, fallback threshold = 50px.
 *       c. If scrollTop < threshold → Hero stays fully open (0 / 1fr).
 *       d. If scrollTop >= threshold → proportional 1:1 mapping over
 *          the next COLLAPSE_RANGE (150px) of scrolling.
 *    3. Inject two CSS custom properties on the wrapper DOM node
 *       via ref (no React re-render, no setState):
 *         --piston-ty:   -ratio * 100   (% for translateY)
 *         --piston-rows:  1 - ratio      (fr for grid row)
 *    4. CSS picks them up:
 *         transform: translateY(calc(var(--piston-ty) * 1%))
 *         grid-template-rows: var(--piston-rows, 1fr)
 *
 *  Performance:
 *    - Zero React re-renders during scroll (ref + CSS variables only)
 *    - rAF throttle ensures max one DOM write per frame
 *    - will-change: transform for GPU compositor layer
 *    - No transitions — scroll IS the animation
 *    - Header lookup is a fast querySelectorAll on every frame; the
 *      DOM list is tiny (typically 2-5 headers).
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

    // ── Constants ──
    const SEARCH_BAR_BUFFER = 80;  // px reserved for search bar / sticky chrome
    const COLLAPSE_RANGE    = 150; // px of scrolling over which collapse occurs
    const FALLBACK_THRESHOLD = 50; // px if no 2nd header exists

    // ── Scroll handler: rAF-throttled, zero React re-renders ──
    const onScroll = () => {
      if (rafPending.current) return;
      rafPending.current = true;

      requestAnimationFrame(() => {
        rafPending.current = false;

        const scrollY = scrollEl.scrollTop;

        // ── Find the "tomorrow" gate ──
        // Look for the 2nd [data-date-header] inside the scroll container.
        const headers = scrollEl.querySelectorAll('[data-date-header]');
        let threshold;
        if (headers.length >= 2) {
          // offsetTop is relative to offsetParent; we need distance from
          // the top of the scroll container's content.
          threshold = headers[1].offsetTop - SEARCH_BAR_BUFFER;
        } else {
          // Fallback: few events, no 2nd header — use simple threshold
          threshold = FALLBACK_THRESHOLD;
        }

        // ── Gate: Hero stays fully open until threshold ──
        if (scrollY < threshold) {
          grid.style.setProperty('--piston-ty', '0');
          grid.style.setProperty('--piston-rows', '1fr');
          return;
        }

        // ── Proportional collapse over COLLAPSE_RANGE px ──
        const progress = scrollY - threshold; // 0 → COLLAPSE_RANGE
        const ratio = clamp(progress / COLLAPSE_RANGE, 0, 1);

        // Direct DOM mutation — bypasses React for 60fps performance
        // translateY: 0% at threshold, -100% when fully collapsed
        grid.style.setProperty('--piston-ty', `${-ratio * 100}`);
        // grid row: 1fr at threshold, 0fr when fully collapsed
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
