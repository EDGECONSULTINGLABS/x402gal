"use client";

import { useEffect, useRef } from "react";
import { animate, useMotionValue, useTransform, motion } from "framer-motion";

interface Props {
  value: number;
  decimals?: number;
  duration?: number;
  className?: string;
  prefix?: string;
  suffix?: string;
}

/** Smooth tween between value changes. Tabular numerals so width stays stable. */
export function AnimatedNumber({
  value,
  decimals = 0,
  duration = 1.1,
  className = "",
  prefix = "",
  suffix = "",
}: Props) {
  const mv = useMotionValue(value);
  const display = useTransform(mv, (v) => {
    const formatted = v.toLocaleString(undefined, {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
    return `${prefix}${formatted}${suffix}`;
  });
  const prev = useRef(value);

  useEffect(() => {
    const controls = animate(mv, value, {
      duration,
      ease: [0.16, 1, 0.3, 1],
    });
    prev.current = value;
    return controls.stop;
  }, [value, duration, mv]);

  return <motion.span className={`tick ${className}`}>{display}</motion.span>;
}
