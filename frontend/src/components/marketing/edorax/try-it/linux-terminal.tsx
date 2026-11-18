"use client";

import { useEffect, useRef, useState } from "react";
import { complete, createFileTree, displayPath, HOME, run, type ShellState } from "./fake-shell";
import { LINUX_TASKS } from "./linux-tasks";
import { MONO } from "./brand";
import s from "./try-it.module.css";

type Line = { id: number; kind: "in" | "out" | "err" | "ok" | "sys"; text: string };

const COLORS: Record<Line["kind"], string> = {
  in: "#F6F7FB",
  out: "#C9CFF0",
  err: "#FF9C8F",
  ok: "#FFC933",
  sys: "#7A8BFF",
};

function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * The practice terminal behind "Launch lab". Loaded only when a visitor presses the
 * button, so it adds nothing to the first page load.
 */
export default function LinuxTerminal({ onProgress }: { onProgress: (doneCount: number) => void }) {
  const shell = useRef<ShellState>({ root: createFileTree(), cwd: HOME, history: [] });
  const nextId = useRef(0);
  const [lines, setLines] = useState<Line[]>([]);
  const [ready, setReady] = useState(false);
  const [value, setValue] = useState("");
  const [cwd, setCwd] = useState(HOME);
  const [done, setDone] = useState(0);
  const [misses, setMisses] = useState(0);
  const historyAt = useRef<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const screenRef = useRef<HTMLDivElement>(null);

  function push(kind: Line["kind"], text: string | string[]) {
    const texts = Array.isArray(text) ? text : [text];
    setLines((prev) => [...prev, ...texts.map((t) => ({ id: nextId.current++, kind, text: t }))]);
  }

  // A short start-up so it feels like a machine coming up; instant with reduced motion.
  useEffect(() => {
    const boot = ["Starting a practice machine...", "edorax-lab is ready. Type help to see the commands it knows."];
    if (prefersReducedMotion()) {
      setLines(boot.map((t) => ({ id: nextId.current++, kind: "sys" as const, text: t })));
      setReady(true);
      return;
    }
    const timers = boot.map((t, i) => window.setTimeout(() => push("sys", t), 250 + i * 450));
    timers.push(window.setTimeout(() => setReady(true), 250 + boot.length * 450));
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, []);

  useEffect(() => {
    if (ready) inputRef.current?.focus({ preventScroll: true });
  }, [ready]);

  useEffect(() => {
    const el = screenRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lines]);

  function submit(line: string = value) {
    const state = shell.current;
    push("in", `learner@edorax-lab:${displayPath(state.cwd)}$ ${line}`);
    setValue("");
    historyAt.current = null;
    if (!line.trim()) return;
    state.history.push(line.trim());
    const result = run(state, line);
    setCwd(state.cwd);
    if (result.clear) setLines([]);
    else if (result.out.length) push(result.error ? "err" : "out", result.out);

    if (done >= LINUX_TASKS.length) return;
    const task = LINUX_TASKS[done];
    if (task.done(result.effect)) {
      const count = done + 1;
      setDone(count);
      setMisses(0);
      onProgress(count);
      push("ok", count === LINUX_TASKS.length ? "All three done. Well done." : `Task ${count} done.`);
    } else {
      setMisses((m) => m + 1);
      if (misses + 1 >= 2) push("sys", `Hint: try ${task.command}`);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    const history = shell.current.history;
    if (e.key === "Enter") {
      e.preventDefault();
      submit();
    } else if (e.key === "Tab") {
      // Only take Tab while there is something to complete, so keyboard users can still leave.
      if (!value.trim()) return;
      e.preventDefault();
      setValue(complete(shell.current, value));
    } else if (e.key === "ArrowUp" && history.length) {
      e.preventDefault();
      const at = historyAt.current === null ? history.length - 1 : Math.max(0, historyAt.current - 1);
      historyAt.current = at;
      setValue(history[at]);
    } else if (e.key === "ArrowDown" && historyAt.current !== null) {
      e.preventDefault();
      const at = historyAt.current + 1;
      historyAt.current = at < history.length ? at : null;
      setValue(at < history.length ? history[at] : "");
    } else if (e.key === "l" && e.ctrlKey) {
      e.preventDefault();
      setLines([]);
    }
  }

  return (
    <div className={s.terminal} onClick={() => inputRef.current?.focus({ preventScroll: true })}>
      <div className={s.terminalBar} aria-hidden="true">
        <span />
        <span />
        <span />
        <em>learner@edorax-lab</em>
      </div>
      <div ref={screenRef} className={s.terminalScreen} role="log" aria-live="polite" aria-label="Terminal output" style={{ fontFamily: MONO }}>
        {lines.map((l) => (
          <div key={l.id} style={{ color: COLORS[l.kind], whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
            {l.text}
          </div>
        ))}
        {ready ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
            style={{ display: "flex", gap: "8px", alignItems: "baseline" }}
          >
            <span aria-hidden="true" style={{ color: "#7A8BFF", whiteSpace: "nowrap" }}>
              {displayPath(cwd)} $
            </span>
            <input
              ref={inputRef}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={onKeyDown}
              aria-label="Type a command, then press Enter"
              autoCapitalize="off"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="send"
              className={s.terminalInput}
              style={{ fontFamily: MONO }}
            />
          </form>
        ) : null}
      </div>
      {ready && done < LINUX_TASKS.length ? (
        <div className={s.terminalHelp}>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              submit(LINUX_TASKS[done].command);
            }}
          >
            Run it for me
          </button>
        </div>
      ) : null}
    </div>
  );
}
