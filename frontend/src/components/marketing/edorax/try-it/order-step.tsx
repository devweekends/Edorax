"use client";

import { useRef, useState } from "react";
import { COBALT, INK, LINE, MUTED, TINT, YELLOW } from "./brand";
import { StepHeading, type StepProps } from "./step-frame";
import s from "./try-it.module.css";

const RIGHT_ORDER = ["dns", "connect", "request", "reply"] as const;
type BlockId = (typeof RIGHT_ORDER)[number];

const LABELS: Record<BlockId, string> = {
  dns: "Ask DNS for the address",
  connect: "Connect to the server",
  request: "Send the request",
  reply: "Get the page back",
};

const START: BlockId[] = ["request", "dns", "reply", "connect"];

function move<T>(list: T[], from: number, to: number): T[] {
  const next = list.slice();
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

/**
 * Step 2: put the four steps of loading a page in order. Drag a block with a mouse or
 * finger, or with the keyboard: Space picks a block up, the arrow keys move it, Space
 * or Escape puts it down.
 */
export function OrderStep({ onSolved, headingRef }: StepProps) {
  const [order, setOrder] = useState<BlockId[]>(START);
  const [lifted, setLifted] = useState<BlockId | null>(null);
  const [dragging, setDragging] = useState<BlockId | null>(null);
  const [message, setMessage] = useState("");
  const [solved, setSolved] = useState(false);
  const listRef = useRef<HTMLOListElement>(null);

  function setAndClear(next: BlockId[]) {
    setOrder(next);
    if (message && !solved) setMessage("");
  }

  function indexAtY(clientY: number): number {
    const items = Array.from(listRef.current?.children ?? []) as HTMLElement[];
    for (let i = 0; i < items.length; i++) {
      const box = items[i].getBoundingClientRect();
      if (clientY < box.top + box.height / 2) return i;
    }
    return items.length - 1;
  }

  function onPointerDown(e: React.PointerEvent<HTMLButtonElement>, id: BlockId) {
    if (solved || e.button !== 0) return;
    // Capture can fail for a pointer the browser no longer tracks; dragging still works without it.
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {}
    setDragging(id);
  }

  function onPointerMove(e: React.PointerEvent<HTMLButtonElement>, id: BlockId) {
    if (dragging !== id) return;
    const from = order.indexOf(id);
    const to = indexAtY(e.clientY);
    if (from !== to) setAndClear(move(order, from, to));
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLButtonElement>, id: BlockId) {
    if (solved) return;
    const at = order.indexOf(id);
    if (e.key === " " || e.key === "Enter") {
      e.preventDefault();
      if (lifted === id) {
        setLifted(null);
        setMessage(`${LABELS[id]} placed at position ${at + 1}.`);
      } else {
        setLifted(id);
        setMessage(`${LABELS[id]} picked up. Use the up and down arrows, then Space to place it.`);
      }
    } else if (e.key === "Escape" && lifted === id) {
      setLifted(null);
      setMessage(`${LABELS[id]} placed at position ${at + 1}.`);
    } else if ((e.key === "ArrowUp" || e.key === "ArrowDown") && lifted === id) {
      e.preventDefault();
      const to = e.key === "ArrowUp" ? Math.max(0, at - 1) : Math.min(order.length - 1, at + 1);
      if (to !== at) {
        setOrder(move(order, at, to));
        setMessage(`Position ${to + 1} of ${order.length}.`);
      }
    }
  }

  function check() {
    setLifted(null);
    if (order.every((id, i) => id === RIGHT_ORDER[i])) {
      setSolved(true);
      setMessage("That is the whole trip: name, address, connection, request, reply.");
      onSolved();
      return;
    }
    const firstWrong = order.findIndex((id, i) => id !== RIGHT_ORDER[i]);
    setMessage(
      firstWrong === 0
        ? "Not yet. What does your phone need before it can connect to anything?"
        : `Close. The first ${firstWrong} ${firstWrong === 1 ? "is" : "are"} right. What has to happen next?`,
    );
  }

  return (
    <div className={s.stepBody}>
      <StepHeading eyebrow="Computer networking, chapter 3" headingRef={headingRef}>
        Put the trip in order, from Go to the page on your screen.
      </StepHeading>
      <p id="order-help" style={{ margin: 0, fontSize: "14px", color: MUTED }}>
        Drag the blocks into order.<span className={s.keyboardTip}> On a keyboard, press Space on a block, then the arrow keys.</span>
      </p>
      <ol ref={listRef} className={s.orderList} aria-describedby="order-help">
        {order.map((id, i) => {
          const active = lifted === id || dragging === id;
          return (
            <li key={id}>
              <button
                type="button"
                className={s.orderBlock}
                aria-pressed={lifted === id}
                aria-label={`${LABELS[id]}, position ${i + 1} of ${order.length}`}
                disabled={solved}
                onPointerDown={(e) => onPointerDown(e, id)}
                onPointerMove={(e) => onPointerMove(e, id)}
                onPointerUp={() => setDragging(null)}
                onPointerCancel={() => setDragging(null)}
                onKeyDown={(e) => onKeyDown(e, id)}
                onBlur={() => setLifted((l) => (l === id ? null : l))}
                style={{
                  background: solved ? TINT : "#FFFFFF",
                  border: `2px solid ${solved ? COBALT : active ? COBALT : LINE}`,
                  boxShadow: active ? `4px 4px 0 ${YELLOW}` : "none",
                  color: INK,
                  cursor: solved ? "default" : dragging === id ? "grabbing" : "grab",
                }}
              >
                <span aria-hidden="true" style={{ fontWeight: 700, color: COBALT, minWidth: "16px" }}>{i + 1}</span>
                <span style={{ flex: 1 }}>{LABELS[id]}</span>
                {!solved ? (
                  <svg aria-hidden="true" width="14" height="20" viewBox="0 0 14 20">
                    {[3, 10, 17].map((y) => (
                      <g key={y}>
                        <circle cx="4" cy={y} r="1.8" fill={MUTED} />
                        <circle cx="10" cy={y} r="1.8" fill={MUTED} />
                      </g>
                    ))}
                  </svg>
                ) : null}
              </button>
            </li>
          );
        })}
      </ol>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "12px" }}>
        {!solved ? (
          <button type="button" onClick={check} className={s.primary}>
            Check the order
          </button>
        ) : null}
        <p role="status" aria-live="polite" style={{ margin: 0, flex: "1 1 220px", fontSize: "15px", lineHeight: 1.5, color: solved ? INK : MUTED }}>
          {message}
        </p>
      </div>
    </div>
  );
}
