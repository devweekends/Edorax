"use client";

import { useEffect, useRef } from "react";

const COLORS = ["#1d4ed8", "#facc15", "#22c55e", "#f97316", "#ec4899", "#38bdf8"];

type Particle = { x: number; y: number; vx: number; vy: number; size: number; spin: number; angle: number; color: string; life: number };

/**
 * A burst of confetti over the whole page for about 2.5 seconds. It draws on one canvas, does not
 * catch clicks, and does nothing at all when the system asks for reduced motion.
 */
export function ConfettiBurst({ stars, burstKey }: { stars: number; burstKey: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const el = canvas.current;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const ctx = el.getContext("2d");
    if (!ctx) return;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    el.width = window.innerWidth * ratio;
    el.height = window.innerHeight * ratio;
    ctx.scale(ratio, ratio);

    const count = 70 + Math.max(1, stars) * 45;
    const particles: Particle[] = Array.from({ length: count }, (_, i) => {
      const side = i % 2 === 0 ? 0.2 : 0.8;
      const angle = (-Math.PI / 2) + (Math.random() - 0.5) * 1.5;
      const speed = 8 + Math.random() * 10;
      return {
        x: window.innerWidth * side, y: window.innerHeight * 0.72,
        vx: Math.cos(angle) * speed * (side < 0.5 ? 1 : -1) * 0.6, vy: Math.sin(angle) * speed,
        size: 5 + Math.random() * 6, spin: (Math.random() - 0.5) * 0.4, angle: Math.random() * Math.PI,
        color: COLORS[i % COLORS.length]!, life: 1,
      };
    });

    let frame = 0;
    let raf = 0;
    const tick = () => {
      frame++;
      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
      for (const p of particles) {
        p.vy += 0.32;
        p.vx *= 0.992;
        p.x += p.vx;
        p.y += p.vy;
        p.angle += p.spin;
        p.life = Math.max(0, 1 - frame / 150);
        ctx.save();
        ctx.globalAlpha = p.life;
        ctx.translate(p.x, p.y);
        ctx.rotate(p.angle);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
        ctx.restore();
      }
      if (frame < 150) raf = requestAnimationFrame(tick);
      else ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [stars, burstKey]);

  return <canvas ref={canvas} aria-hidden className="pointer-events-none fixed inset-0 z-50 size-full" />;
}

/** Three stars that pop in one after another. Earned stars are filled. */
export function StarRow({ stars, size = "lg" }: { stars: number; size?: "sm" | "lg" }) {
  const box = size === "lg" ? "size-10" : "size-4";
  return (
    <div className="flex items-center gap-1.5" role="img" aria-label={`${stars} of 3 stars`}>
      {[1, 2, 3].map((n) => (
        <svg
          key={n}
          viewBox="0 0 24 24"
          className={`${box} ${n <= stars ? "fill-brand-yellow stroke-amber-500 motion-safe:animate-[bm-pop_0.45s_ease-out_both]" : "fill-transparent stroke-border"}`}
          style={n <= stars ? { animationDelay: `${n * 140}ms` } : undefined}
          strokeWidth={1.6}
        >
          <path d="M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3 6.1 20.6l1.3-6.6L2.5 9.4l6.6-.8L12 2.5z" strokeLinejoin="round" />
        </svg>
      ))}
    </div>
  );
}

/** "+3 XP" chip that floats up and settles. */
export function XpChip({ amount, label }: { amount: number; label?: string }) {
  if (amount <= 0) return null;
  return (
    <span className="inline-flex items-center gap-1 rounded-sm bg-brand-yellow px-2.5 py-1 text-sm font-bold text-black motion-safe:animate-[bm-pop_0.5s_ease-out_both]">
      +{amount} XP{label ? <span className="font-medium"> {label}</span> : null}
    </span>
  );
}
