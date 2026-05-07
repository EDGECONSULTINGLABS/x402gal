"use client";

import { useEffect, useRef, useState } from "react";

interface Props {
  value: number;
  decimals?: number;
  duration?: number;
  className?: string;
  prefix?: string;
  suffix?: string;
}

/**
 * SSR-safe smooth-counter. Always renders the formatted value as plain text
 * (no framer MotionValue), so the very first paint shows real numbers — not
 * an empty box. On prop change it eases from current to new with cubic-out.
 */
export function AnimatedNumber({
  value,
  decimals = 0,
  duration = 1.1,
  className = "",
  prefix = "",
  suffix = "",
}: Props) {
  const [displayed, setDisplayed] = useState(value);
  const fromRef = useRef(value);
  const startRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    fromRef.current = displayed;
    startRef.current = null;
    const to = value;
    const ms = Math.max(0.05, duration) * 1000;

    const tick = (now: number) => {
      if (startRef.current == null) startRef.current = now;
      const t = Math.min(1, (now - startRef.current) / ms);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplayed(fromRef.current + (to - fromRef.current) * eased);
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, duration]);

  const formatted = displayed.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  return (
    <span className={`tick ${className}`}>
      {prefix}
      {formatted}
      {suffix}
    </span>
  );
}
