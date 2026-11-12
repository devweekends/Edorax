"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Highlighter, Trash2, X } from "lucide-react";
import { saveHighlight, updateHighlight, deleteHighlight } from "@/server/actions/highlights";
import type { HighlightView, HighlightColor } from "@/server/actions/highlights";
import { toast } from "@/components/ui/app-toast";
import { cn } from "@/lib/utils";

const COLOR_CLASSES: Record<HighlightColor, string> = {
  YELLOW: "bg-yellow-200/70 dark:bg-yellow-400/30",
  GREEN: "bg-green-200/70 dark:bg-green-400/30",
  BLUE: "bg-blue-200/70 dark:bg-blue-400/30",
  PINK: "bg-pink-200/70 dark:bg-pink-400/30",
};

const COLORS: HighlightColor[] = ["YELLOW", "GREEN", "BLUE", "PINK"];

type Highlight = HighlightView;

// Interactive chrome inside the article (the "Add a note" buttons, inputs, the
// highlight toolbar) is not lesson text. Quotes and anchors must skip it, or a
// selection that crosses a heading would store "Add a note" in the quote.
const NON_CONTENT_SELECTOR =
  "button, [role='button'], input, textarea, select, [contenteditable=''], [contenteditable='true'], [data-hl-toolbar]";

function isContentText(text: Text): boolean {
  const parent = text.parentElement;
  return Boolean(parent && !parent.closest(NON_CONTENT_SELECTOR));
}

function contentTextNodes(container: HTMLElement): Text[] {
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, null);
  const nodes: Text[] = [];
  let node: Node | null;
  while ((node = walker.nextNode())) {
    const text = node as Text;
    if (isContentText(text)) nodes.push(text);
  }
  return nodes;
}

function findTextRange(container: HTMLElement, quote: string, occurrence: number): Range | null {
  if (!quote) return null;
  const nodes = contentTextNodes(container);
  let full = "";
  const offsets: { node: Text; start: number; end: number }[] = [];
  for (const tn of nodes) {
    const t = tn.nodeValue || "";
    offsets.push({ node: tn, start: full.length, end: full.length + t.length });
    full += t;
  }
  let idx = -1;
  let searchFrom = 0;
  for (let i = 0; i <= occurrence; i++) {
    const found = full.indexOf(quote, searchFrom);
    if (found === -1) return null;
    idx = found;
    searchFrom = found + 1;
  }
  const startOffset = idx;
  const endOffset = idx + quote.length;
  let startNode: Text | null = null;
  let startNodeOffset = 0;
  let endNode: Text | null = null;
  let endNodeOffset = 0;
  for (const o of offsets) {
    if (!startNode && startOffset >= o.start && startOffset < o.end) {
      startNode = o.node;
      startNodeOffset = startOffset - o.start;
    }
    if (!endNode && endOffset > o.start && endOffset <= o.end) {
      endNode = o.node;
      endNodeOffset = endOffset - o.start;
    }
  }
  // Fallbacks for ranges that land exactly on a node boundary.
  if (!startNode && offsets.length) {
    const last = offsets[offsets.length - 1];
    startNode = last.node;
    startNodeOffset = last.node.nodeValue?.length || 0;
  }
  if (!endNode && offsets.length) {
    const last = offsets[offsets.length - 1];
    endNode = last.node;
    endNodeOffset = last.node.nodeValue?.length || 0;
  }
  if (!startNode || !endNode) return null;
  const range = document.createRange();
  range.setStart(startNode, startNodeOffset);
  range.setEnd(endNode, endNodeOffset);
  return range;
}

function unwrapMarks(article: HTMLElement) {
  const marks = Array.from(article.querySelectorAll("mark.hl-mark"));
  for (const mark of marks) {
    const parent = mark.parentNode;
    if (!parent) continue;
    parent.replaceChild(document.createTextNode(mark.textContent || ""), mark);
  }
  article.normalize();
}

