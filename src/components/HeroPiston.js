'use client';

import { useEffect, useRef, memo } from 'react';

/**
 * HeroPiston — Direct scroll-synced "piston" collapse for the Hero.
 *
 * ═══════════════════════════════════════════════════════════════════
 *  REFLOW-ARMORED 1:1 PIXEL TRACKING (2026-04-08, updated 2026-04-23b)
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
 *  Synchronous scroll handler (2026-04-23b):
 *    The rAF throttle on onScroll introduced a ~16ms lag between
 *    scrollTop and the applied wrapper height. On fast reverse-scrolls
 *    (flick up toward the hero), the wrapper stayed at its old
 *    collapsed height for a frame while the scroll had already moved
 *    back up — then snapped to the correct height on the next paint.
 *    That snap is the jump users saw above the first event card.
 *    Fix: apply styles synchronously in the scroll handler. The math
 *    is trivial and the browser batches style writes into paint; no
 *    reason to cost ourselves a frame of tracking latency.
 *
 *  Live height tracking (2026-04-23):
 *    Earlier versions measured `inner.scrollHeight` once synchronously
 *    at mount and never re-measured. In practice HeroSection hydrates
 *    with a skeleton (minHeight 220px) while events are still fetching,
 *    THEN re-renders with real slides (minHeight 240px). The stale
 *    220-px reading stuck, the wrapper clipped the bottom 20 px of
 *    real content forever, and the collapse ran out of scroll 20 px
 *    before the hero was actually off-screen — the dead zone user
 *    felt as a "jump" at the bottom of the collapse.
 *    Fix: ResizeObserver on the inner element keeps heroHeight honest
 *    through skeleton→real swaps, image loads, and any later content
 *    size changes. Initial measure is also deferred one frame so the
 *    first paint has settled before we read scrollHeight.
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

  useEffect(() => {
    const anchor = anchorRef.current;
    const wrapper = wrapperRef.current;
    const inner = innerRef.current;
    if (!anchor || !wrapper || !inner) return;

    // ── Constants ──
    const THRESHOLD  = 10; // px of free scroll before collapse starts
    const FADE_ZONE  = 10; // last N px of collapse: opacity 1→0

    // ── Find scroll container ──
    const scrollEl = getScrollParent(anchor);
    if (!scrollEl) return;

    // ── Force overflow-anchor: none via JS on both elements ──
    // CSS property is sometimes ignored by the browser; direct
    // JS style injection is more reliable.
    wrapper.style.overflowAnchor = 'none';
    scrollEl.style.overflowAnchor = 'none';

    // ── Apply collapse state for the CURRENT scrollTop + heroHeight ──
    // Extracted from onScroll so `measure` can re-apply after a
    // content-size change without waiting for the next scroll event.
    const applyScrollState = () => {
      const h = heroHeight.current;
      if (h <= 0) return;
      const scrollY = scrollEl.scrollTop;

      // Below threshold: fully open.
      if (scrollY <= THRESHOLD) {
        wrapper.style.height = h + 'px';
        inner.style.transform = 'translate3d(0, 0px, 0)';
        inner.style.opacity = '1';
        return;
      }

      // True 1:1 pixel mapping.
      const moveY = Math.min(scrollY - THRESHOLD, h);
      const visibleH = h - moveY;

      // 1px floor: never let wrapper reach 0px. Keeps the element
      // "alive" in layout so the scroll container doesn't reflow
      // when it visually exits.
      wrapper.style.height = Math.max(visibleH, 1) + 'px';
      inner.style.transform = 'translate3d(0, ' + (-moveY) + 'px, 0)';

      // Opacity ghost: fade over the last FADE_ZONE px.
      inner.style.opacity = visibleH <= FADE_ZONE
        ? String(Math.max(visibleH / FADE_ZONE, 0))
        : '1';
    };

    // ── Measure the inner content height ──
    // Called at mount, on window resize, and on any content-size
    // change observed via ResizeObserver. Skipping zero-height reads
    // prevents a pre-layout measurement from locking the height to 0.
    //
    // Past-zone guard (2026-05-02): once the user has scrolled clearly
    // past the hero, we still record the new heroHeight (so a future
    // scroll-back-up has accurate tracking) but we DON'T re-invoke
    // applyScrollState. Writing wrapper.style.height while the user
    // is mid-scroll, with overflow-anchor: none, can land as a visible
    // jump if the height delta is non-zero. The trigger is usually
    // the spotlight carousel auto-rotating to a slide whose inner
    // markup nudges scrollHeight by a pixel (font metrics, paint
    // rounding) — every 5 seconds, while the user is reading the feed.
    // Past the zone the wrapper is clamped to 1px regardless of h, so
    // skipping the apply call has no visible cost; the next scroll
    // event near the hero will pick up the fresh heroHeight.
    const measure = () => {
      const h = inner.scrollHeight;
      if (!h) return;              // pre-layout or unmounting — ignore
      if (h === heroHeight.current) return;  // no change — skip reflow
      heroHeight.current = h;

      const scrollY = scrollEl.scrollTop;
      // Only apply if the user is in or just past the collapse zone.
      // Safety pad of 50px keeps the apply alive during the
      // transition-end region in case mobile-Safari momentum scroll
      // overshoots past the threshold for a frame.
      const stillInOrNearZone = scrollY < (heroHeight.current + THRESHOLD + 50);
      if (stillInOrNearZone) {
        applyScrollState();
      }
    };

    // ── Scroll handler: SYNCHRONOUS, no rAF throttle ──
    // Earlier versions wrapped applyScrollState in rAF to batch multiple
    // scroll events into one paint. In practice that 1-frame delay
    // introduced a visible "catch-up" jump on fast scroll reversals:
    // during the gap between the last processed scrollTop and the next
    // scroll event triggering a new rAF (~16ms), the wrapper held its
    // stale height while the scroll had already moved. The next paint
    // snapped to the correct height — that's the jump users saw when
    // flicking up toward the hero.
    //
    // applyScrollState is pure math + three style writes; running it
    // synchronously on every scroll event (at most ~120/s on high-
    // refresh displays) is cheaper than one frame of jank. The browser
    // batches style writes into the next paint anyway.
    const onScroll = () => applyScrollState();

    // ── Initial measure: deferred one frame ──
    // A synchronous read during hydration often captures the skeleton
    // height (e.g. 220px) instead of the real slide height (240px),
    // because the events-loaded re-render hasn't committed yet. One
    // rAF of delay lets the first real paint settle. The ResizeObserver
    // below catches any further changes.
    let measureRaf = requestAnimationFrame(() => {
      measureRaf = 0;
      measure();
    });

    // Initial apply (with heroHeight still 0 this is a safe no-op;
    // the deferred measure above will fire applyScrollState once
    // heroHeight is populated).
    applyScrollState();

    scrollEl.addEventListener('scroll', onScroll, { passive: true });

    const onResize = () => measure();
    window.addEventListener('resize', onResize, { passive: true });

    // ── ResizeObserver: the real fix for the stale-height jump ──
    // Fires whenever the inner element changes size — covers:
    //   • skeleton → real-slide swap after events fetch
    //   • late image decode changing intrinsic size (no-op for our
    //     background-image approach, but cheap insurance)
    //   • auto-rotate to a slide with a different height (shouldn't
    //     happen given minHeight, but harmless if it does)
    // If the page has scrolled past the hero when this fires, we
    // still update heroHeight so the next scroll event uses the
    // correct value. Any visible reflow happens at or near the top,
    // where the user lives during hydration.
    const ro = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(() => measure())
      : null;
    if (ro) ro.observe(inner);

    return () => {
      if (measureRaf) cancelAnimationFrame(measureRaf);
      scrollEl.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onResize);
      if (ro) ro.disconnect();
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
