import { BrowserPreview } from './BrowserPreview';
import {
  Files,
  Globe,
  TerminalSquare,
  FolderPlus,
  FolderOpen,
} from 'lucide-react';
import { ProjectEditor } from './ProjectEditor';
import { useCallback, useEffect, useRef, useState } from 'react';
import { LabTerminal } from './LabTerminal';
import type { CodeEditorProps } from '@buildment/learning-ui/blocks/exercises/CodeExerciseClient';
import type { LabStatus } from '../../domain/labs';

const readableError = (error: unknown) =>
  (error instanceof Error ? error.message : String(error))
    .replace(/^(Error: )?Error invoking remote method '[^']+': (Error: )?/, '')
    .replace(/^Error: /, '');

const button =
  'rounded-lg border border-border px-3 py-2 text-xs font-medium hover:bg-muted disabled:opacity-40';

export default function CourseCodeEditor({
  blockId,
  practice = false,
  ...editor
}: CodeEditorProps & { blockId: string; practice?: boolean }) {
  const api = window.buildment.labs;
  const [view, setView] = useState<'files' | 'browser'>('files');
  const [terminalVisible, setTerminalVisible] = useState(true);
  const [mode, setMode] = useState<'local' | 'docker'>('local');
  const [terminalActive, setTerminalActive] = useState(false);
  const generation = useRef(0);
  const [configured, setConfigured] = useState(false);
  const [folder, setFolder] = useState('');
  const [status, setStatus] = useState<LabStatus>();
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [confirmReset, setConfirmReset] = useState(false);
  const refreshStatus = useCallback(async () => {
    const request = generation.current;
    const next = await api.status(blockId);
    if (request === generation.current) {
      setStatus(next);
      if (!next.running || !next.available) setTerminalActive(false);
    }
    return next;
  }, [api, blockId]);
  const onError = useCallback(
    (error: string) => {
      const request = generation.current;
      setTerminalActive(false);
      setError(readableError(error));
      void refreshStatus()
        .then((next) => {
          if (
            request === generation.current &&
            (!next.available || !next.running)
          )
            setError(next.message);
        })
        .catch(() => {});
    },
    [refreshStatus],
  );
  useEffect(() => {
    if (!configured || busy) return;
    let active = true;
    let pending = false;
    const check = async () => {
      if (pending) return;
      pending = true;
      try {
        const next = await api.status(blockId);
        if (active) {
          setStatus(next);
          if (!next.running || !next.available) setTerminalActive(false);
        }
      } catch (error) {
        if (active) {
          setTerminalActive(false);
          setError(readableError(error));
        }
      } finally {
        pending = false;
      }
    };
    void check();
    const timer = window.setInterval(() => void check(), 5000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [api, blockId, configured, mode, folder, busy]);
  async function run(label: string, action: () => Promise<void>) {
    setBusy(label);
    setError('');
    setMessage('');
    try {
      await action();
    } catch (error) {
      setError(readableError(error));
      if (configured) {
        try {
          const next = await refreshStatus();
          if (!next.available || !next.running) setError(next.message);
        } catch {}
      }
    } finally {
      setBusy('');
    }
  }
  async function configure(next: 'local' | 'docker', createProject = false) {
    if (
      configured &&
      !window.confirm(
        'Switch workspace? Save any edited project files first. Your course answer stays in the editor.',
      )
    )
      return false;
    generation.current += 1;
    const result = await api.configure(blockId, next, createProject);
    if (!result) return false;
    setTerminalActive(false);
    setStatus(undefined);
    setMode(result.mode);
    setFolder(result.folder || '');
    setConfigured(true);
    return true;
  }
  return (
    <section
      aria-label="Course code workspace"
      className={`min-w-0 overflow-hidden rounded-2xl border border-border bg-background shadow-sm ${practice ? 'flex h-full min-h-[480px] flex-col' : ''}`}
    >
      <div className="flex flex-wrap items-center gap-2 border-b border-border bg-muted/30 p-3 text-xs">
        <label className="flex items-center gap-2">
          Runtime
          <select
            aria-label="Workspace runtime"
            value={mode}
            disabled={Boolean(busy)}
            onChange={(event) =>
              void run('Switching runtime…', async () => {
                await configure(event.target.value as 'local' | 'docker');
              })
            }
            className="rounded border border-border bg-background px-2 py-1"
          >
            <option value="local">Local machine</option>
            <option value="docker">Docker Linux</option>
          </select>
        </label>
        {mode === 'local' && (
          <>
            <button
              className={button}
              disabled={Boolean(busy)}
              onClick={() =>
                void run('Creating project…', async () => {
                  await configure('local', true);
                })
              }
            >
              <FolderPlus size={14} className="mr-1 inline" />
              New project
            </button>
            <button
              className={button}
              disabled={Boolean(busy)}
              onClick={() =>
                void run('Opening folder…', async () => {
                  await configure('local');
                })
              }
            >
              <FolderOpen size={14} className="mr-1 inline" />
              Open folder
            </button>
          </>
        )}
        <span className="min-w-0 flex-1 truncate" title={folder}>
          {mode === 'local'
            ? folder || 'Choose a project folder'
            : '/workspace · isolated Linux'}
        </span>
      </div>
      {configured && (
        <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2 text-xs">
          <span
            aria-hidden
            className={`h-2 w-2 shrink-0 rounded-full ${status?.running ? 'bg-emerald-500' : 'bg-amber-500'}`}
          />
          <span role="status" className="flex-1">
            {status?.message || 'Checking workspace…'}
          </span>
          <button
            aria-label="Check workspace status"
            disabled={Boolean(busy)}
            onClick={() =>
              void run('Checking workspace…', async () => {
                await refreshStatus();
              })
            }
            className="rounded px-2 py-1 hover:bg-muted disabled:opacity-40"
          >
            Retry status
          </button>
        </div>
      )}
      <nav
        aria-label="Workspace tools"
        className="flex items-center gap-1 border-b border-border bg-muted/30 px-3 py-2 text-xs"
      >
        <button
          aria-pressed={view === 'files'}
          onClick={() => setView('files')}
          className={`flex items-center gap-2 rounded-lg px-4 py-2 ${view === 'files' ? 'bg-background shadow-sm' : 'hover:bg-muted'}`}
        >
          <Files size={15} />
          Files
        </button>
        <button
          aria-pressed={view === 'browser'}
          onClick={() => setView('browser')}
          className={`flex items-center gap-2 rounded-lg px-4 py-2 ${view === 'browser' ? 'bg-background shadow-sm' : 'hover:bg-muted'}`}
        >
          <Globe size={15} />
          Browser
        </button>
        {terminalActive && (
          <button
            aria-label="Toggle bottom terminal"
            aria-pressed={terminalVisible}
            onClick={() => setTerminalVisible((v) => !v)}
            className="ml-auto flex items-center gap-2 rounded-lg px-3 py-2 hover:bg-muted"
          >
            <TerminalSquare size={15} />
            Terminal
          </button>
        )}
      </nav>
      <div
        hidden={view !== 'files'}
        className={practice ? 'min-h-0 flex-1' : ''}
      >
        <ProjectEditor
          entryPath={practice ? editor.filename : 'exercise.js'}
          key={mode + folder + (practice ? editor.filename : '')}
          fill={practice}
          blockId={blockId}
          connected={
            configured && (mode === 'local' || Boolean(status?.running))
          }
          {...editor}
        />
      </div>
      <div
        hidden={view !== 'browser'}
        className={practice ? 'min-h-0 flex-1 overflow-auto' : ''}
      >
        <BrowserPreview />
      </div>
      <div className="shrink-0 border-t border-border p-3">
        <div className="flex flex-wrap gap-2">
          {terminalActive ? (
            <>
              <button
                className={button}
                disabled={Boolean(busy) || editor.readOnly}
                onClick={() =>
                  void run('Saving to workspace…', async () => {
                    await api.saveProjectFile(
                      blockId,
                      practice ? editor.filename : 'exercise.js',
                      editor.value,
                    );
                    setMessage(
                      `Saved ${practice ? editor.filename : 'exercise.js'} in this workspace.`,
                    );
                  })
                }
              >
                Save to workspace
              </button>
              <button
                className={button}
                disabled={Boolean(busy) || editor.readOnly}
                onClick={() => {
                  if (
                    window.confirm(
                      `Replace the editor with ${practice ? editor.filename : 'exercise.js'} from the workspace?`,
                    )
                  )
                    void run('Loading workspace file…', async () =>
                      editor.onChange(
                        await api.readProjectFile(
                          blockId,
                          practice ? editor.filename : 'exercise.js',
                        ),
                      ),
                    );
                }}
              >
                Load from workspace
              </button>
              <button
                className={button}
                disabled={Boolean(busy)}
                onClick={() =>
                  void run('Stopping terminal…', async () => {
                    setTerminalActive(false);
                    await api.stop(blockId);
                    setStatus(await api.status(blockId));
                  })
                }
              >
                Stop terminal
              </button>
              {mode === 'docker' && (
                <button
                  className={button}
                  disabled={Boolean(busy)}
                  onClick={() => setConfirmReset(true)}
                >
                  Reset workspace
                </button>
              )}
            </>
          ) : (
            <button
              className={button}
              disabled={Boolean(busy)}
              onClick={() =>
                void run('Starting terminal…', async () => {
                  if (!configured && !(await configure(mode))) return;
                  const current = await api.status(blockId);
                  setStatus(current);
                  if (!current.available) {
                    setError(current.message);
                    return;
                  }
                  await api.start(blockId);
                  const started = await refreshStatus();
                  if (!started.available || !started.running) {
                    setError(started.message);
                    return;
                  }
                  setTerminalVisible(true);
                  setTerminalActive(true);
                })
              }
            >
              Start terminal
            </button>
          )}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          {mode === 'local'
            ? 'Local terminal · Commands run on your computer.'
            : 'Docker · Isolated Linux, without network access.'}
          {!practice && ' Course checks grade exercise.js.'}
        </p>
        {(busy || message) && (
          <p role="status" className="mt-2 text-xs">
            {busy || message}
          </p>
        )}
        {error && (
          <p role="alert" className="mt-2 text-sm text-red-600">
            {error}
          </p>
        )}
        {confirmReset && (
          <div
            role="alertdialog"
            aria-label="Reset exercise workspace"
            className="mt-3 rounded border border-border p-3 text-sm"
          >
            <p>
              Delete this exercise’s local workspace files? Your course answers
              and editor contents will be kept.
            </p>
            <div className="mt-2 flex gap-2">
              <button
                className={button}
                disabled={Boolean(busy)}
                onClick={() =>
                  void run('Resetting workspace…', async () => {
                    setTerminalActive(false);
                    await api.reset(blockId);
                    setStatus(await api.status(blockId));
                    setConfirmReset(false);
                  })
                }
              >
                Delete workspace files
              </button>
              <button className={button} onClick={() => setConfirmReset(false)}>
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
      {terminalActive && (
        <div
          hidden={!terminalVisible}
          className="h-[220px] shrink-0 min-w-0 overflow-hidden"
        >
          <LabTerminal
            blockId={blockId}
            onError={onError}
            label={
              mode === 'local'
                ? `Local terminal · ${folder}`
                : 'Docker terminal · /workspace'
            }
          />
        </div>
      )}
    </section>
  );
}
