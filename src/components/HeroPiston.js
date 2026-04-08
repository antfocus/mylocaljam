'use client';

import { useState, useEffect, useRef } from 'react';

/**
 * HeroPiston — Smooth "piston" scroll-collapse for the Hero section.
 *
 * ═══════════════════════════════════════════════════════════════════
 *  CLEAN-SLATE REWRITE (2026-04-08)
 *  Previous approach: scroll listener on a passed-in ref (homeScrollRef).
 *  Problem: HeroPiston was outside the scroll container, and the ref
 *           wasn't populated at mount time → listener never attached.
 *
 *  New approach: IntersectionObserver on a sentinel <div>.
 *  - HeroPiston now renders INSIDE the scroll container.
 *  - A 1px sentinel div sits above the sticky hero.
 *  - When the sentinel scrolls out of the container's visible area,
 *    we know the user has scrolled past the hero's natural position.
 *  - The hero collapses with translateY(-100%) + max-height: 0.
 *  - No refs need to be passed from the parent. Zero timing issues.
 * ═══════════════════════════════════════════════════════════════════
 *
 * STAGING GATE:
 *   Activates when NEXT_PUBLIC_APP_ENV === 'staging' OR when the
 *   current URL contains 'staging'. Logs console.error if neither
 *   condition is met so you can see exactly why it's blocked.
 *
 * DEBUG DOT:
 *   A tiny fixed dot in the top-left corner of the screen:
 *     RED   = component rendered but gate FAILED (shouldn't normally appear)
 *     GREEN = piston logic is ACTIVE and running
 *   Remove the dot by setting DEBUG_DOT = false once confirmed working.
 *
 * Props:
 *   children — The <HeroSection /> component
 */

// ── Config ──────────────────────────────────────────────────────────────
const TRANSITION_DURATION = '0.4s';
const TRANSITION_EASING = 'cubic-bezier(0.25, 1, 0.5, 1)';
const DEBUG_DOT = true; // flip to false once piston is confirmed working

// ── Helpers ─────────────────────────────────────────────────────────────

/**
 * Walk up the DOM to find the nearest ancestor with overflow-y scrolling.
 * Used as the IntersectionObserver `root` so it observes within the
 * scroll container — not the viewport (which won't work for overflow divs).
 */
function getScrollParent(el) {
  let parent = el?.parentElement;
  while (parent) {
    const { overflowY } = getComputedStyle(parent);
    if (overflowY === 'auto' || overflowY === 'scroll') return parent;
    parent = parent.parentElement;
  }
  return null;
}

// ── Main export ─────────────────────────────────────────────────────────

export default function HeroPiston({ children }) {
  // Synchronous check — NEXT_PUBLIC_* is inlined by Next.js at build time
  const envStaging = process.env.NEXT_PUBLIC_APP_ENV === 'staging';

  // URL check must wait for client mount
  const [isStaging, setIsStaging] = useState(envStaging);

  useEffect(() => {
    const urlMatch = window.location.href.includes('staging');

    if (envStaging) {
      console.log(
        '[HeroPiston] ✅ Staging gate PASSED (env var)',
        { NEXT_PUBLIC_APP_ENV: process.env.NEXT_PUBLIC_APP_ENV }
      );
    } else if (urlMatch) {
      console.log(
        '[HeroPiston] ✅ Staging gate PASSED (URL contains "staging")',
        { url: window.location.href }
      );
      setIsStaging(true);
    } else {
      console.error(
        '[HeroPiston] ❌ Staging gate FAILED — piston will NOT activate.',
        {
          NEXT_PUBLIC_APP_ENV: process.env.NEXT_PUBLIC_APP_ENV || '(not set)',
          url: window.location.href,
          fix: 'Set NEXT_PUBLIC_APP_ENV=staging in Vercel env vars, or deploy to a URL containing "staging".',
        }
      );
    }
  }, [envStaging]);

  // Gate failed → transparent passthrough, no extra DOM, no hooks
  if (!isStaging) {
    return <>{children}</>;
  }

  // Gate passed → render the full piston machinery
  return <PistonCore>{children}</PistonCore>;
}