function renderHighlights(article: HTMLElement, highlights: Highlight[]) {
  unwrapMarks(article);
  // Build a per-character color map per text node, then rebuild each touched
  // text node with <mark> runs. Walking from the article (not the range's
  // common ancestor) ensures single-node ranges are handled, and overlaps are
  // resolved per character (later highlight wins).
  const nodeColors = new Map<Text, (HighlightColor | null)[]>();
  const nodeIds = new Map<Text, (string | null)[]>();

  const resolved: { h: Highlight; range: Range }[] = [];
  const unanchored: string[] = [];
  for (const h of highlights) {
    const range = findTextRange(article, h.quote, h.occurrence);
    if (range) resolved.push({ h, range });
    else unanchored.push(h.id);
  }

  for (const { h, range } of resolved) {
    const nodes = contentTextNodes(article).filter((node) => range.intersectsNode(node));
    for (const tn of nodes) {
      if (!nodeColors.has(tn)) {
        const len = tn.nodeValue?.length || 0;
        nodeColors.set(tn, new Array(len).fill(null));
        nodeIds.set(tn, new Array(len).fill(null));
      }
      const colors = nodeColors.get(tn)!;
      const ids = nodeIds.get(tn)!;
      const len = tn.nodeValue?.length || 0;
      let start = 0;
      let end = len;
      if (tn === range.startContainer) start = range.startOffset;
      if (tn === range.endContainer) end = range.endOffset;
      for (let i = start; i < end && i < len; i++) {
        colors[i] = h.color;
        ids[i] = h.id;
      }
    }
  }

  for (const [tn, colors] of nodeColors) {
    const text = tn.nodeValue || "";
    const ids = nodeIds.get(tn)!;
    const parent = tn.parentNode;
    if (!parent) continue;
    const frag = document.createDocumentFragment();
    let i = 0;
    while (i < text.length) {
      const color = colors[i];
      const id = ids[i];
      let j = i;
      while (j < text.length && colors[j] === color && ids[j] === id) j++;
      const chunk = text.slice(i, j);
      if (color && id) {
        const mark = document.createElement("mark");
        mark.className = `hl-mark ${COLOR_CLASSES[color]}`;
        mark.dataset.highlightId = id;
        const h = highlights.find((x) => x.id === id);
        if (h?.note) mark.title = h.note;
        mark.textContent = chunk;
        frag.appendChild(mark);
      } else {
        frag.appendChild(document.createTextNode(chunk));
      }
      i = j;
    }
    parent.replaceChild(frag, tn);
  }
  return unanchored;
}

function offsetForBoundary(
  offsets: { node: Text; start: number; end: number }[],
  container: Node,
  offset: number,
  side: "start" | "end",
): number | null {
  if (container.nodeType === Node.TEXT_NODE) {
    const text = container as Text;
    const entry = offsets.find((item) => item.node === text);
    if (entry) return entry.start + offset;
  }
  // Element boundary: use the first or last content text node inside it.
  if (container.nodeType === Node.ELEMENT_NODE) {
    const inside = contentTextNodes(container as HTMLElement);
    const target = side === "start" ? inside[0] : inside[inside.length - 1];
    if (target) {
      const entry = offsets.find((item) => item.node === target);
      if (entry) return entry.start + (side === "start" ? 0 : target.nodeValue?.length || 0);
    }
  }
  return null;
}

function selectionToHighlight(article: HTMLElement, sel: Selection): {
  quote: string;
  prefix: string;
  suffix: string;
  occurrence: number;
} | null {
  if (!sel.rangeCount) return null;
  const range = sel.getRangeAt(0);
  if (range.collapsed) return null;
  if (!article.contains(range.commonAncestorContainer)) return null;

  const nodes = contentTextNodes(article);
  let full = "";
  const offsets: { node: Text; start: number; end: number }[] = [];
  for (const tn of nodes) {
    const text = tn.nodeValue || "";
    offsets.push({ node: tn, start: full.length, end: full.length + text.length });
    full += text;
  }

  const startOffset = offsetForBoundary(offsets, range.startContainer, range.startOffset, "start");
  const endOffset = offsetForBoundary(offsets, range.endContainer, range.endOffset, "end");
  if (startOffset == null || endOffset == null || endOffset <= startOffset) return null;

  const raw = full.slice(startOffset, endOffset);
  const leading = raw.length - raw.trimStart().length;
  const quote = raw.trim();
  if (!quote || quote.length > 500) return null;
  const quoteStart = startOffset + leading;
  const quoteEnd = quoteStart + quote.length;

  let occurrence = 0;
  let searchFrom = 0;
  while (true) {
    const found = full.indexOf(quote, searchFrom);
    if (found === -1 || found > quoteStart) break;
    occurrence++;
    searchFrom = found + 1;
    if (found === quoteStart) break;
  }
  occurrence = Math.max(0, occurrence - 1);

  const prefixStart = Math.max(0, quoteStart - 40);
  const prefix = full.slice(prefixStart, quoteStart);
  const suffix = full.slice(quoteEnd, quoteEnd + 40);
  return { quote, prefix, suffix, occurrence };
}

