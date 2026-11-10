import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { Dot, type DotMood } from '@buildment/learning-ui/brand-dot';
import {
  createEngagementEngine,
  type EngagementEngine,
  type EngagementStore,
  type MascotReaction,
} from '../../../../server/src/shared/engagement/engine';
import { messageEventFor } from '../../../../server/src/shared/engagement/messages';
import type {
  EngagementEventType,
  RecordedEngagementEvent,
  TrackEventResult,
} from '../../../../server/src/shared/api/engagement';

// Dot's reactions on the desktop. The same rules as the web app decide what Dot says and when;
// this file only shows the line, plays Dot's recorded clip when voice is on, and keeps the reaction
// back during a quiz so nothing interrupts it.

const SOUND_KEY = 'buildment:dot-voice-sound';
const BUBBLE_MS = 9000;

type TrackInput = { type: EngagementEventType; courseId?: string; chapterId?: string };

type DotVoiceApi = {
  track(input: TrackInput): Promise<MascotReaction | null>;
  react(events: RecordedEngagementEvent[]): void;
  soundOn: boolean;
  setSoundOn(on: boolean): void;
  setQuiet(quiet: boolean): void;
};

const DotVoiceContext = createContext<DotVoiceApi | null>(null);

function localStore(): EngagementStore {
  return {
    get(key) {
      try {
        return window.localStorage.getItem(key);
      } catch {
        return null;
      }
    },
    set(key, value) {
      try {
        window.localStorage.setItem(key, value);
      } catch {
        // Storage is blocked or full: cooldowns simply start again.
      }
    },
  };
}

function readSound(): boolean {
  try {
    return window.localStorage.getItem(SOUND_KEY) === 'on';
  } catch {
    return false;
  }
}

function moodFor(reaction: MascotReaction): DotMood {
  switch (reaction.role) {
    case 'celebrator':
      return 'cheer';
    case 'helper':
      return 'think';
    case 'guide':
      return 'wave';
    default:
      return 'happy';
  }
}

export function DotVoiceProvider({ children }: { children: ReactNode }) {
  const [soundOn, setSoundState] = useState(readSound);
  const [reaction, setReaction] = useState<MascotReaction | null>(null);
  const quietRef = useRef(false);
  const heldRef = useRef<MascotReaction | null>(null);
  const soundRef = useRef(soundOn);

  useEffect(() => {
    soundRef.current = soundOn;
  }, [soundOn]);

  const playVoice = useCallback((next: MascotReaction) => {
    if (!soundRef.current || !next.voice) return;
    void new Audio(next.voice).play().catch(() => undefined);
  }, []);

  const engine = useMemo<EngagementEngine>(
    () =>
      createEngagementEngine({
        // The server's platform list names mobile apps and the web; the desktop app is the web app in a window.
        platform: 'web',
        storage: localStore(),
        transport: async (request) => {
          const result = await window.buildment.remote.request('/api/v1/events', 'POST', request);
          if (!result.ok) throw new Error(result.message);
          return result.data as TrackEventResult;
        },
        present: (next) => {
          if (quietRef.current) {
            heldRef.current = next;
            return;
          }
          setReaction(next);
          playVoice(next);
        },
      }),
    [playVoice],
  );

  useEffect(() => {
    if (!reaction) return;
    const timer = window.setTimeout(() => setReaction(null), BUBBLE_MS);
    return () => window.clearTimeout(timer);
  }, [reaction]);

  const setQuiet = useCallback(
    (quiet: boolean) => {
      quietRef.current = quiet;
      if (quiet) return;
      // Show the reaction the quiz held back, now that the learner is out of the quiz.
      const held = heldRef.current;
      heldRef.current = null;
      if (held) {
        setReaction(held);
        playVoice(held);
      }
    },
    [playVoice],
  );

  const setSoundOn = useCallback((on: boolean) => {
    setSoundState(on);
    try {
      window.localStorage.setItem(SOUND_KEY, on ? 'on' : 'off');
    } catch {
      // The choice still applies for this session.
    }
  }, []);

  const value = useMemo<DotVoiceApi>(
    () => ({
      track: (input) => engine.track(input),
      react: (events) => {
        engine.react(events);
      },
      soundOn,
      setSoundOn,
      setQuiet,
    }),
    [engine, soundOn, setSoundOn, setQuiet],
  );

  return (
    <DotVoiceContext.Provider value={value}>
      {children}
      {reaction && <DotBubble reaction={reaction} onDismiss={() => setReaction(null)} />}
    </DotVoiceContext.Provider>
  );
}

export function useDotVoice(): DotVoiceApi {
  const value = useContext(DotVoiceContext);
  if (!value) throw new Error('useDotVoice must be used inside DotVoiceProvider');
  return value;
}

function DotBubble({ reaction, onDismiss }: { reaction: MascotReaction; onDismiss: () => void }) {
  const action = reaction.action;
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-5 right-5 z-[60] flex max-w-sm items-end gap-3 rounded-2xl border border-border bg-card p-4 shadow-xl"
    >
      <Dot mood={moodFor(reaction)} size={48} />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-foreground">{reaction.message}</p>
        {reaction.xp ? <p className="mt-0.5 text-xs font-semibold text-primary">+{reaction.xp} XP</p> : null}
        {action && 'href' in action && (
          <button
            type="button"
            onClick={() => {
              void window.buildment.openWeb(action.href);
              onDismiss();
            }}
            className="mt-2 text-sm font-semibold text-primary hover:underline"
          >
            {action.label}
          </button>
        )}
      </div>
      <button
        type="button"
        aria-label="Dismiss Dot's message"
        onClick={onDismiss}
        className="grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        <X size={14} />
      </button>
    </div>
  );
}

/** Settings switch for Dot's voice. Off until the learner turns it on. */
export function DotVoiceSwitch() {
  const { soundOn, setSoundOn } = useDotVoice();
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <h2 className="font-heading text-lg font-bold">Dot&apos;s voice</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Dot reads its lines aloud. Off by default, and Dot stays quiet during quizzes. The words always show on screen.
        </p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={soundOn}
        aria-label="Dot's voice"
        onClick={() => setSoundOn(!soundOn)}
        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${soundOn ? 'bg-primary' : 'bg-muted'}`}
      >
        <span
          className={`absolute top-0.5 size-5 rounded-full bg-white shadow transition-transform ${soundOn ? 'translate-x-5' : 'translate-x-0.5'}`}
        />
      </button>
    </div>
  );
}

/** Feeds new live notifications to Dot's rules (the messenger moments). */
export function notificationEvents(items: Parameters<typeof messageEventFor>[0][]): RecordedEngagementEvent[] {
  return items.map(messageEventFor).filter((event): event is RecordedEngagementEvent => event !== null);
}
