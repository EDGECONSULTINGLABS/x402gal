"use client";

/**
 * Cinematic water backdrop. Three layers stacked under content:
 *  1. Looping ambient water video (free Mixkit asset, gracefully fails to layer 2)
 *  2. SVG turbulence caustics (always renders, pure CSS/SVG)
 *  3. Aurora gradient + drifting bubbles
 *
 * All `pointer-events-none` and absolutely positioned. Drop on the page once.
 */

import { useMemo } from "react";

const VIDEO_SRC =
  "https://assets.mixkit.co/active_storage/video_items/100538/1727457559/100538-video-720.mp4";

export function WaterBackdrop() {
  // Stable random bubble field (so SSR + client agree).
  const bubbles = useMemo(() => {
    const seeded = (i: number) => {
      const x = Math.sin(i * 9301 + 49297) * 233280;
      return x - Math.floor(x);
    };
    return Array.from({ length: 22 }, (_, i) => ({
      left: `${(seeded(i) * 100).toFixed(2)}%`,
      size: 3 + seeded(i + 1) * 9,
      delay: `${(seeded(i + 2) * 14).toFixed(2)}s`,
      duration: `${10 + seeded(i + 3) * 12}s`,
      opacity: 0.25 + seeded(i + 4) * 0.5,
    }));
  }, []);

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
    >
      {/* Layer 1 — looping water video, heavily darkened/blurred so it reads as ambience */}
      <video
        className="absolute inset-0 h-full w-full object-cover opacity-[0.22] mix-blend-screen"
        style={{ filter: "blur(2px) saturate(1.3) hue-rotate(-10deg)" }}
        autoPlay
        muted
        loop
        playsInline
        preload="metadata"
        poster=""
      >
        <source src={VIDEO_SRC} type="video/mp4" />
      </video>

      {/* Layer 2 — SVG caustic ripples (pure SVG, no fetch) */}
      <svg
        className="absolute inset-0 h-full w-full opacity-[0.18]"
        xmlns="http://www.w3.org/2000/svg"
        preserveAspectRatio="none"
      >
        <defs>
          <filter id="caustics">
            <feTurbulence
              type="fractalNoise"
              baseFrequency="0.012 0.018"
              numOctaves="2"
              seed="3"
            >
              <animate
                attributeName="baseFrequency"
                dur="22s"
                values="0.012 0.018;0.018 0.012;0.012 0.018"
                repeatCount="indefinite"
              />
            </feTurbulence>
            <feColorMatrix
              type="matrix"
              values="0 0 0 0 0.13
                      0 0 0 0 0.83
                      0 0 0 0 0.93
                      0 0 0 1.4 -0.5"
            />
          </filter>
        </defs>
        <rect width="100%" height="100%" filter="url(#caustics)" />
      </svg>

      {/* Layer 3 — aurora wash */}
      <div className="absolute inset-0 bg-aurora" />
      <div className="absolute inset-0 scanlines opacity-60" />

      {/* Layer 4 — drifting bubbles */}
      <div className="absolute inset-0">
        {bubbles.map((b, i) => (
          <span
            key={i}
            className="bubble"
            style={{
              left: b.left,
              width: `${b.size}px`,
              height: `${b.size}px`,
              animationDelay: b.delay,
              animationDuration: b.duration,
              opacity: b.opacity,
            }}
          />
        ))}
      </div>

      {/* Bottom vignette so foreground text always reads */}
      <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-abyss to-transparent" />
    </div>
  );
}
