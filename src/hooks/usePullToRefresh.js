'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * usePullToRefresh — touch-driven pull-to-refresh for a scrollable element.
 *
 * Attaches touch listeners to the element behind `scrollRef` and tracks
 * downward pull distance whenever the user starts dragging from `scrollTop === 0`.
 * Once the pull crosses `threshold`, releasing fires `onRefresh`. While the
 * promise is pending, `refreshing` stays true so callers can render a
 * persistent spinner.
 *
 * Returns:
 *   - pull (px):  current pull distance (0 when idle, capped at `max`)
 *   - refreshing: true while the onRefresh promise is in flight
 *   - threshold:  the trigger threshold, useful for indicator math
 *
 * Notes:
 *   - Resistance scales the raw drag delta so pulling feels rubbery (1px of
 *     finger movement = 0.5px of indicator travel). Matches iOS feel.
 *   - Touch listeners are reattached only when scrollRef / onRefresh / config
 *     changes, not on every pull tick. Frequent state (pull/refreshing) is
 *     mirrored into refs so handlers can read the latest value without being
 *     in the effect's dependency list.
 *   - `passive: false` on touchmove only — required so we can call
 *     preventDefault to suppress the browser's native overscroll while we
 *     own the gesture.
 */
export default function usePullToRefresh(scrollRef, onRefresh, options = {}) {
  const {
    threshold = 80,    // px — pull past this on release to trigger refresh
    resistance = 0.5,  // multiplier on raw drag delta
    max = 120,         // hard cap on visible pull distance
  } = options;

  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  const pullRef = useRef(0);
  const refreshingRef = useRef(false);
  const startY = useRef(0);
  const dragging = useRef(false);

  useEffect(() => { pullRef.current = pull; }, [pull]);
  useEffect(() => { refreshingRef.current = refreshing; }, [refreshing]);

  useEffect(() => {
    const el = scrollRef?.current;
    if (!el) return;

    const onStart = (e) => {
      if (refreshingRef.current) return;
      if (el.scrollTop > 0) return;
      startY.current = e.touches[0].clientY;
      dragging.current = true;
    };

    const onMove = (e) => {
      if (!dragging.current) return;
      // If the container has scrolled (e.g. content shifted), bail.
      if (el.scrollTop > 0) {
        dragging.current = false;
        setPull(0);
        return;
      }
      const dy = e.touches[0].clientY - startY.current;
      if (dy <= 0) {
        if (pullRef.current !== 0) setPull(0);
        return;
      }
      const distance = Math.min(dy * resistance, max);
      setPull(distance);
      // Suppress native overscroll/bounce while we own the gesture.
      if (dy > 5 && e.cancelable) e.preventDefault();
    };

    const onEnd = async () => {
      if (!dragging.current) return;
      dragging.current = false;
      const final = pullRef.current;
      if (final >= threshold && !refreshingRef.current) {
        setRefreshing(true);
        try {
          await onRefresh?.();
        } finally {
          setRefreshing(false);
          setPull(0);
        }
      } else {
        setPull(0);
      }
    };

    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchmove', onMove, { passive: false });
    el.addEventListener('touchend', onEnd, { passive: true });
    el.addEventListener('touchcancel', onEnd, { passive: true });
    return () => {
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchmove', onMove);
      el.removeEventListener('touchend', onEnd);
      el.removeEventListener('touchcancel', onEnd);
    };
  }, [scrollRef, onRefresh, threshold, resistance, max]);

  return { pull, refreshing, threshold };
}
