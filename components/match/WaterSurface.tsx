"use client";

import { useEffect, useRef } from "react";
import { OVERDRAFT_TAPS, SURFACE_FACTS, type SurfaceFactId } from "@/lib/match/surfaceFacts";
import { PAPER, WATER } from "@/lib/match/theme";

/**
 * The living surface behind the gate. The HydroCoin gradient is water with a lava lamp underneath:
 * slow blue bodies that rise, sink and fuse. A tap dents the surface and sends rings out from the
 * fingertip and shoves the lamp away; a held finger is heat and the lamp gathers under it; tapping
 * one spot again and again keeps the surface down until it recharges on its own.
 *
 * Rules (design directive): starts on pointerdown, draws on the next frame, never waits for React;
 * is not a control and never looks like one — anything inside [data-control] or a form element is
 * left alone; runs ~30 fps idle and full rate only while a finger is on the glass; pauses when the
 * tab is hidden; two device pixels per CSS pixel at most; aria-hidden, every line also rendered as
 * text by the parent. Under prefers-reduced-motion the lamp is frozen and a tap is one fading ring.
 */

type Ripple = { x: number; y: number; t0: number };
type Well = { x: number; y: number; depth: number; overdrawn: boolean };
type Blob = { x: number; y: number; r: number; vx: number; vy: number; phase: number };

const RIPPLE_LIFE = 1.8; // s
const RIPPLE_SPEED = 150; // px/s
const WELL_DECAY = 0.55; // depth units per second — recharge
const MAX_RIPPLES = 14; // a drumming kid cannot stall the phone
const BLOBS = 7;
const SHOVE_RADIUS = 240; // px — a tap pushes blobs inside this
const SHOVE_SPEED = 260; // px/s impulse at the centre of a tap
const HEAT_DELAY = 220; // ms held before the finger becomes heat
const HEAT_PULL = 140; // px/s² toward a held finger
const LOWRES = 3; // blobs render at 1/3 resolution, then blur + threshold

// Brand: tokens.css values MapLibre-style, because a 2D canvas cannot read CSS variables either.
const BG = ["#0c1a2e", "#1a3a5c", "#13152e"]; // --hc-gradient-hero stops
const SKY = hex(WATER); // --hc-sky-2, the rings
const PALE: RGB = [168, 232, 224]; // --hc-pale, the rim where light catches the dent
const SHADOW = hex(PAPER); // --hc-bg, the surface bending down
const LAVA = "rgb(40, 150, 210)"; // blob body; lands near --hc-sky-2 once it adds onto the gradient

type RGB = readonly [number, number, number];
function hex(h: string): RGB {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const rgba = (c: RGB, a: number) => `rgba(${c[0]},${c[1]},${c[2]},${a.toFixed(3)})`;

type Props = {
  /** Fired once per line, in the order the surface earns them. Render it as text; the canvas is aria-hidden. */
  onFact?: (id: SurfaceFactId, text: string) => void;
  /** Quiet mode for screens where a line appearing would be a distraction (the form): rings only, no lamp movement toward the finger, no facts. */
  quiet?: boolean;
};

function isControl(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || typeof el.closest !== "function") return false;
  return el.closest("[data-control], input, button, a, label, select, textarea, [role='button']") !== null;
}

