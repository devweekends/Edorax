"use client";

/**
 * The one animation the Docker game uses: a short colour flash on a container box when its status
 * changes. It only runs when the system has not asked for reduced motion.
 */
export function DockerStyles() {
  return (
    <style>{`
@media (prefers-reduced-motion: no-preference) {
  @keyframes dk-flash { from { background-color: rgba(250, 204, 21, 0.55); } to { background-color: transparent; } }
  .dk-flash { animation: dk-flash 0.9s ease-out 1; }
}
`}</style>
  );
}

export function useReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