export function ChapterHighlights({
  chapterId,
  initialHighlights,
  articleRef,
}: {
  chapterId: string;
  initialHighlights: Highlight[];
  articleRef: React.RefObject<HTMLElement | null>;
}) {
  const [highlights, setHighlights] = useState<Highlight[]>(initialHighlights);
  const [toolbar, setToolbar] = useState<{ x: number; y: number; selection: ReturnType<typeof selectionToHighlight> } | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState("");
  const [panelOpen, setPanelOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [unanchored, setUnanchored] = useState<string[]>([]);
  const savedSelection = useRef<ReturnType<typeof selectionToHighlight>>(null);

  // Render marks whenever highlights change
  useEffect(() => {
    const article = articleRef.current;
    if (!article) return;
    setUnanchored(renderHighlights(article, highlights));
  }, [highlights, articleRef]);

  // Also re-render on mount (article may not be ready immediately)
  useEffect(() => {
    const article = articleRef.current;
    if (!article) return;
    const t = setTimeout(() => setUnanchored(renderHighlights(article, highlights)), 50);
    return () => clearTimeout(t);
  }, [articleRef]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleMouseUp = useCallback(() => {
    const article = articleRef.current;
    if (!article) return;
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) {
      setToolbar(null);
      return;
    }
    const parsed = selectionToHighlight(article, sel);
    if (!parsed) {
      setToolbar(null);
      return;
    }
    savedSelection.current = parsed;
    const rect = sel.getRangeAt(0).getBoundingClientRect();
    setToolbar({ x: rect.left + rect.width / 2, y: rect.top - 8, selection: parsed });
  }, [articleRef]);

  useEffect(() => {
    const article = articleRef.current;
    if (!article) return;
    article.addEventListener("mouseup", handleMouseUp);
    article.addEventListener("touchend", handleMouseUp);
    return () => {
      article.removeEventListener("mouseup", handleMouseUp);
      article.removeEventListener("touchend", handleMouseUp);
    };
  }, [articleRef, handleMouseUp]);

  // Close toolbar on outside click
  useEffect(() => {
    if (!toolbar) return;
    const onClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest("[data-hl-toolbar]")) return;
      setToolbar(null);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [toolbar]);

  // Clicking a highlight opens its note editor.
  useEffect(() => {
    const article = articleRef.current;
    if (!article) return;
    const onClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const mark = target.closest("mark.hl-mark") as HTMLElement | null;
      if (!mark) return;
      const id = mark.dataset.highlightId;
      if (!id) return;
      const h = highlights.find((x) => x.id === id);
      if (h) openNote(h);
    };
    article.addEventListener("click", onClick);
    return () => article.removeEventListener("click", onClick);
  }, [articleRef, highlights]);

  async function createHighlight(color: HighlightColor) {
    const parsed = savedSelection.current || toolbar?.selection;
    if (!parsed) return;
    setPending(true);
    const res = await saveHighlight({
      chapterId,
      color,
      quote: parsed.quote,
      prefix: parsed.prefix,
      suffix: parsed.suffix,
      occurrence: parsed.occurrence,
      note: null,
    });
    setPending(false);
    if (res.ok) {
      setHighlights((prev) => [...prev, res.data]);
      setToolbar(null);
      window.getSelection()?.removeAllRanges();
    } else {
      toast(res.error, "error");
    }
  }

  function openNote(h: Highlight) {
    setActiveId(h.id);
    setNoteDraft(h.note ?? "");
  }

  async function saveNote() {
    if (!activeId) return;
    setPending(true);
    const res = await updateHighlight({ highlightId: activeId, note: noteDraft });
    setPending(false);
    if (res.ok) {
      setHighlights((prev) => prev.map((h) => (h.id === activeId ? res.data : h)));
      setActiveId(null);
    }
  }

  async function changeColor(h: Highlight, color: HighlightColor) {
    setPending(true);
    const res = await updateHighlight({ highlightId: h.id, color });
    setPending(false);
    if (res.ok) setHighlights((prev) => prev.map((x) => (x.id === h.id ? res.data : x)));
  }

  async function remove(h: Highlight) {
    setPending(true);
    const res = await deleteHighlight({ highlightId: h.id });
    setPending(false);
    if (res.ok) {
      setHighlights((prev) => prev.filter((x) => x.id !== h.id));
      setActiveId(null);
    }
  }

  const activeHighlight = highlights.find((h) => h.id === activeId) || null;

  return (
    <>
      {toolbar && (
        <div
          data-hl-toolbar
          className="fixed z-[60] flex items-center gap-1 rounded-full border border-border bg-card px-2 py-1 shadow-lg"
          style={{ left: toolbar.x, top: toolbar.y, transform: "translate(-50%, -100%)" }}
        >
          {COLORS.map((c) => (
            <button
              key={c}
              type="button"
              disabled={pending}
              onClick={() => createHighlight(c)}
              className={cn("size-6 rounded-full border border-border", COLOR_CLASSES[c])}
              aria-label={`Highlight ${c.toLowerCase()}`}
            />
          ))}
          <button
            type="button"
            onClick={() => setToolbar(null)}
            className="ml-1 rounded p-1 text-muted-foreground hover:text-foreground"
            aria-label="Cancel"
          >
            <X className="size-3.5" />
          </button>
        </div>
      )}

      {activeHighlight && (
        <div
          data-hl-toolbar
          className="fixed z-[60] w-72 rounded-xl border border-border bg-card p-3 shadow-xl"
          style={{ left: "50%", top: "50%", transform: "translate(-50%, -50%)" }}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Highlight note</span>
            <button type="button" onClick={() => setActiveId(null)} aria-label="Close">
              <X className="size-3.5" />
            </button>
          </div>
          <textarea
            value={noteDraft}
            onChange={(e) => setNoteDraft(e.target.value)}
            maxLength={5000}
            rows={3}
            className="mt-2 w-full resize-y rounded-lg border bg-background px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          />
          <div className="mt-2 flex items-center justify-between">
            <button
              type="button"
              onClick={() => remove(activeHighlight)}
              className="inline-flex items-center gap-1 text-xs text-destructive hover:underline"
            >
              <Trash2 className="size-3.5" /> Delete
            </button>
            <div className="flex gap-1">
              {COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  disabled={pending}
                  onClick={() => changeColor(activeHighlight, c)}
                  className={cn("size-5 rounded-full border border-border", COLOR_CLASSES[c], activeHighlight.color === c && "ring-2 ring-foreground")}
                  aria-label={`Color ${c.toLowerCase()}`}
                />
              ))}
            </div>
            <button
              type="button"
              disabled={pending}
              onClick={saveNote}
              className="rounded-md bg-foreground px-3 py-1 text-xs font-medium text-background"
            >
              Save
            </button>
          </div>
        </div>
      )}

      {/* Floating highlights panel toggle */}
      <button
        type="button"
        onClick={() => setPanelOpen((v) => !v)}
        className="fixed bottom-6 right-6 z-50 inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-sm shadow-lg hover:bg-muted"
        aria-label="Open highlights"
      >
        <Highlighter className="size-4" />
        Highlights{highlights.length ? ` (${highlights.length})` : ""}
      </button>

      {panelOpen && (
        <div className="fixed bottom-20 right-6 z-50 w-80 max-h-[60vh] overflow-auto rounded-xl border border-border bg-card p-3 shadow-2xl">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-medium">This chapter</span>
            <button type="button" onClick={() => setPanelOpen(false)} aria-label="Close">
              <X className="size-4" />
            </button>
          </div>
          {unanchored.length > 0 ? (
            <p className="mb-2 rounded-md border border-border bg-muted/30 px-2 py-1.5 text-xs text-muted-foreground">
              {unanchored.length} highlight{unanchored.length === 1 ? "" : "s"} could not be found in this version of the chapter.
            </p>
          ) : null}
          {highlights.length === 0 ? (
            <p className="text-sm text-muted-foreground">Select text to highlight.</p>
          ) : (
            <ul className="space-y-2">
              {highlights.map((h) => (
                <li key={h.id} className="rounded-lg border border-border p-2">
                  <button
                    type="button"
                    onClick={() => {
                      const mark = document.querySelector(`mark[data-highlight-id="${h.id}"]`);
                      mark?.scrollIntoView({ behavior: "smooth", block: "center" });
                    }}
                    className="block w-full text-left"
                  >
                    <span className={cn("inline-block size-2 rounded-full mr-2", COLOR_CLASSES[h.color].split(" ")[0])} />
                    <span className="text-sm">&ldquo;{h.quote.slice(0, 80)}{h.quote.length > 80 ? "…" : ""}&rdquo;</span>
                  </button>
                  {h.note && <p className="mt-1 text-xs text-muted-foreground">{h.note}</p>}
                  <div className="mt-1 flex gap-2">
                    <button type="button" onClick={() => openNote(h)} className="text-xs text-muted-foreground hover:text-foreground">
                      Note
                    </button>
                    <button type="button" onClick={() => remove(h)} className="text-xs text-destructive hover:underline">
                      Delete
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </>
  );
}
