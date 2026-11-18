"use client";

/**
 * The few keyframes the Docker game needs. They only run when the system has not asked for reduced
 * motion, so the game works the same without them.
 */
export function DockerStyles() {
  return (
    <style>{`
.dk-line-on { background-image: linear-gradient(90deg, #10b981 0 10px, transparent 10px 20px); background-size: 20px 4px; }
.dk-line-off { background-image: linear-gradient(90deg, #f87171 0 4px, transparent 4px 10px); background-size: 10px 4px; }
@media (prefers-reduced-motion: no-preference) {
  @keyframes dk-flow { from { background-position: 0 0; } to { background-position: 20px 0; } }
  @keyframes dk-bob { 0%, 100% { transform: translateY(0) rotate(-1deg); } 50% { transform: translateY(-3px) rotate(1deg); } }
  @keyframes dk-stack { from { opacity: 0; transform: translateY(-16px) scale(0.97); } to { opacity: 1; transform: none; } }
  @keyframes dk-shake { 0%, 100% { transform: translateX(0); } 20%, 60% { transform: translateX(-4px); } 40%, 80% { transform: translateX(4px); } }
  @keyframes dk-ring { 0% { box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.45); } 100% { box-shadow: 0 0 0 9px rgba(16, 185, 129, 0); } }
  @keyframes dk-spout { 0%, 100% { opacity: 0; transform: translateY(2px); } 50% { opacity: 1; transform: translateY(-2px); } }
  .dk-flow { animation: dk-flow 0.7s linear infinite; }
  .dk-bob { animation: dk-bob 4s ease-in-out infinite; }
  .dk-stack { animation: dk-stack 0.35s ease-out both; }
  .dk-shake { animation: dk-shake 0.5s ease-in-out 2; }
  .dk-ring { animation: dk-ring 1.8s ease-out infinite; }
  .dk-spout { animation: dk-spout 2.4s ease-in-out infinite; }
}
`}</style>
  );
}

export function useReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
