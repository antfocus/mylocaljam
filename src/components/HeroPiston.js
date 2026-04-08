'use client';

import { useEffect, useRef, memo } from 'react';

/**
 * HeroPiston — Direct scroll-synced "piston" collapse for the Hero.
 *
 * ═══════════════════════════════════════════════════════════════════
 *  REFLOW-ARMORED 1:1 PIXEL TRACKING (2026-04-08)
 *
 *  50px of thumb movement = exactly 50px of hero movement.
 *  No ratio, no easing, no transitions, no reflow at the finish.
 *
 *  Reflow armor (fixes the "6730" jump at collapse end):
 *    1. 1px floor: wrapper never reaches 0px height. Keeps the
 *       element alive in layout so the browser doesn't recalculate
 *       the entire scroll flow when it "disappears."
 *    2. Opacity ghost: last 10px of collapse fades opacity 1→0.
 *       Even if there's a sub-pixel layout shift, the eye can't
 *       track it because the element is nearly invisible.
 *    3. CSS containment: `contain: layout paint` on the wrapper
 *       tells the browser that nothing inside this box can affect
 *       the position of siblings (date headers, event cards).
 *    4. overflow-anchor: none forced on BOTH the wrapper AND the
 *       scroll container via JS (CSS sometimes gets ignored).
 *
 *  Scroll behavior:
 *    - 0–10px: Hero fully visible (tiny buffer).
 *    - 10px → 10+heroHeight: slides up 1:1 with scroll.
 *    - At heroHeight: wrapper = 1px, opacity = 0.
 *    - Scroll back: tracks back identically, opacity restores.
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
    const THRESHOLD  = 10; // px of free scroll before collapse starts
    const FADE_ZONE  = 10; // last N px of collapse: opacity 1→0

    // ── Measure hero height ──
    const measure = () => {
      const h = inner.scrollHeight || 260;
      heroHeight.current = h;
      wrapper.style.height = h + 'px';
      inner.style.transform = 'translate3d(0, 0px, 0)';
      inner.style.opacity = '1';
    };
    measure();

    // ── Find scroll container ──
    const scrollEl = getScrollParent(anchor);
    if (!scrollEl) return;

    // ── Force overflow-anchor: none via JS on both elements ──
    // CSS property is sometimes ignored by the browser; direct
    // JS style injection is more reliable.
    wrapper.style.overflowAnchor = 'none';
    scrollEl.style.overflowAnchor = 'none';

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
          inner.style.opacity = '1';
          return;
        }

        // ── True 1:1 pixel mapping ──
        const moveY = Math.min(scrollY - THRESHOLD, h);
        const visibleH = h - moveY;

        // 1px floor: never let wrapper reach 0px.
        // Keeps the element "alive" in layout — prevents the
        // browser from reflowing the entire scroll container
        // when the element exits the flow.
        wrapper.style.height = Math.max(visibleH, 1) + 'px';

        inner.style.transform = 'translate3d(0, ' + (-moveY) + 'px, 0)';

        // Opacity ghost: fade out over the last FADE_ZONE px.
        // At visibleH = FADE_ZONE → opacity = 1
        // At visibleH = 0        → opacity = 0
        if (visibleH <= FADE_ZONE) {
          inner.style.opacity = '' + Math.max(visibleH / FADE_ZONE, 0);
        } else {
          inner.style.opacity = '1';
        }
      });
    };

    // Initial position
    onScroll();

    scrollEl.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', () => {
      measure();
      // Re-run scroll handler to reposition after resize
      onScroll();
    }, { passive: true });

    return () => {
      scrollEl.removeEventListener('scroll', onScroll);
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

      {/* Wrapper: contain: layout paint prevents internal changes from
          affecting siblings. overflow: hidden clips translated content.
          will-change: height, contents for GPU promotion. */}
      <div
        ref={wrapperRef}
        style={{
          position: 'relative',
          zIndex: 1,
          overflow: 'hidden',
          contain: 'layout paint',
          willChange: 'height, contents',
        }}
      >
        {/* Inner: translate3d in pixels, opacity for ghost fade. */}
        <div
          ref={innerRef}
          style={{
            willChange: 'transform, opacity',
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
