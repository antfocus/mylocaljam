'use client';

import { useEffect, useRef, memo } from 'react';

/**
 * HeroPiston — Direct scroll-synced "piston" collapse for the Hero.
 *
 * ═══════════════════════════════════════════════════════════════════
 *  STICKY-ANCHOR GATED VERSION (2026-04-08)
 *
 *  The Hero stays locked at 100% until the "Tomorrow" date header
 *  reaches the top of the screen. Then it collapses proportionally
 *  over 200px of scrolling with zero layout shift.
 *
 *  Key fixes over previous versions:
 *    - thresholdRef: The "Tomorrow" header's content-space position
 *      is measured ONCE and locked. This prevents the threshold from
 *      drifting as the Hero shrinks (which caused the "jump").
 *    - null fallback: If < 2 headers exist (data still loading, or
 *      only one day of events), threshold stays null → Hero stays
 *      100% open. No more 50px default causing premature collapse.
 *    - getBoundingClientRect + scrollTop: Produces a fixed "mile
 *      marker" in scroll-content space that doesn't shift with
 *      sticky positioning or nested offsetParents.
 *    - will-change on grid wrapper: Promotes the grid-template-rows
 *      animation to the GPU compositor layer.
 *
 *  CSS variable contract (unchanged):
 *    --piston-ty:    -ratio * 100  (% for translateY)
 *    --piston-rows:   1 - ratio    (fr for grid row)
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
  const thresholdRef = useRef(null); // locked "mile marker" — null until measured

  useEffect(() => {
    const anchor = anchorRef.current;
    const grid = gridRef.current;
    const inner = innerRef.current;
    if (!anchor || !grid || !inner) return;

    // ── Measure hero height ──
    const measure = () => {
      heroHeight.current = inner.scrollHeight || 260;
    };
    measure();

    // ── Find scroll container ──
    const scrollEl = getScrollParent(anchor);
    if (!scrollEl) return;

    // ── Constants ──
    const SEARCH_BAR_BUFFER = 80;  // px reserved for search bar / sticky chrome
    const COLLAPSE_RANGE    = 200; // px of scrolling over which collapse occurs

    // ── Debug throttle ──
    let debugLogCount = 0;
    const DEBUG_MAX_LOGS = 5;

    // ── Scroll handler: rAF-throttled, zero React re-renders ──
    const onScroll = () => {
      if (rafPending.current) return;
      rafPending.current = true;

      requestAnimationFrame(() => {
        rafPending.current = false;

        const scrollY = scrollEl.scrollTop;

        // ── Try to lock the threshold if we haven't yet ──
        if (thresholdRef.current === null) {
          const headers = scrollEl.querySelectorAll('[data-date-header]');

          if (headers.length >= 2) {
            // Fixed "mile marker": the header's visual position in
            // viewport space, converted to content-space by adding
            // how far the container has already scrolled.
            // This value is constant — it doesn't shift when the Hero
            // shrinks because it was measured BEFORE any collapse.
            const headerTop = headers[1].getBoundingClientRect().top;
            const milestone = headerTop + scrollY - SEARCH_BAR_BUFFER;
            thresholdRef.current = milestone;

            if (debugLogCount < DEBUG_MAX_LOGS) {
              console.log(
                '[HeroPiston] Threshold LOCKED.',
                'Headers found:', headers.length,
                '| Gate header:', headers[1].getAttribute('data-date-header'),
                '| headerTop (viewport):', Math.round(headerTop),
                '| scrollY:', Math.round(scrollY),
                '| milestone:', Math.round(milestone)
              );
              debugLogCount++;
            }
          } else {
            // Not enough headers yet — Hero stays fully open.
            if (debugLogCount < DEBUG_MAX_LOGS) {
              console.warn(
                '[HeroPiston] Waiting for 2nd date header. Found:',
                headers.length,
                '| Container:', scrollEl.tagName,
                scrollEl.className || '(no class)',
                '| Hero stays 100% open.'
              );
              debugLogCount++;
            }
            grid.style.setProperty('--piston-ty', '0');
            grid.style.setProperty('--piston-rows', '1fr');
            return;
          }
        }

        // ── Gate: Hero stays fully open until threshold ──
        const threshold = thresholdRef.current;
        if (scrollY < threshold) {
          grid.style.setProperty('--piston-ty', '0');
          grid.style.setProperty('--piston-rows', '1fr');
          return;
        }

        // ── Proportional collapse over COLLAPSE_RANGE px ──
        const progress = Math.max(0, scrollY - threshold);
        const ratio = clamp(progress / COLLAPSE_RANGE, 0, 1);

        grid.style.setProperty('--piston-ty', `${-ratio * 100}`);
        grid.style.setProperty('--piston-rows', `${1 - ratio}fr`);
      });
    };

    // Initial position (in case page loads mid-scroll)
    onScroll();

    scrollEl.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', () => {
      measure();
      // Unlock threshold so it re-measures after layout change
      thresholdRef.current = null;
    }, { passive: true });

    return () => {
      scrollEl.removeEventListener('scroll', onScroll);
      // resize listener is on window — cleaned up by component unmount
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
          No transitions — scroll IS the animation.
          will-change on both transform and grid-template-rows for GPU. */}
      <div
        ref={gridRef}
        style={{
          display: 'grid',
          gridTemplateRows: 'var(--piston-rows, 1fr)',
          position: 'relative',
          zIndex: 1,
          willChange: 'transform, grid-template-rows',
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