// ── PistonCore (only mounts in staging) ─────────────────────────────────

function PistonCore({ children }) {
  const sentinelRef = useRef(null);
  const heroRef = useRef(null);
  const [collapsed, setCollapsed] = useState(false);
  const [heroHeight, setHeroHeight] = useState(0);

  // ── Measure hero height (for accurate max-height transition) ──
  useEffect(() => {
    const measure = () => {
      if (heroRef.current) {
        const h = heroRef.current.scrollHeight;
        setHeroHeight(h);
        console.log('[HeroPiston] Measured hero height:', h);
      }
    };
    measure();
    window.addEventListener('resize', measure, { passive: true });
    return () => window.removeEventListener('resize', measure);
  }, [children]);

  // ── IntersectionObserver on the sentinel ──
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) {
      console.error('[HeroPiston] Sentinel ref is null — cannot observe');
      return;
    }

    // Find the scroll container (the overflow-y: auto div)
    const scrollRoot = getScrollParent(sentinel);
    if (!scrollRoot) {
      console.error('[HeroPiston] Could not find scrollable parent — observer will use viewport');
    } else {
      console.log(
        '[HeroPiston] IntersectionObserver root:',
        scrollRoot.tagName,
        `(${scrollRoot.offsetWidth}x${scrollRoot.offsetHeight})`
      );
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        const shouldCollapse = !entry.isIntersecting;
        setCollapsed(prev => {
          if (prev !== shouldCollapse) {
            console.log('[HeroPiston] Sentinel', shouldCollapse ? 'LEFT' : 'ENTERED', 'view → collapsed:', shouldCollapse);
            return shouldCollapse;
          }
          return prev;
        });
      },
      {
        root: scrollRoot || null, // scroll container, or viewport fallback
        threshold: 0,             // fire as soon as any pixel exits
        rootMargin: '0px',
      }
    );

    observer.observe(sentinel);
    console.log('[HeroPiston] Observer attached to sentinel ✔');

    return () => {
      observer.disconnect();
      console.log('[HeroPiston] Observer disconnected');
    };
  }, []); // intentionally empty — runs once on mount, sentinel is always present

  const expandedMax = heroHeight > 0 ? `${heroHeight}px` : '500px';

  return (
    <>
      {/* ── Debug dot: green = active, shows in top-left ── */}
      {DEBUG_DOT && (
        <div
          aria-hidden="true"
          style={{
            position: 'fixed',
            top: '6px',
            left: '6px',
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            background: '#22c55e', // green — piston is ACTIVE
            zIndex: 99999,
            pointerEvents: 'none',
            boxShadow: '0 0 4px rgba(34,197,94,0.6)',
            transition: 'background 0.3s ease',
          }}
        />
      )}

      {/* ── Sentinel: 1px div in normal flow, observed by IntersectionObserver ──
           When this scrolls out of the container, the hero collapses. */}
      <div
        ref={sentinelRef}
        data-piston-sentinel="true"
        style={{ height: '1px', width: '100%', flexShrink: 0 }}
      />

      {/* ── Sticky hero container ──
           position: sticky keeps it pinned at top while scrolling.
           z-index: 1 is BELOW date headers (z-index: 50) so headers
           visually slide over the hero as they reach the top. */}
      <div
        ref={heroRef}
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 1,
          overflow: 'hidden',
          flexShrink: 0,
          maxHeight: collapsed ? '0px' : expandedMax,
          transition: `max-height ${TRANSITION_DURATION} ${TRANSITION_EASING}`,
          willChange: 'max-height',
        }}
      >
        <div
          style={{
            transform: collapsed ? 'translateY(-100%)' : 'translateY(0)',
            transition: `transform ${TRANSITION_DURATION} ${TRANSITION_EASING}`,
          }}
        >
          {children}
        </div>
      </div>
    </>
  );
}
