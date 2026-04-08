'use client';

import { useEffect, useRef, memo } from 'react';

/**
 * HeroPiston — Direct scroll-synced "piston" collapse for the Hero.
 *
 * ═══════════════════════════════════════════════════════════════════
 *  STABILITY-FIRST VERSION (2026-04-08)
 *
 *  Previous versions used grid-template-rows to reclaim vertical
 *  space as the Hero collapsed. This caused layout shifts: the
 *  total scrollable height changed mid-scroll, the browser
 *  compensated by adjusting scrollTop, and the page "jumped."
 *
 *  This version uses a fundamentally different approach:
 *    - The Hero wrapper has a FIXED height (measured once on mount).
 *    - Collapse is purely visual: translate3d moves the content
 *      upward and a clip (overflow: hidden) hides it.
 *    - The wrapper's height animates with a CSS variable so content
 *      below can reclaim space WITHOUT reflowing.
 *    - Because translate3d is compositor-only and the height is
 *      driven by a CSS variable on a single element, this avoids
 *      the multi-element reflow that caused the jump.
 *
 *  Scroll behavior:
 *    - 0–100px: Hero stays fully visible (premium delay).
 *    - 100–300px: Hero slides up proportionally (200px range).
 *    - 300px+: Hero fully hidden, 0px tall.
 *    - Scroll back: tracks back identically.
 *
 *  Performance:
 *    - Zero React re-renders (ref + CSS variable injection only)
 *    - rAF throttle — max one DOM write per frame
 *    - translate3d — GPU compositor layer, no layout/paint
 *    - will-change: transform, height for compositor promotion
 *
 *  CSS variable contract:
 *    --piston-ty:  0 → -100  (used in translate3d Y%)
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
    const COLLAPSE_RANGE = 200; // px of scrolling over which collapse occurs

    // ── Measure hero height and set the fixed wrapper height ──
    const measure = () => {
      const h = inner.scrollHeight || 260;
      heroHeight.current = h;
      wrapper.style.setProperty('--piston-h', `${h}px`);
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
          wrapper.style.setProperty('--piston-ty', '0');
          wrapper.style.setProperty('--piston-h', `${h}px`);
          return;
        }

        // ── Proportional collapse over COLLAPSE_RANGE ──
        const progress = scrollY - THRESHOLD;
        const ratio = clamp(progress / COLLAPSE_RANGE, 0, 1);

        // translate3d: slide content upward (GPU-only, no layout)
        wrapper.style.setProperty('--piston-ty', `${-ratio * 100}`);
        // Height: shrink wrapper from full hero height → 0
        // This is a single-element height change on a non-grid div,
        // which is far cheaper than grid-template-rows reflow.
        const visibleH = h * (1 - ratio);
        wrapper.style.setProperty('--piston-h', `${visibleH}px`);
      });
    };

    // Initial position
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

      {/* Wrapper: fixed-height container that shrinks via CSS variable.
          overflow: hidden clips content as it translates upward.
          will-change promotes both transform AND height to GPU. */}
      <div
        ref={wrapperRef}
        style={{
          position: 'relative',
          zIndex: 1,
          overflow: 'hidden',
          height: 'var(--piston-h, auto)',
          willChange: 'transform, height',
          // CSS variables initialized (overwritten by scroll handler)
          '--piston-ty': '0',
          '--piston-h': 'auto',
        }}
      >
        {/* Inner: the actual hero content.
            translate3d for GPU-only upward movement.
            No layout changes — pure compositor work. */}
        <div
          ref={innerRef}
          style={{
            transform: 'translate3d(0, calc(var(--piston-ty) * 1%), 0)',
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
