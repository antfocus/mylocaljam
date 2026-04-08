'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

/**
 * HeroPiston — Smooth "piston" scroll interaction for the Hero section.
 *
 * STAGING ONLY: Gated behind NEXT_PUBLIC_APP_ENV === 'staging'.
 * Returns children unwrapped in production (no behavior change).
 *
 * HOW IT WORKS:
 *   The Hero sits above the scroll container in a flex column.
 *   This wrapper tracks the scroll position of the event list and
 *   smoothly collapses the Hero as the user scrolls down:
 *
 *   - Uses `translateY` for the visual slide (GPU-accelerated, no reflow)
 *   - Uses `max-height` transition to reclaim flex space so the scroll
 *     container grows smoothly (no layout jump)
 *   - When scrolled back to top, the Hero slides back into place
 *
 * PERFORMANCE:
 *   - Scroll listener uses requestAnimationFrame throttle (one rAF per frame)
 *   - Only reads scrollTop (no getBoundingClientRect in the hot path)
 *   - CSS transitions handle the animation (no JS animation loops)
 *
 * Props:
 *   scrollRef  — React ref to the scroll container (homeScrollRef)
 *   children   — The HeroSection component
 */

const COLLAPSE_THRESHOLD = 10; // px of scroll before hero starts collapsing
const TRANSITION_DURATION = '0.4s';
const TRANSITION_EASING = 'cubic-bezier(0.25, 1, 0.5, 1)';

export default function HeroPiston({ scrollRef, children }) {
  const isStaging = process.env.NEXT_PUBLIC_APP_ENV === 'staging';

  // In production, just render children unwrapped
  if (!isStaging) {
    return <>{children}</>;
  }

  return <PistonWrapper scrollRef={scrollRef}>{children}</PistonWrapper>;
}

/**
 * Inner component — separated so the hooks are only called in staging.
 * (Avoids conditional hook calls in the parent.)
 */
function PistonWrapper({ scrollRef, children }) {
  const [collapsed, setCollapsed] = useState(false);
  const heroRef = useRef(null);
  const heroHeight = useRef(0);
  const rafPending = useRef(false);

  // Measure hero height on mount and resize
  useEffect(() => {
    const measure = () => {
      if (heroRef.current) {
        heroHeight.current = heroRef.current.scrollHeight;
      }
    };
    measure();

    // Re-measure on resize (orientation change, etc.)
    window.addEventListener('resize', measure, { passive: true });
    return () => window.removeEventListener('resize', measure);
  }, [children]);

  // rAF-throttled scroll handler
  const onScroll = useCallback(() => {
    if (rafPending.current) return;
    rafPending.current = true;

    requestAnimationFrame(() => {
      rafPending.current = false;
      const el = scrollRef?.current;
      if (!el) return;

      const scrollY = el.scrollTop;
      const shouldCollapse = scrollY > COLLAPSE_THRESHOLD;

      setCollapsed(prev => {
        if (prev !== shouldCollapse) return shouldCollapse;
        return prev; // no-op, avoids re-render
      });
    });
  }, [scrollRef]);

  // Attach scroll listener to the event list container
  useEffect(() => {
    const el = scrollRef?.current;
    if (!el) return;

    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, [scrollRef, onScroll]);

  return (
    <div
      ref={heroRef}
      style={{
        overflow: 'hidden',
        flexShrink: 0,
        // Smooth max-height collapse reclaims flex space without layout jump
        maxHeight: collapsed ? '0px' : '300px',
        transition: `max-height ${TRANSITION_DURATION} ${TRANSITION_EASING}, transform ${TRANSITION_DURATION} ${TRANSITION_EASING}`,
        willChange: 'max-height, transform',
      }}
    >
      <div
        style={{
          // translateY slides the hero content up for the piston feel
          transform: collapsed ? 'translateY(-100%)' : 'translateY(0)',
          transition: `transform ${TRANSITION_DURATION} ${TRANSITION_EASING}`,
        }}
      >
        {children}
      </div>
    </div>
  );
}
