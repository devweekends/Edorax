import { useCallback, useEffect, useRef, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';

export type TerminalCommand = { text: string; nonce: number };

export function LabTerminal({
  blockId,
  onError,
  label,
  runCommand,
  onSent,
}: {
  label?: string;
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
  const handled = useRef<number | null>(null);
  const commandRef = useRef(runCommand);
  commandRef.current = runCommand;
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
    // Execute every snippet line: newlines become shell submits.
    const payload = command.text.replace(/\r?\n/g, '\r');
    const submit = payload.endsWith('\r') ? payload : payload + '\r';
    const api = window.buildment.labs;
    for (let offset = 0; offset < submit.length; offset += 2048)
      void api
        .terminalInput(blockId, active.id, submit.slice(offset, offset + 2048))
        .catch((error: unknown) => onError(String(error)));
    onSent?.();
  }, [blockId, onError, onSent]);
  useEffect(() => {
    if (!host.current) return;
    const api = window.buildment.labs;
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
    const report = (error: unknown) => {
      if (active) onError(String(error));
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
      cancelAnimationFrame(frame);
      observer.disconnect();
      off();
      input.dispose();
      terminal.dispose();
      void api.closeTerminal(blockId, id).catch(() => {});
    };
  }, [blockId, revision, onError, dark, send]);
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
