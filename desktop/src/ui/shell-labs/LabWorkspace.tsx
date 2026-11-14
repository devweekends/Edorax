import { useCallback, useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { AppWindow, Maximize2, Minimize2, PanelBottom, PanelRight, RotateCw } from 'lucide-react';

export type DockMode = 'right' | 'bottom' | 'float';
type Rect = { x: number; y: number; w: number; h: number };
export type LabLayout = { mode: DockMode; split: number; float: Rect; maximized: boolean };

const KEY = 'edorax:shell-lab-layout:v1';
const DEFAULT: LabLayout = { mode: 'right', split: 55, float: { x: -1, y: 64, w: 600, h: 400 }, maximized: false };
const MIN_FLOAT = { w: 360, h: 220 };

function load(): LabLayout {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || 'null') as Partial<LabLayout> | null;
    if (!saved || !['right', 'bottom', 'float'].includes(saved.mode as string)) return DEFAULT;
    return {
      mode: saved.mode as DockMode,
      split: Math.min(75, Math.max(25, Number(saved.split) || DEFAULT.split)),
      float: { ...DEFAULT.float, ...saved.float },
      maximized: false,
    };
  } catch {
    return DEFAULT;
  }
}

/** Where the terminal sits, remembered on this device. Maximize is never remembered. */
export function useLabLayout() {
  const [layout, setLayout] = useState<LabLayout>(load);
  const update = useCallback((patch: Partial<LabLayout>) => {
    setLayout((current) => {
      const next = { ...current, ...patch };
      try {
        localStorage.setItem(KEY, JSON.stringify({ ...next, maximized: false }));
      } catch {
        /* Layout is a convenience; the lab works without saving it. */
      }
      return next;
    });
  }, []);
  return [layout, update] as const;
}

/**
 * The lab area: the step panel and the terminal. The terminal can dock to the right or the bottom
 * with a draggable divider, float as a window you drag and resize, or fill the area. It stays the
 * same element in every layout, so moving it never drops the shell session.
 */
export function LabWorkspace({
  steps,
  terminal,
  terminalTitle,
  onReconnect,
  layout,
  setLayout,
}: {
  steps: ReactNode;
  terminal: ReactNode;
  terminalTitle: string;
  onReconnect?: () => void;
  layout: LabLayout;
  setLayout: (patch: Partial<LabLayout>) => void;
}) {
  const area = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    if (!area.current) return;
    const observer = new ResizeObserver(([entry]) => setSize({ w: entry.contentRect.width, h: entry.contentRect.height }));
    observer.observe(area.current);
    return () => observer.disconnect();
  }, []);

  const { mode, split, maximized } = layout;
  // A floating window always stays inside the lab area, whatever size the window is now.
  const float = clampRect(layout.float.x < 0 ? { ...layout.float, x: size.w - layout.float.w - 24 } : layout.float, size);

  const drag = useRef<{ kind: 'move' | 'resize'; startX: number; startY: number; rect: Rect } | null>(null);
  const beginFloat = (kind: 'move' | 'resize') => (event: ReactPointerEvent) => {
    if (mode !== 'float' || maximized || (event.target as HTMLElement).closest('button')) return;
    event.preventDefault();
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    drag.current = { kind, startX: event.clientX, startY: event.clientY, rect: float };
  };
  const moveFloat = (event: ReactPointerEvent) => {
    const active = drag.current;
    if (!active) return;
    const dx = event.clientX - active.startX;
    const dy = event.clientY - active.startY;
    const rect =
      active.kind === 'move'
        ? { ...active.rect, x: active.rect.x + dx, y: active.rect.y + dy }
        : { ...active.rect, w: Math.max(MIN_FLOAT.w, active.rect.w + dx), h: Math.max(MIN_FLOAT.h, active.rect.h + dy) };
    setLayout({ float: clampRect(rect, size) });
  };
  const endFloat = () => {
    drag.current = null;
  };

  const stepStyle: CSSProperties =
    mode === 'right' ? { width: `${100 - split}%` } : mode === 'bottom' ? { height: `${100 - split}%` } : { flex: 1 };
  const terminalStyle: CSSProperties = maximized
    ? { flex: 1 }
    : mode === 'right'
      ? { width: `${split}%` }
      : mode === 'bottom'
        ? { height: `${split}%` }
        : { position: 'absolute', left: float.x, top: float.y, width: float.w, height: float.h, zIndex: 30 };

  const modeButton = (target: DockMode, label: string, icon: ReactNode) => (
    <button
      type="button"
      onClick={() => setLayout({ mode: target, maximized: false })}
      aria-pressed={mode === target && !maximized}
      title={label}
      aria-label={label}
      className={`rounded-md p-1.5 transition-colors ${mode === target && !maximized ? 'bg-white/15 text-white' : 'text-white/60 hover:bg-white/10 hover:text-white'}`}
    >
      {icon}
    </button>
  );

  return (
    <div ref={area} className={`relative flex min-h-0 flex-1 ${mode === 'bottom' ? 'flex-col' : 'flex-row'}`}>
      {!maximized && (
        <div key="steps" className="min-h-0 min-w-0 overflow-y-auto" style={stepStyle}>
          {steps}
        </div>
      )}
      {!maximized && mode !== 'float' && <SplitHandle key="handle" vertical={mode === 'right'} split={split} onChange={(value) => setLayout({ split: value })} />}
      <section
        key="terminal"
        aria-label="Linux terminal"
        className={`flex min-h-0 min-w-0 flex-col overflow-hidden bg-[#15171c] ${mode === 'float' && !maximized ? 'rounded-xl border border-white/10 shadow-2xl shadow-black/40' : ''}`}
        style={terminalStyle}
      >
        <header
          className={`flex shrink-0 items-center gap-2 border-b border-white/10 px-3 py-1.5 text-xs text-white/80 ${mode === 'float' && !maximized ? 'cursor-move select-none' : ''}`}
          onPointerDown={beginFloat('move')}
          onPointerMove={moveFloat}
          onPointerUp={endFloat}
          onDoubleClick={() => setLayout({ maximized: !maximized })}
        >
          <span className="flex gap-1.5" aria-hidden>
            <span className="size-2.5 rounded-full bg-red-400/80" />
            <span className="size-2.5 rounded-full bg-amber-400/80" />
            <span className="size-2.5 rounded-full bg-emerald-400/80" />
          </span>
          <span className="ml-1 truncate font-mono">{terminalTitle}</span>
          <span className="ml-auto flex items-center gap-0.5">
            {modeButton('right', 'Dock terminal to the right', <PanelRight size={14} />)}
            {modeButton('bottom', 'Dock terminal at the bottom', <PanelBottom size={14} />)}
            {modeButton('float', 'Float terminal as a window', <AppWindow size={14} />)}
            <button
              type="button"
              onClick={() => setLayout({ maximized: !maximized })}
              title={maximized ? 'Show the steps again' : 'Maximize terminal'}
              aria-label={maximized ? 'Show the steps again' : 'Maximize terminal'}
              className="rounded-md p-1.5 text-white/60 hover:bg-white/10 hover:text-white"
            >
              {maximized ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
            </button>
            {onReconnect && (
              <button type="button" onClick={onReconnect} title="Reconnect terminal" aria-label="Reconnect terminal" className="rounded-md p-1.5 text-white/60 hover:bg-white/10 hover:text-white">
                <RotateCw size={14} />
              </button>
            )}
          </span>
        </header>
        <div className="min-h-0 flex-1">{terminal}</div>
        {mode === 'float' && !maximized && (
          <div
            role="presentation"
            title="Drag to resize"
            className="absolute bottom-0 right-0 size-4 cursor-se-resize"
            style={{ background: 'linear-gradient(135deg, transparent 50%, rgba(255,255,255,0.35) 50%)' }}
            onPointerDown={beginFloat('resize')}
            onPointerMove={moveFloat}
            onPointerUp={endFloat}
          />
        )}
      </section>
    </div>
  );
}