export function WaterSurface({ onFact, quiet = false }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const opts = useRef({ onFact, quiet });
  opts.current = { onFact, quiet };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const off1 = document.createElement("canvas");
    const off2 = document.createElement("canvas");
    const o1 = off1.getContext("2d");
    const o2 = off2.getContext("2d");
    if (!o1 || !o2) return;
    // Chromium and Firefox have ctx.filter; older Safari does not → soft blobs that do not fuse.
    const hasFilter = "filter" in o2;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const ripples: Ripple[] = [];
    const wells: Well[] = [];
    let blobs: Blob[] = [];
    const pointer = { x: 0, y: 0, downAt: 0, active: false };
    let taps = 0;
    const fired = new Set<SurfaceFactId>();
    let raf: number | null = null;
    let last = 0;
    let lastPaint = 0;

    const fire = (id: SurfaceFactId) => {
      if (opts.current.quiet || fired.has(id)) return;
      fired.add(id);
      opts.current.onFact?.(id, SURFACE_FACTS[id]);
    };

    const seedBlobs = (w: number, h: number) => {
      const out: Blob[] = [];
      for (let i = 0; i < BLOBS; i++) {
        out.push({
          x: w * (0.15 + 0.7 * ((i * 0.618) % 1)),
          y: h * (0.15 + 0.7 * ((i * 0.382 + 0.2) % 1)),
          r: Math.min(w, h) * (0.11 + 0.06 * ((i * 0.77) % 1)),
          vx: 0,
          vy: 0,
          phase: i * 1.7,
        });
      }
      return out;
    };

    const fit = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const width = window.innerWidth;
      const height = window.innerHeight;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      off1.width = off2.width = Math.max(1, Math.round(width / LOWRES));
      off1.height = off2.height = Math.max(1, Math.round(height / LOWRES));
      if (blobs.length === 0) blobs = seedBlobs(width, height);
    };
    fit();
    window.addEventListener("resize", fit);

    const drawDent = (x: number, y: number, radius: number, strength: number) => {
      // A dark ring (the surface bending down) and a thin pale rim where light catches the edge.
      const g = ctx.createRadialGradient(x, y, 0, x, y, radius);
      g.addColorStop(0, rgba(SHADOW, 0.7 * strength));
      g.addColorStop(0.62, rgba(SHADOW, 0.4 * strength));
      g.addColorStop(0.86, rgba(PALE, 0.22 * strength));
      g.addColorStop(1, rgba(PALE, 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();
    };

    const stepBlobs = (w: number, h: number, t: number, dt: number, heating: boolean) => {
      for (const b of blobs) {
        // Buoyancy: each body rises and sinks on its own clock, like wax over a bulb.
        b.vy += Math.sin(t * 0.23 + b.phase) * 9 * dt;
        b.vx += Math.cos(t * 0.17 + b.phase * 1.3) * 6 * dt;
        if (heating) {
          const dx = pointer.x - b.x;
          const dy = pointer.y - b.y;
          const d = Math.hypot(dx, dy) || 1;
          const pull = HEAT_PULL * Math.min(1, d / 120); // eases as it arrives: hover, not stack
          b.vx += (dx / d) * pull * dt;
          b.vy += (dy / d) * pull * dt;
        }
        // Mild repulsion so the lamp never collapses to one lump.
        for (const c of blobs) {
          if (c === b) continue;
          const dx = b.x - c.x;
          const dy = b.y - c.y;
          const d = Math.hypot(dx, dy) || 1;
          const minD = (b.r + c.r) * 0.55;
          if (d < minD) {
            const f = ((minD - d) / minD) * 40 * dt;
            b.vx += (dx / d) * f;
            b.vy += (dy / d) * f;
          }
        }
        // Soft walls: lean out of frame a little, never leave it.
        if (b.x < b.r * 0.5) b.vx += (b.r * 0.5 - b.x) * 0.8 * dt;
        if (b.x > w - b.r * 0.5) b.vx -= (b.x - (w - b.r * 0.5)) * 0.8 * dt;
        if (b.y < b.r * 0.5) b.vy += (b.r * 0.5 - b.y) * 0.8 * dt;
        if (b.y > h - b.r * 0.5) b.vy -= (b.y - (h - b.r * 0.5)) * 0.8 * dt;
        const damp = Math.max(0, 1 - 0.9 * dt); // viscosity
        b.vx *= damp;
        b.vy *= damp;
        const sp = Math.hypot(b.vx, b.vy);
        if (sp > 160) {
          b.vx *= 160 / sp;
          b.vy *= 160 / sp;
        }
        b.x += b.vx * dt;
        b.y += b.vy * dt;
      }
    };

    const drawLava = (w: number, h: number, t: number) => {
      const s = 1 / LOWRES;
      // 1. Soft white bodies on black, low-res.
      o1.globalCompositeOperation = "source-over";
      o1.fillStyle = "#000";
      o1.fillRect(0, 0, off1.width, off1.height);
      o1.globalCompositeOperation = "lighter";
      for (const b of blobs) {
        const wob = 1 + 0.08 * Math.sin(t * 0.9 + b.phase) + 0.05 * Math.sin(t * 1.7 + b.phase * 2.1);
        const r = b.r * wob * s;
        const g = o1.createRadialGradient(b.x * s, b.y * s, 0, b.x * s, b.y * s, r);
        g.addColorStop(0, "rgba(255,255,255,1)");
        g.addColorStop(0.5, "rgba(255,255,255,0.55)");
        g.addColorStop(1, "rgba(255,255,255,0)");
        o1.fillStyle = g;
        o1.fillRect(b.x * s - r, b.y * s - r, r * 2, r * 2);
      }
      // 2. Blur + contrast is a soft threshold: overlapping bodies fuse with a smooth neck.
      o2.globalCompositeOperation = "source-over";
      o2.fillStyle = "#000";
      o2.fillRect(0, 0, off2.width, off2.height);
      if (hasFilter) o2.filter = `blur(${Math.max(2, off2.width * 0.035).toFixed(1)}px) contrast(5)`;
      o2.drawImage(off1, 0, 0);
      if (hasFilter) o2.filter = "none";
      // 3. Tint with the brand blue; black stays black.
      o2.globalCompositeOperation = "multiply";
      o2.fillStyle = LAVA;
      o2.fillRect(0, 0, off2.width, off2.height);
      // 4. Onto the surface: a darker copy offset down-right (the shadow underneath), then the glow.
      ctx.save();
      ctx.imageSmoothingEnabled = true;
      ctx.globalCompositeOperation = "multiply";
      ctx.globalAlpha = 0.7;
      ctx.drawImage(off2, 4, 16, w, h);
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = 0.38;
      ctx.drawImage(off2, 0, 0, w, h);
      ctx.restore();
    };

    const frame = (now: number) => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      const t = now / 1000;
      const heating = !opts.current.quiet && pointer.active && now - pointer.downAt > HEAT_DELAY;
      const busy = ripples.length > 0 || wells.length > 0 || heating;

      // Idle lamp at ~30 fps; anything the finger is doing gets the full frame rate.
      if (!busy && now - lastPaint < 31) {
        raf = window.requestAnimationFrame(frame);
        return;
      }
      const dt = last ? Math.min(0.1, (now - last) / 1000) : 0;
      last = now;
      lastPaint = now;

      const base = ctx.createLinearGradient(0, 0, w * 0.4, h);
      base.addColorStop(0, BG[0]);
      base.addColorStop(0.5, BG[1]);
      base.addColorStop(1, BG[2]);
      ctx.fillStyle = base;
      ctx.fillRect(0, 0, w, h);

      if (!reduced) stepBlobs(w, h, t, dt, heating);
      drawLava(w, h, reduced ? 0 : t);

      if (heating) {
        // The finger as heat: a faint warm halo so the pull has a visible cause.
        const g = ctx.createRadialGradient(pointer.x, pointer.y, 0, pointer.x, pointer.y, 70);
        g.addColorStop(0, rgba(PALE, 0.18));
        g.addColorStop(1, rgba(PALE, 0));
        ctx.fillStyle = g;
        ctx.fillRect(pointer.x - 70, pointer.y - 70, 140, 140);
      }

      // Wells: where repeated taps pressed the surface down. Decay is recharge.
      for (const well of wells) {
        well.depth = Math.max(0, well.depth - WELL_DECAY * dt);
        if (well.depth <= 0.05) {
          if (well.overdrawn) fire("recovered");
          continue;
        }
        const strength = Math.min(1, well.depth / OVERDRAFT_TAPS);
        drawDent(well.x, well.y, 18 + well.depth * 5, 0.35 + 0.65 * strength);
      }
      for (let i = wells.length - 1; i >= 0; i--) if (wells[i].depth <= 0.05) wells.splice(i, 1);

      // Rings that leave the fingertip and thin out.
      for (let i = ripples.length - 1; i >= 0; i--) {
        const r = ripples[i];
        const age = (now - r.t0) / 1000;
        if (reduced) {
          if (age > 0.5) {
            ripples.splice(i, 1);
            continue;
          }
          ctx.strokeStyle = rgba(SKY, 0.6 * (1 - age / 0.5));
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(r.x, r.y, 26, 0, Math.PI * 2);
          ctx.stroke();
          continue;
        }
        if (age > RIPPLE_LIFE) {
          ripples.splice(i, 1);
          continue;
        }
        const fade = 1 - age / RIPPLE_LIFE;
        for (let k = 0; k < 3; k++) {
          const radius = 12 + age * RIPPLE_SPEED - k * 22;
          if (radius <= 0) continue;
          ctx.strokeStyle = rgba(SKY, 0.55 * fade * (1 - k * 0.3));
          ctx.lineWidth = Math.max(0.6, 2.6 - k * 0.7 - age * 0.6);
          ctx.beginPath();
          ctx.arc(r.x, r.y, radius, 0, Math.PI * 2);
          ctx.stroke();
        }
        if (age < 0.55) {
          const s = 1 - age / 0.55;
          drawDent(r.x, r.y, 16 * (0.6 + 0.4 * s), s);
        }
      }

      raf = window.requestAnimationFrame(frame);
    };

    const kick = () => {
      if (raf == null) raf = window.requestAnimationFrame(frame);
    };
    kick();
    const onVis = () => {
      if (document.hidden && raf != null) {
        window.cancelAnimationFrame(raf);
        raf = null;
        last = 0;
      } else kick();
    };
    document.addEventListener("visibilitychange", onVis);

    // Document-level: the surface sits behind the page content, so the tap lands on the content.
    const onDown = (e: PointerEvent) => {
      if (!e.isPrimary || isControl(e.target)) return;
      const x = e.clientX;
      const y = e.clientY;
      const now = performance.now();
      pointer.x = x;
      pointer.y = y;
      pointer.downAt = now;
      pointer.active = true;
      ripples.push({ x, y, t0: now });
      if (ripples.length > MAX_RIPPLES) ripples.shift();
      for (const b of blobs) {
        const dx = b.x - x;
        const dy = b.y - y;
        const d = Math.hypot(dx, dy) || 1;
        if (d < SHOVE_RADIUS) {
          const k = (1 - d / SHOVE_RADIUS) * SHOVE_SPEED;
          b.vx += (dx / d) * k;
          b.vy += (dy / d) * k;
        }
      }
      const near = wells.find((wl) => Math.hypot(wl.x - x, wl.y - y) < 34);
      if (near) {
        near.depth += 1;
        near.x = near.x * 0.7 + x * 0.3;
        near.y = near.y * 0.7 + y * 0.3;
        if (near.depth >= OVERDRAFT_TAPS && !near.overdrawn) {
          near.overdrawn = true;
          fire("overdraft");
        }
      } else wells.push({ x, y, depth: 1, overdrawn: false });
      taps += 1;
      if (taps === 1) fire("first");
      if (taps === 10) fire("ten");
      if (taps === 40) fire("forty");
      if (taps === 100) fire("hundred");
      kick();
    };
    const onMove = (e: PointerEvent) => {
      if (!pointer.active || !e.isPrimary) return;
      pointer.x = e.clientX;
      pointer.y = e.clientY;
    };
    const onUp = () => {
      if (!pointer.active) return;
      pointer.active = false;
      if (performance.now() - pointer.downAt > 1500) fire("heat");
    };
    document.addEventListener("pointerdown", onDown, { passive: true });
    document.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("pointerup", onUp);
    document.addEventListener("pointercancel", onUp);

    return () => {
      window.removeEventListener("resize", fit);
      document.removeEventListener("visibilitychange", onVis);
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
      document.removeEventListener("pointercancel", onUp);
      if (raf != null) window.cancelAnimationFrame(raf);
    };
  }, []);

  return <canvas ref={canvasRef} className="water-surface" aria-hidden="true" />;
}
