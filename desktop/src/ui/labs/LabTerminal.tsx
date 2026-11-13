import { useCallback, useEffect, useRef, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';

import type { LabsAPI } from '../../domain/labs';

/** Text to send to the terminal. `submit: false` only types it, so the learner edits it and presses Enter. */
export type TerminalCommand = { text: string; nonce: number; submit?: boolean };
/** The terminal calls a lab runtime makes. Course workspaces and shell labs both provide them. */
export type TerminalAPI = Pick<
  LabsAPI,
  'openTerminal' | 'closeTerminal' | 'terminalInput' | 'resizeTerminal' | 'onTerminalData'
>;

export function LabTerminal({
  blockId,
  onError,
  label,
  runCommand,
  onSent,
  api: apiOverride,
}: {
  label?: string;
  /** Defaults to the course workspace API. */
  api?: TerminalAPI;
  blockId: string;
  onError: (message: string) => void;
  runCommand?: TerminalCommand | null;
  onSent?: () => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const [revision, setRevision] = useState(0);
  const [dark] = useState(
    () => window.matchMedia('(prefers-color-scheme: dark)').matches,
  );
  const session = useRef<{ id: string; ready: boolean } | null>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const handled = useRef<number | null>(null);
  const commandRef = useRef(runCommand);
  commandRef.current = runCommand;
  // The callbacks come from a parent that re-renders often (live checking). Keep them in refs, so a
  // new function each render does not reopen the terminal, which would start a new shell every time.
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;
  const onSentRef = useRef(onSent);
  onSentRef.current = onSent;
  const send = useCallback(() => {
    const command = commandRef.current;
    const active = session.current;
    if (
      !command ||
      !active?.ready ||
      handled.current === command.nonce ||
      !command.text.trim()
    )
      return;
    handled.current = command.nonce;
    // Execute every snippet line: newlines become shell submits. Typing only sends one line, no Enter.
    const payload = command.text.replace(/\r?\n/g, command.submit === false ? ' ' : '\r');
    const submit = command.submit === false || payload.endsWith('\r') ? payload : payload + '\r';
    terminalRef.current?.focus();
    const api = apiOverride ?? window.buildment.labs;
    for (let offset = 0; offset < submit.length; offset += 2048)
      void api
        .terminalInput(blockId, active.id, submit.slice(offset, offset + 2048))
        .catch((error: unknown) => onErrorRef.current(String(error)));
    onSentRef.current?.();
  }, [blockId, apiOverride]);
  useEffect(() => {
    if (!host.current) return;
    const api = apiOverride ?? window.buildment.labs;
    const id = crypto.randomUUID();
    let active = true;
    let ready = false;
    const terminal = new Terminal({
      fontSize: 13,
      cursorBlink: true,
      convertEol: true,
      theme: dark
        ? { background: '#15171c', foreground: '#e6e6e6' }
        : { background: '#ffffff', foreground: '#1f2937', cursor: '#1f2937' },
    });
    const fit = new FitAddon();
    terminal.loadAddon(fit);
    terminal.open(host.current);
    terminalRef.current = terminal;
    const report = (error: unknown) => {
      if (active) onErrorRef.current(String(error));
    };
    const resize = () => {
      if (!host.current?.clientWidth || !host.current?.clientHeight) return;
      fit.fit();
      if (ready)
        void api
          .resizeTerminal(
            blockId,
            id,
            Math.min(500, terminal.cols),
            Math.min(500, terminal.rows),
          )
          .catch(report);
    };
    const off = api.onTerminalData((event) => {
      if (event.id === id) terminal.write(event.data);
    });
    const input = terminal.onData((data) => {
      // Chunk large pastes to the IPC input limit.
      for (let offset = 0; offset < data.length; offset += 2048)
        void api
          .terminalInput(blockId, id, data.slice(offset, offset + 2048))
          .catch(report);
    });
    let frame = 0;
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(resize);
    });
    observer.observe(host.current);
    void api
      .openTerminal(blockId, id)
      .then(() => {
        if (!active) {
          void api.closeTerminal(blockId, id);
          return;
        }
        ready = true;
        session.current = { id, ready: true };
        resize();
        send();
      })
      .catch(report);
    return () => {
      active = false;
      session.current = null;
      terminalRef.current = null;
      cancelAnimationFrame(frame);
      observer.disconnect();
      off();
      input.dispose();
      terminal.dispose();
      void api.closeTerminal(blockId, id).catch(() => {});
    };
  }, [blockId, revision, dark, send, apiOverride]);
  useEffect(() => {
    send();
  }, [send, runCommand]);
  return (
    <div
      className={`flex h-full min-w-0 overflow-hidden min-h-[170px] flex-col ${dark ? 'bg-[#15171c] text-white' : 'bg-white text-neutral-900'}`}
    >
      {label && (
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-2 text-xs">
          <span>{label}</span>
          <button
            className="underline"
            onClick={() => setRevision((n) => n + 1)}
          >
            Reconnect
          </button>
        </div>
      )}
      <div ref={host} className="min-h-0 flex-1 px-3 pt-2" />
    </div>
  );
}