function clampRect(rect: Rect, area: { w: number; h: number }): Rect {
  if (!area.w || !area.h) return rect;
  const w = Math.min(Math.max(MIN_FLOAT.w, rect.w), area.w);
  const h = Math.min(Math.max(MIN_FLOAT.h, rect.h), area.h);
  return { w, h, x: Math.min(Math.max(0, rect.x), area.w - w), y: Math.min(Math.max(0, rect.y), area.h - h) };
}

/** The divider between steps and terminal. Drag it, or focus it and use the arrow keys. */
function SplitHandle({ vertical, split, onChange }: { vertical: boolean; split: number; onChange: (value: number) => void }) {
  const dragging = useRef(false);
  const clamp = (value: number) => Math.round(Math.min(75, Math.max(25, value)));
  return (
    <div
      role="separator"
      tabIndex={0}
      aria-orientation={vertical ? 'vertical' : 'horizontal'}
      aria-label="Resize the terminal"
      aria-valuenow={split}
      aria-valuemin={25}
      aria-valuemax={75}
      title="Drag to resize. Double-click to reset."
      className={`group relative z-10 flex shrink-0 items-center justify-center bg-border/60 outline-none transition-colors hover:bg-primary/40 focus-visible:bg-primary/60 ${vertical ? 'w-1.5 cursor-col-resize' : 'h-1.5 cursor-row-resize'}`}
      onPointerDown={(event) => {
        dragging.current = true;
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={(event) => {
        if (!dragging.current) return;
        const parent = event.currentTarget.parentElement?.getBoundingClientRect();
        if (!parent) return;
        onChange(clamp(vertical ? ((parent.right - event.clientX) / parent.width) * 100 : ((parent.bottom - event.clientY) / parent.height) * 100));
      }}
      onPointerUp={() => {
        dragging.current = false;
      }}
      onDoubleClick={() => onChange(55)}
      onKeyDown={(event) => {
        const grow = vertical ? 'ArrowLeft' : 'ArrowUp';
        const shrink = vertical ? 'ArrowRight' : 'ArrowDown';
        if (event.key === grow) onChange(clamp(split + 5));
        else if (event.key === shrink) onChange(clamp(split - 5));
        else return;
        event.preventDefault();
      }}
    >
      <span className={`rounded-full bg-muted-foreground/40 group-hover:bg-primary ${vertical ? 'h-10 w-0.5' : 'h-0.5 w-10'}`} />
    </div>
  );
}
