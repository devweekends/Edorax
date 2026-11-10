import {
  TheiaWorkspace,
  focusTheiaHost,
  type LessonSnippetRequest,
} from './TheiaWorkspace';
import type { TerminalCommand } from './LabTerminal';
import {
  createContext,
  lazy,
  Suspense,
  useContext,
  useCallback,
  useEffect,
  useState,
  useRef,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import {
  Code2,
  FolderOpen,
  FolderPlus,
  Maximize2,
  Minimize2,
  X,
  TerminalSquare,
} from 'lucide-react';

const StandaloneTerminal = lazy(() =>
  import('./CourseTerminal').then((module) => ({
    default: module.CourseTerminal,
  })),
);
const Editor = lazy(() => import('./CourseCodeEditor'));
type IDEState = {
  snippet: LessonSnippetRequest | null;
  lastExercise: string | null;
  forget: (id: string) => void;
  openSnippet: (source: string, language: string) => void;
  language: string;
  filename: string;
  source: string;
  setSource: (source: string) => void;
  open: boolean;
  focused: boolean;
  selected: string;
  host: HTMLDivElement | null;
  show: (id?: string) => void;
  close: () => void;
  toggleFocus: () => void;
  setHost: (host: HTMLDivElement | null) => void;
  pendingCommand: TerminalCommand | null;
  runInTerminal: (text: string) => void;
  clearCommand: () => void;
  workspaceRequest: { create: boolean; nonce: number } | null;
  requestWorkspace: (create: boolean) => void;
  clearWorkspaceRequest: () => void;
};
const Context = createContext<IDEState | null>(null);
export function useCourseIDE() {
  const value = useContext(Context);
  if (!value) throw new Error('Course IDE provider missing');
  return value;
}
export function CourseIDEProvider({ children }: { children: ReactNode }) {
  const [snippet, setSnippet] = useState<LessonSnippetRequest | null>(null);
  const snippetId = useRef(0);
  const [open, setOpen] = useState(false);
  const [focused, setFocused] = useState(false);
  const [selected, setSelected] = useState('scratch');
  const [lastExercise, setLastExercise] = useState<string | null>(null);
  const [source, setSource] = useState(
    '// Course workspace\nconsole.log("Ready to learn");\n',
  );
  const [language, setLanguage] = useState('javascript');
  const [filename, setFilename] = useState('exercise.js');
  const [host, setHost] = useState<HTMLDivElement | null>(null);
  const commandId = useRef(0);
  const [pendingCommand, setPendingCommand] = useState<TerminalCommand | null>(
    null,
  );
  const clearCommand = useCallback(() => setPendingCommand(null), []);
  const workspaceRequestId = useRef(0);
  const [workspaceRequest, setWorkspaceRequest] = useState<{
    create: boolean;
    nonce: number;
  } | null>(null);
  const clearWorkspaceRequest = useCallback(
    () => setWorkspaceRequest(null),
    [],
  );
  return (
    <Context.Provider
      value={{
        snippet,
        open,
        focused,
        selected,
        host,
        setHost,
        source,
        setSource,
        language,
        filename,
        openSnippet: (code, lang) => {
          const aliases: Record<string, string> = {
            js: 'javascript',
            ts: 'typescript',
            sh: 'shell',
            bash: 'shell',
            py: 'python',
            md: 'markdown',
          };
          const normalized = aliases[lang] || lang;
          const extensions: Record<string, string> = {
            javascript: 'js',
            typescript: 'ts',
            shell: 'sh',
            python: 'py',
            html: 'html',
            css: 'css',
            json: 'json',
            markdown: 'md',
          };
          const filename = 'snippet.' + (extensions[normalized] || 'txt');
          setSnippet({ id: ++snippetId.current, source: code, filename });
          setSource(code);
          setLanguage(normalized);
          setFilename('snippet.' + (extensions[normalized] || 'txt'));
          setSelected('scratch');
          setOpen(true);
        },
        lastExercise,
        forget: (id) => {
          if (lastExercise === id) setLastExercise(null);
          if (selected === id) setSelected('scratch');
        },
        show: (id) => {
          if (id) {
            setSelected(id);
            if (id !== 'scratch' && id !== 'terminal') setLastExercise(id);
          }
          setOpen(true);
        },
        close: () => {
          setOpen(false);
          setFocused(false);
        },
        toggleFocus: () => setFocused((value) => !value),
        pendingCommand,
        runInTerminal: (text) => {
          setPendingCommand({ text, nonce: ++commandId.current });
          setSelected('terminal');
          setOpen(true);
        },
        clearCommand,
        workspaceRequest,
        requestWorkspace: (create) => {
          setWorkspaceRequest({ create, nonce: ++workspaceRequestId.current });
          setSelected('scratch');
          setOpen(true);
        },
        clearWorkspaceRequest,
      }}
    >
      {children}
    </Context.Provider>
  );
}
export function OpenIDEButton({ compact = false }: { compact?: boolean } = {}) {
  const ide = useCourseIDE();
  return (
    <div
      className={`flex items-center gap-1.5 ${compact ? 'flex-col' : 'flex-wrap'}`}
    >
      <button
        aria-label={
          ide.open && ide.selected === 'terminal'
            ? 'Close terminal'
            : 'Open terminal'
        }
        onClick={() =>
          ide.open && ide.selected === 'terminal'
            ? ide.close()
            : ide.show('terminal')
        }
        className="flex items-center gap-2 rounded-md border border-border px-3 py-1.5 text-xs hover:bg-muted"
      >
        {ide.open && ide.selected === 'terminal' ? (
          <X size={15} />
        ) : (
          <TerminalSquare size={15} />
        )}
        {!compact && (
          <span>
            {ide.open && ide.selected === 'terminal'
              ? 'Close terminal'
              : 'Terminal'}
          </span>
        )}
      </button>
      {window.buildment.ide && ide.open && ide.selected === 'scratch' && (
        <>
          <button
            aria-label="Open folder"
            title="Open folder"
            onClick={() => ide.requestWorkspace(false)}
            className="rounded-md border border-border p-2 hover:bg-muted"
          >
            <FolderOpen size={15} />
          </button>
          <button
            aria-label="New project"
            title="New project"
            onClick={() => ide.requestWorkspace(true)}
            className="rounded-md border border-border p-2 hover:bg-muted"
          >
            <FolderPlus size={15} />
          </button>
        </>
      )}
      {!compact && ide.open && ide.lastExercise && (
        <div
          role="group"
          aria-label="IDE workspace"
          className="flex items-center rounded-md border border-border bg-muted/40 p-0.5 text-xs"
        >
          <button
            aria-pressed={ide.selected === 'scratch'}
            onClick={() => ide.show('scratch')}
            className="rounded px-2.5 py-1 font-medium transition-colors hover:bg-muted aria-pressed:bg-background aria-pressed:shadow-xs"
          >
            Course workspace
          </button>
          <button
            aria-pressed={ide.selected === ide.lastExercise}
            onClick={() => ide.show(ide.lastExercise!)}
            className="rounded px-2.5 py-1 font-medium transition-colors hover:bg-muted aria-pressed:bg-background aria-pressed:shadow-xs"
          >
            Lesson exercise
          </button>
        </div>
      )}
      {ide.open && (
        <button
          aria-label={ide.focused ? 'Exit IDE focus mode' : 'Focus IDE'}
          title={
            ide.focused ? 'Return to split screen' : 'Expand IDE to full screen'
          }
          onClick={ide.toggleFocus}
          className={`flex items-center gap-1.5 rounded-md border border-border text-xs font-medium hover:bg-muted ${compact ? 'p-2' : 'px-2.5 py-1.5'}`}
        >
          {ide.focused ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          {!compact && (
            <span>{ide.focused ? 'Split view' : 'Full screen'}</span>
          )}
        </button>
      )}
      <button
        aria-expanded={ide.open}
        aria-controls="course-ide-panel"
        aria-label={
          ide.open && ide.selected !== 'terminal' ? 'Close IDE' : 'Open IDE'
        }
        title={ide.open ? 'Hide IDE' : 'Open IDE'}
        onClick={() =>
          ide.open && ide.selected !== 'terminal'
            ? ide.close()
            : ide.show('scratch')
        }
        className={`flex items-center gap-2 rounded-md border border-border text-xs font-medium hover:bg-muted ${compact ? 'p-2' : 'px-3 py-1.5'}`}
      >
        {ide.open && ide.selected !== 'terminal' ? (
          <X size={15} />
        ) : (
          <Code2 size={15} />
        )}
        {!compact && (
          <span>
            {ide.open && ide.selected !== 'terminal' ? 'Hide IDE' : 'Open IDE'}
          </span>
        )}
      </button>
    </div>
  );
}
export function CourseIDEPanel({
  courseSlug,
  smallWindow,
  widthPercent,
}: {
  courseSlug: string;
  courseTitle?: string;
  smallWindow: boolean;
  widthPercent?: number;
}) {
  const ide = useCourseIDE();
  const [visited, setVisited] = useState(false);
  const [terminalVisited, setTerminalVisited] = useState(false);
  const { source, setSource } = ide;
  useEffect(() => {
    if (ide.open && !ide.focused && ide.selected === 'scratch') {
      const timer = setTimeout(() => {
        focusTheiaHost();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [ide.open, ide.focused, ide.selected]);

  // Preserve previous behavior: mark the IDE as visited when opened
  useEffect(() => {
    if (ide.open && ide.selected === 'scratch') setVisited(true);
    if (ide.open && ide.selected === 'terminal') setTerminalVisited(true);
  }, [ide.open, ide.selected]);

  useEffect(() => {
    if (!ide.open) return;
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !event.defaultPrevented) ide.close();
    };
    window.addEventListener('keydown', escape);
    return () => window.removeEventListener('keydown', escape);
  }, [ide.open, ide.close]);
  return (
    <aside
      id="course-ide-panel"
      aria-label="Course IDE"
      style={
        !ide.focused && !smallWindow && ide.open && widthPercent
          ? { width: `${widthPercent}%` }
          : undefined
      }
      className={`${!ide.open ? 'hidden' : 'flex'} ${ide.focused || smallWindow ? 'min-w-0 flex-1' : widthPercent ? 'min-w-[320px] max-w-[85%]' : 'w-[52%] min-w-[380px] max-w-[900px]'} h-full shrink-0 flex-col border-l border-border bg-background`}
    >
      <div className="min-h-0 flex-1 overflow-hidden">
        <div hidden={ide.selected !== 'terminal'} className="h-full">
          {terminalVisited && (
            <Suspense fallback={<p role="status">Opening terminal…</p>}>
              <StandaloneTerminal
                courseSlug={courseSlug}
                active={ide.open && ide.selected === 'terminal'}
                command={ide.pendingCommand}
                onCommandDone={ide.clearCommand}
              />
            </Suspense>
          )}
        </div>
        <div hidden={ide.selected !== 'scratch'} className="h-full">
          {visited && window.buildment.ide ? (
            <TheiaWorkspace
              courseSlug={courseSlug}
              active={ide.open && ide.selected === 'scratch'}
              focused={ide.focused}
              snippet={ide.snippet}
              request={ide.workspaceRequest}
              onRequestHandled={ide.clearWorkspaceRequest}
            />
          ) : (
            visited && (
              <div className="h-full p-3 overflow-y-auto">
                <Suspense fallback={<p role="status">Opening IDE…</p>}>
                  <Editor
                    blockId={`course:${courseSlug}`}
                    filename={ide.filename}
                    language={ide.language}
                    value={source}
                    onChange={setSource}
                    practice
                  />
                </Suspense>
              </div>
            )
          )}
        </div>
        <div
          ref={ide.setHost}
          className="h-full overflow-y-auto p-3"
          hidden={ide.selected === 'scratch' || ide.selected === 'terminal'}
        />
      </div>
    </aside>
  );
}
export function IDEExercise({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: ReactNode;
}) {
  const ide = useCourseIDE();
  const [visited, setVisited] = useState(false);
  const active = ide.selected === id;
  useEffect(() => {
    if (active) setVisited(true);
  }, [active]);
  const currentIDE = useRef(ide);
  currentIDE.current = ide;
  useEffect(
    () => () => {
      currentIDE.current.forget(id);
    },
    [id],
  );
  return (
    <>
      <section className="my-6 rounded-xl border border-border bg-card p-5">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Code exercise
        </p>
        <p className="mt-2 font-medium">{title}</p>
        <button
          className="mt-4 rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground"
          onClick={() => ide.show(id)}
        >
          Open in IDE
        </button>
        <p className="mt-2 text-xs text-muted-foreground">
          Edit, run and check your code in the course workspace.
        </p>
      </section>
      {visited &&
        ide.host &&
        createPortal(<div hidden={!active}>{children}</div>, ide.host, id)}
    </>
  );
}
