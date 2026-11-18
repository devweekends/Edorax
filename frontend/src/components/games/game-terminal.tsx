"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { cn } from "@/lib/utils";
import type { GameSounds } from "@/lib/games/audio";

export type TerminalLine = {
  /** "in" is what the player typed, "out" is normal output, "err" an error, "sys" a note from the game. */
  kind: "in" | "out" | "err" | "sys";
  text: string;
  /** The prompt that was showing when the player typed this line (only for "in"). */
  prompt?: string;
};

type Props = {
  lines: TerminalLine[];
  prompt: string;
  onSubmit: (line: string) => void;
  sounds: GameSounds;
  locked?: boolean;
  /** Words Tab can finish, for example command names. */
  completions?: string[];
  placeholder?: string;
  className?: string;
  /** Height of the output area. */
  height?: string;
};

/**
 * A small terminal for the command games: a scrolling log, a prompt, history on the arrow keys and
 * Tab to finish a command name. The game owns the lines and the rules; this only draws and types.
 */
export function GameTerminal({ lines, prompt, onSubmit, sounds, locked = false, completions = [], placeholder, className, height = "h-80" }: Props) {
  const [value, setValue] = useState("");
  const [cursor, setCursor] = useState<number | null>(null);
  const log = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const history = useRef<string[]>([]);

  useEffect(() => {
    const el = log.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lines]);

  function send() {
    const line = value;
    if (!line.trim()) return;
    history.current.push(line);
    setCursor(null);
    setValue("");
    sounds.enter();
    onSubmit(line);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      send();
    } else if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      event.preventDefault();
      const past = history.current;
      if (past.length === 0) return;
      const next = event.key === "ArrowUp" ? (cursor === null ? past.length - 1 : Math.max(0, cursor - 1)) : cursor === null ? null : cursor + 1;
      if (next === null || next >= past.length) {
        setCursor(null);
        setValue("");
      } else {
        setCursor(next);
        setValue(past[next]!);
      }
    } else if (event.key === "Tab") {
      event.preventDefault();
      const words = value.split(" ");
      const last = words[words.length - 1] ?? "";
      if (!last) return;
      const matches = completions.filter((word) => word.startsWith(last));
      if (matches.length === 1) {
        words[words.length - 1] = matches[0]!;
        setValue(words.join(" ") + " ");
      }
    }
  }

  return (
    <div
      className={cn("overflow-hidden rounded-md border border-[var(--code-border)] bg-[var(--code-surface)] font-mono text-[13px] leading-relaxed text-[var(--code-fg)]", className)}
      onClick={() => input.current?.focus()}
    >
      <div ref={log} role="log" aria-live="polite" aria-label="Terminal output" className={cn("overflow-y-auto p-3", height)}>
        {lines.map((line, i) => (
          <div
            key={i}
            className={cn(
              "whitespace-pre-wrap break-words",
              line.kind === "in" && "text-[var(--code-fg)]",
              line.kind === "out" && "text-[var(--code-lang-fg)]",
              line.kind === "err" && "text-red-500 dark:text-red-400",
              line.kind === "sys" && "italic text-brand-yellow",
            )}
          >
            {line.kind === "in" ? <span className="select-none text-emerald-500">{line.prompt ?? prompt} </span> : null}
            {line.text}
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2 border-t border-[var(--code-border)] px-3 py-2">
        <span className="select-none text-emerald-500">{prompt}</span>
        <input
          ref={input}
          value={value}
          disabled={locked}
          onChange={(event) => {
            setValue(event.target.value);
            sounds.key();
          }}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          spellCheck={false}
          autoCapitalize="off"
          autoComplete="off"
          autoCorrect="off"
          aria-label="Type a command and press Enter"
          className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted-foreground/60"
        />
      </div>
    </div>
  );
}
