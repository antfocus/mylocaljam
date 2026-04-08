'use client';

import { useEffect, useRef, memo } from 'react';

/**
 * HeroPiston — Direct scroll-synced "piston" collapse for the Hero.
 *
 * ═══════════════════════════════════════════════════════════════════
 *  1:1 LINEAR TRACKING VERSION (2026-04-08)
 *
 *  The Hero slides up at exactly the speed of the user's thumb.
 *  No easing, no transitions, no percentage math — pure pixels.
 *
 *  Previous versions used `translateY(calc(var * 1%))` which
 *  produced non-linear movement: as the wrapper height shrank,
 *  1% represented fewer pixels, making the end of the collapse
 *  feel faster than the beginning.
 *
 *  This version:
 *    - Computes an exact pixel offset for translate3d.
 *    - Rounds to whole pixels (Math.round) to prevent sub-pixel
 *      jitter / vibration.
 *    - Uses NO CSS transitions on the wrapper or inner div.
 *    - rAF fires immediately on every scroll event.
 *    - The mapping is strictly linear:
 *        progress = max(0, scrollTop - THRESHOLD)
 *        ratio    = min(progress / COLLAPSE_RANGE, 1)
 *        offsetPx = round(ratio * heroHeight)
 *        heightPx = round(heroHeight - offsetPx)
 *
 *  Scroll behavior:
 *    - 0–100px: Hero fully visible (premium delay).
 *    - 100–300px: Hero slides up 1:1 with scroll.
 *    - 300px+: Hero fully hidden, 0px tall.
 *    - Scroll back: tracks back identically.
 *
 *  Performance:
 *    - Zero React re-renders (ref + direct style mutation)
 *    - rAF throttle — max one DOM write per frame
 *    - translate3d(0, px, 0) — GPU compositor, no layout/paint
 *    - will-change: transform, height on wrapper
 *    - No CSS transitions anywhere — scroll IS the animation
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

// ── Memoized inner wrapper ──────────────────────────────────────────────
const HeroContent = memo(function HeroContent({ children }) {
  return children;
});
HeroContent.displayName = 'HeroContent';

// ── Component ───────────────────────────────────────────────────────────

export default function HeroPiston({ children }) {
  const anchorRef = useRef(null);
  const wrapperRef = useRef(null);
  const innerRef = useRef(null);
  const heroHeight = useRef(0);
  const rafPending = useRef(false);

  useEffect(() => {
    const anchor = anchorRef.current;
    const wrapper = wrapperRef.current;
    const inner = innerRef.current;
    if (!anchor || !wrapper || !inner) return;

    // ── Constants ──
    const THRESHOLD      = 100; // px of free scroll before collapse starts
    const COLLAPSE_RANGE = 200; // px over which the hero fully collapses

    // ── Measure hero height ──
    const measure = () => {
      const h = inner.scrollHeight || 260;
      heroHeight.current = h;
      // Reset to full height on re-measure
      wrapper.style.height = h + 'px';
      inner.style.transform = 'translate3d(0, 0px, 0)';
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

        const scrollY = scrollEl.scrollTop;
        const h = heroHeight.current;
        if (h <= 0) return;

        // ── Below threshold: fully open ──
        if (scrollY <= THRESHOLD) {
          wrapper.style.height = h + 'px';
          inner.style.transform = 'translate3d(0, 0px, 0)';
          return;
        }

        // ── Linear mapping — strictly no easing ──
        const progress = Math.max(0, scrollY - THRESHOLD);
        const ratio = Math.min(progress / COLLAPSE_RANGE, 1);

        // Pixel offset: how many px to slide the hero upward.
        // Math.round prevents sub-pixel jitter.
        const offsetPx = Math.round(ratio * h);
        const visiblePx = h - offsetPx;

        // Direct style mutation — no CSS variables, no transitions
        inner.style.transform = 'translate3d(0, -' + offsetPx + 'px, 0)';
        wrapper.style.height = visiblePx + 'px';
      });
    };

    // Initial position (handles mid-scroll page load)
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

      {/* Wrapper: fixed-height container, overflow clips content.
          Height set directly in px by scroll handler — no CSS variables.
          No transition property — scroll IS the animation. */}
      <div
        ref={wrapperRef}
        style={{
          position: 'relative',
          zIndex: 1,
          overflow: 'hidden',
          willChange: 'height',
        }}
      >
        {/* Inner: translate3d in pixels for GPU-only movement.
            No transition — rAF drives position every frame. */}
        <div
          ref={innerRef}
          style={{
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
