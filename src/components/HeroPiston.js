'use client';

import { useEffect, useRef, memo } from 'react';

/**
 * HeroPiston — Direct scroll-synced "piston" collapse for the Hero.
 *
 * ═══════════════════════════════════════════════════════════════════
 *  TRUE 1:1 PIXEL TRACKING VERSION (2026-04-08)
 *
 *  50px of thumb movement = exactly 50px of hero movement.
 *  No ratio multiplication, no easing, no transitions.
 *
 *  The key insight: COLLAPSE_RANGE must equal heroHeight.
 *  Previous versions used a fixed 200px range against a ~260px
 *  hero. The ratio hit 1.0 after 200px of scroll, but the pixel
 *  offset was ratio * 260 = 260px — cramming the last 60px of
 *  visual movement into the final 40px of scroll. That's the
 *  "speeds up at the end" feeling.
 *
 *  This version eliminates the ratio entirely:
 *    moveY  = min(scrollTop - THRESHOLD, heroHeight)
 *    height = heroHeight - moveY
 *    transform = translate3d(0, -moveY px, 0)
 *
 *  1px of scroll past threshold = 1px of hero movement. Always.
 *
 *  Scroll behavior:
 *    - 0–10px: Hero fully visible (tiny buffer).
 *    - 10px → 10+heroHeight: Hero slides up 1:1 with scroll.
 *    - Beyond: Hero fully hidden, 0px tall.
 *    - Scroll back: tracks back identically.
 *
 *  Anti-jump:
 *    - overflow-anchor: none on wrapper prevents browser scroll
 *      anchoring from "helping" when height changes.
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
    const THRESHOLD = 10; // px of free scroll before collapse starts (tiny buffer)

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

    // ── Disable browser scroll anchoring on the wrapper ──
    // When the wrapper height shrinks, the browser may "help" by
    // adjusting scrollTop to keep content in place. This fights
    // our manual tracking and causes the late-stage speed-up / jump.
    wrapper.style.overflowAnchor = 'none';

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

        // ── True 1:1 pixel mapping — no ratio, no multiplication ──
        // moveY is clamped between 0 and heroHeight.
        // 1px of scroll past threshold = 1px of hero movement.
        const moveY = Math.min(scrollY - THRESHOLD, h);

        inner.style.transform = 'translate3d(0, ' + (-moveY) + 'px, 0)';
        wrapper.style.height = (h - moveY) + 'px';
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
