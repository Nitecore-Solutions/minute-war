import React, { useCallback, useEffect, useRef, useState } from "react";

/**
 * A countdown driven by a wall-clock deadline.
 *
 * setInterval alone is not enough on mobile: timers are throttled or paused
 * when the app is backgrounded, so an interval-driven 60-second game would
 * silently run long. Measuring `Date.now() - deadline` every frame means the
 * timer is correct even after the app has been away for ten minutes.
 */
export function useCountdown(
  durationMs: number,
  onComplete?: () => void,
  autoStart = true
) {
  const [remainingMs, setRemainingMs] = useState(autoStart ? durationMs : durationMs);
  const [running, setRunning] = useState(autoStart);

  const deadlineRef = useRef<number>(Date.now() + durationMs);
  const frameRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const completedRef = useRef(false);
  // Held in a ref so a changing callback identity does not restart the timer.
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  const tick = useCallback(() => {
    const remaining = deadlineRef.current - Date.now();

    if (remaining <= 0) {
      setRemainingMs(0);
      setRunning(false);

      // Guard against firing twice: the tick can land more than once on the
      // final frame.
      if (!completedRef.current) {
        completedRef.current = true;
        onCompleteRef.current?.();
      }
      return;
    }

    setRemainingMs(remaining);
    frameRef.current = setTimeout(tick, 100);
  }, []);

  const start = useCallback(() => {
    if (running) return;
    completedRef.current = false;
    deadlineRef.current = Date.now() + durationMs;
    setRemainingMs(durationMs);
    setRunning(true);
    tick();
  }, [durationMs, running, tick]);

  const pause = useCallback(() => {
    setRemainingMs(Math.max(0, deadlineRef.current - Date.now()));
    setRunning(false);
    if (frameRef.current) clearTimeout(frameRef.current);
  }, []);

  const reset = useCallback(
    (ms: number = durationMs) => {
      completedRef.current = false;
      if (frameRef.current) clearTimeout(frameRef.current);
      deadlineRef.current = Date.now() + ms;
      setRemainingMs(ms);
      setRunning(false);
    },
    [durationMs]
  );

  useEffect(() => {
    if (autoStart) {
      completedRef.current = false;
      deadlineRef.current = Date.now() + durationMs;
      // `running` starts as whatever autoStart was on first render. Games that
      // wait for questions pass false at first, so flip it back on when the
      // countdown actually begins; otherwise choose()/tap() handlers would
      // reject every tap for the whole run.
      setRunning(true);
      tick();
      return () => {
        if (frameRef.current) clearTimeout(frameRef.current);
      };
    }

    setRunning(false);
    if (frameRef.current) clearTimeout(frameRef.current);
  }, [autoStart, durationMs, tick]);

  return {
    remainingMs,
    running,
    start,
    pause,
    reset,
    /** 0..1 of the way through, useful for progress visuals. */
    progress: durationMs > 0 ? remainingMs / durationMs : 0,
  };
}

/**
 * requestAnimationFrame loop that hands back elapsed milliseconds.
 *
 * Used by the tap and reaction games, which need sub-second precision rather
 * than a countdown.
 */
export function useElapsed(startedAt: number | null): number {
  const [elapsed, setElapsed] = useState(0);
  const frame = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (startedAt === null) {
      setElapsed(0);
      return;
    }

    const loop = () => {
      setElapsed(Date.now() - startedAt);
      frame.current = setTimeout(loop, 50);
    };

    loop();
    return () => {
      if (frame.current) clearTimeout(frame.current);
    };
  }, [startedAt]);

  return elapsed;
}