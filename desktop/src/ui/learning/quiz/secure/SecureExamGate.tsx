import { useCallback, useEffect, useState, type ReactNode } from "react";
import {
  Camera,
  Clock,
  Info,
  LogOut,
  RefreshCw,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";
import {
  INTEGRITY_NOTES_LINE,
  INTEGRITY_QUIZ_RULES,
  INTEGRITY_SECURE_RULES,
  type IntegrityMode,
} from "../../../../../../server/src/shared/api/integrity";
import { useFaceMonitor, type FaceMonitorState } from "./useFaceMonitor";
import { useQuizGuard } from "./useQuizGuard";
import { useSecureExam, type CameraState } from "./useSecureExam";
import { useTypingMonitor } from "./useTypingMonitor";
import {
  QUIZ_TIME_UP_DONE_EVENT,
  QUIZ_TIME_UP_EVENT,
  formatClock,
  useQuizTimer,
} from "./quiz-timer";
import { SecureCameraContext } from "./camera-context";

// What the exam bar says about the camera and the face check, in plain words.
function faceLabel(face: FaceMonitorState): string {
  if (face.camera === "failed") return "Camera is off";
  if (face.camera === "starting") return "Starting camera…";
  if (face.face === "loading") return "Camera on · face check starting…";
  if (face.face === "on") return "Camera on · face check on";
  if (face.face === "unavailable") return "Camera on · face check unavailable";
  return "Camera off";
}

// One cell of the exam bar: an icon and its text. Cells are split by a thin divider.
function BarItem({
  icon: Icon,
  circle = false,
  children,
}: {
  icon: LucideIcon;
  circle?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="flex items-center gap-2.5 px-4 first:pl-1">
      {circle ? (
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Icon size={18} aria-hidden />
        </span>
      ) : (
        <Icon size={18} className="shrink-0 text-primary" aria-hidden />
      )}
      {children}
    </div>
  );
}

function Frame({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mx-auto my-8 w-[min(92vw,640px)] rounded-2xl border border-border bg-card p-7 shadow-sm">
      <h2 className="text-2xl font-semibold">{title}</h2>
      {children}
    </section>
  );
}

// A disabled button stays readable and shows the "not allowed" cursor, so it is clear why nothing happens.
const primary =
  "rounded-lg border border-transparent bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground disabled:cursor-not-allowed disabled:border-border disabled:bg-muted disabled:text-muted-foreground";
const secondary =
  "rounded-lg border border-border px-4 py-2.5 text-sm font-medium";

function Rules({ mode }: { mode: IntegrityMode }) {
  const rules =
    mode === "SECURE"
      ? [...INTEGRITY_QUIZ_RULES, ...INTEGRITY_SECURE_RULES]
      : INTEGRITY_QUIZ_RULES;
  return (
    <>
      <p className="mt-4 text-sm font-semibold">
        Read these rules before you begin
      </p>
      <ol className="mt-3 grid gap-2 pl-5 text-sm leading-6">
        {rules.map((rule) => (
          <li key={rule} className="list-decimal marker:font-semibold">
            {rule}
          </li>
        ))}
      </ol>
      <p className="mt-4 text-sm font-semibold">{INTEGRITY_NOTES_LINE}</p>
    </>
  );
}

const CAMERA_LABELS: Record<CameraState["status"], string> = {
  idle: "Camera not checked yet",
  checking: "Checking the camera…",
  OK: "Camera is ready",
  DENIED: "Camera access is blocked",
  MISSING: "No camera found",
  SKIPPED: "Camera not checked yet",
};

function CameraCard({
  camera,
  required,
  onAllow,
}: {
  camera: CameraState;
  required: boolean;
  onAllow: () => void;
}) {
  return (
    <div className="mt-5 rounded-xl border border-border bg-muted/40 p-4">
      <p className="text-sm font-semibold">Camera</p>
      <p className="mt-1 text-sm leading-6 text-muted-foreground">
        {required
          ? "This exam needs your camera. Small still photos are taken about once a minute, and face checks run on your computer without saving video."
          : "This quiz can take small still photos about once a minute. Allow the camera now if you want to use it. You can also continue without a camera."}
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          type="button"
          className={secondary}
          onClick={onAllow}
          disabled={camera.status === "checking"}
        >
          {camera.status === "OK" ? "Check camera again" : "Allow camera"}
        </button>
        <span role="status" className="text-sm font-medium">
          {CAMERA_LABELS[camera.status]}
        </span>
      </div>
      {camera.help && (
        <p className="mt-2 text-sm leading-6 text-destructive">{camera.help}</p>
      )}
    </div>
  );
}

/**
 * Every quiz in the app opens through this gate. The learner reads the rules first. Then the quiz
 * opens in protected mode: full screen, no selection or copying, a guarded clipboard, and live
 * notes for the mentor. Secure-mode courses add the system check and heartbeat before it opens.
 * While the quiz runs, the course menus are hidden and a Leave button is always on screen.
 */
export function SecureExamGate({
  chapterId,
  mode,
  cameraOption = false,
  blockedReason,
  timeLimitMinutes,
  currentBlockId,
  complete,
  onExit,
  onActiveChange,
  children,
}: {
  chapterId: string;
  mode: IntegrityMode;
  /** The course takes optional camera photos in this quiz. */
  cameraOption?: boolean;
  /** Set when the quiz cannot be taken, such as no questions. The rules and camera still show. */
  blockedReason?: string;
  /** Minutes the learner has for the quiz. Leave it empty for no timer. */
  timeLimitMinutes?: number | null;
  currentBlockId: string | null;
  complete: boolean;
  onExit: () => void;
  /** True while the quiz is running, so the page can hide menus that would pull the learner away. */
  onActiveChange?: (active: boolean) => void;
  children: ReactNode;
}) {
  const exam = useSecureExam(chapterId, mode);
  const running = exam.phase === "active";
  const guard = useQuizGuard(running, currentBlockId);
  useTypingMonitor(running, currentBlockId);
  const face = useFaceMonitor(
    running && Boolean(exam.policy?.requireCamera),
    currentBlockId,
  );
  const [agreed, setAgreed] = useState(false);
  const [server, setServer] = useState("");
  useEffect(() => {
    void window.buildment.secure.server().then((result) => {
      if (result.ok) setServer(result.data.api);
    });
  }, []);
  const [leaving, setLeaving] = useState(false);
  const { end, leave: leaveQuiz } = exam;

  // The countdown starts when the quiz opens. When it hits zero, timedOut turns on.
  const [timedOut, setTimedOut] = useState(false);
  const handleExpire = useCallback(() => setTimedOut(true), []);
  const timer = useQuizTimer({
    chapterId,
    minutes: timeLimitMinutes,
    running,
    onExpire: handleExpire,
  });
  const { forget: forgetDeadline } = timer;

  useEffect(() => {
    onActiveChange?.(running);
    return () => onActiveChange?.(false);
  }, [running, onActiveChange]);
  useEffect(() => {
    if (running && complete) {
      forgetDeadline();
      void end();
    }
  }, [running, complete, end, forgetDeadline]);

  // Time is up: ask the quiz to save its answers, then close. If the save never reports back,
  // close after a short wait so the learner is not stuck in lockdown.
  useEffect(() => {
    if (!timedOut) return;
    let closed = false;
    const closeQuiz = () => {
      if (closed) return;
      closed = true;
      forgetDeadline();
      void end();
    };
    window.addEventListener(QUIZ_TIME_UP_DONE_EVENT, closeQuiz);
    const fallback = window.setTimeout(closeQuiz, 12_000);
    window.dispatchEvent(new Event(QUIZ_TIME_UP_EVENT));
    return () => {
      window.removeEventListener(QUIZ_TIME_UP_DONE_EVENT, closeQuiz);
      window.clearTimeout(fallback);
    };
  }, [timedOut, end, forgetDeadline]);

  const message = guard.notice || exam.notice || timer.reminder;
  const timeIsLow = timer.remainingMs !== null && timer.remainingMs <= 60_000;
  const cameraHealthy = face.camera === "on" && face.face !== "unavailable";
  const cameraNeedsRetry =
    face.camera === "failed" || face.face === "unavailable";
  // Leaving returns to this quiz's own start screen, not to the course list.
  const leave = async () => {
    await leaveQuiz();
    setLeaving(false);
    setAgreed(false);
  };

  if (running)
    return (
      <>
        {message && (
          <div
            role="alert"
            className="pointer-events-none fixed inset-x-0 top-4 z-[90] flex justify-center px-4"
          >
            <p className="rounded-lg border border-border bg-card px-4 py-3 text-base font-bold shadow-lg">
              {message}
            </p>
          </div>
        )}
        {timedOut && (
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="quiz-time-up-title"
            className="fixed inset-0 z-[95] flex items-center justify-center bg-background/90 p-4 backdrop-blur-md"
          >
            <div className="w-[min(92vw,420px)] rounded-2xl border border-border bg-card p-7 text-center shadow-xl">
              <h2 id="quiz-time-up-title" className="text-2xl font-semibold">
                Time is up
              </h2>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                Saving your answers now.
              </p>
            </div>
          </div>
        )}
        <div
          role="status"
          className="sticky top-0 z-40 mb-4 rounded-2xl border border-border bg-card p-3 shadow-sm"
        >
          <div className="flex flex-wrap items-center gap-y-3 divide-x divide-border text-sm">
            <BarItem icon={ShieldCheck} circle>
              <span className="font-medium">
                {mode === "SECURE" ? "Secure exam" : "Protected quiz"} ·{" "}
                <span className="font-semibold text-primary">connected</span>
              </span>
            </BarItem>
            {timer.remainingMs !== null && (
              <BarItem icon={Clock}>
                <span
                  role="timer"
                  aria-label={`Time left: ${formatClock(timer.remainingMs)}`}
                  className="flex items-baseline gap-2"
                >
                  <span className="text-muted-foreground">Time left</span>
                  <span
                    className={`font-mono text-lg font-semibold tabular-nums ${
                      timeIsLow ? "text-destructive" : ""
                    }`}
                  >
                    {formatClock(timer.remainingMs)}
                  </span>
                </span>
              </BarItem>
            )}
            {exam.policy?.requireCamera && (
              <>
                <BarItem icon={Camera}>
                  <span
                    className={
                      cameraHealthy
                        ? "font-medium"
                        : "font-medium text-destructive"
                    }
                  >
                    {faceLabel(face)}
                  </span>
                  {face.issue && (
                    <span className="text-destructive">{face.issue}</span>
                  )}
                </BarItem>
                {cameraNeedsRetry && (
                  <BarItem icon={RefreshCw}>
                    <button
                      type="button"
                      className="font-semibold"
                      onClick={face.retry}
                    >
                      Retry camera
                    </button>
                  </BarItem>
                )}
              </>
            )}
          </div>
          <div className="mt-3 flex flex-wrap items-stretch gap-3">
            <div className="flex min-w-0 flex-1 items-center gap-2.5 rounded-xl bg-muted px-4 py-3 text-sm text-muted-foreground">
              <Info size={18} className="shrink-0 text-primary" aria-hidden />
              <span>{INTEGRITY_NOTES_LINE}</span>
              {exam.warnings.length > 0 && (
                <span>{exam.warnings.join(" · ")}</span>
              )}
            </div>
            {leaving ? (
              <div className="flex items-center gap-2 rounded-xl bg-muted px-4 py-2">
                <span className="text-sm font-medium">Leave the quiz?</span>
                <button className={secondary} onClick={() => void leave()}>
                  Yes, leave
                </button>
                <button className={secondary} onClick={() => setLeaving(false)}>
                  Stay
                </button>
              </div>
            ) : (
              <button
                className={`${primary} inline-flex items-center gap-2 rounded-xl px-5`}
                onClick={() => setLeaving(true)}
              >
                Leave quiz <LogOut size={16} aria-hidden />
              </button>
            )}
          </div>
        </div>
        {/* A secure exam that needs the camera tells the quiz, so it starts the camera and offers no way around it. */}
        <SecureCameraContext.Provider
          value={Boolean(exam.policy?.requireCamera)}
        >
          {children}
        </SecureCameraContext.Provider>
      </>
    );

  if (exam.phase === "ended" && timedOut)
    return (
      <Frame title="Time is up">
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          Your answers were saved and the quiz is closed. Full screen and the
          quiz protection are off now.
        </p>
        <div className="mt-6">
          <button className={primary} onClick={onExit}>
            Back to the course
          </button>
        </div>
      </Frame>
    );

  if (exam.phase === "ended")
    return (
      <Frame title="Quiz finished">
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          Full screen and the quiz protection are off now.
        </p>
        <div className="mt-6">{children}</div>
      </Frame>
    );

  const secure = mode === "SECURE";
  return (
    <Frame
      title={
        secure ? "This exam runs in secure mode" : "Before you start the quiz"
      }
    >
      {exam.phase === "intro" && (
        <>
          <Rules mode={mode} />
          {!secure && cameraOption && (
            <CameraCard
              camera={exam.camera}
              required={false}
              onAllow={() => void exam.allowCamera()}
            />
          )}
          {timeLimitMinutes && timeLimitMinutes > 0 ? (
            <p className="mt-5 text-sm text-muted-foreground">
              You have {timeLimitMinutes}{" "}
              {timeLimitMinutes === 1 ? "minute" : "minutes"}. The clock starts
              when the quiz opens, and your answers are saved when it reaches
              zero.
            </p>
          ) : null}
          <label className="mt-5 flex cursor-pointer items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={agreed}
              onChange={(event) => setAgreed(event.target.checked)}
              className="mt-1"
            />
            <span>I have read the rules and I agree to follow them.</span>
          </label>
          <div className="mt-6 flex gap-3">
            <button
              className={`${primary} ${exam.busy ? "cursor-wait" : ""}`}
              disabled={exam.busy || !agreed || Boolean(blockedReason)}
              title={
                blockedReason
                  ? blockedReason
                  : agreed
                    ? undefined
                    : "Tick the box above to continue"
              }
              onClick={() =>
                void (secure ? exam.prepare() : exam.startProtected())
              }
            >
              {exam.busy
                ? "Opening…"
                : secure
                  ? "Continue to system check"
                  : "Start quiz"}
            </button>
            <button className={secondary} onClick={onExit}>
              Not now
            </button>
          </div>
          {blockedReason && (
            <p
              role="alert"
              className="mt-3 rounded-lg border border-border bg-muted/50 p-3 text-sm leading-6"
            >
              {blockedReason}
            </p>
          )}
          {!agreed && !blockedReason && (
            <p className="mt-2 text-xs text-muted-foreground">
              Tick the box above to enable the button.
            </p>
          )}
        </>
      )}
      {exam.phase === "consent" && (
        <>
          <p className="mt-3 text-sm text-muted-foreground">
            Monitoring happens only while the exam is open.
          </p>
          <p className="mt-4 text-sm leading-6 text-muted-foreground">
            Only the names of restricted programs that matched are sent, never
            your full list of apps, files or screen. Mentors and admins of this
            course can see the notes. If you cannot meet a requirement, ask your
            mentor for another way to sit the exam.
          </p>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            No check on a computer is perfectly safe. These checks make cheating
            harder and leave a record. Your mentor reviews anything flagged and
            makes the final call.
          </p>
          {exam.policy?.requireCamera && (
            <CameraCard
              camera={exam.camera}
              required
              onAllow={() => void exam.allowCamera()}
            />
          )}
          <div className="mt-6 flex gap-3">
            <button
              className={primary}
              disabled={exam.busy}
              onClick={() => void exam.check()}
            >
              I agree. Check my computer
            </button>
            <button className={secondary} onClick={onExit}>
              Cancel
            </button>
          </div>
        </>
      )}
      {exam.phase === "checking" && (
        <p role="status" className="mt-3">
          Checking running programs, screens and camera…
        </p>
      )}
      {(exam.phase === "blocked" || exam.phase === "ready") && exam.result && (
        <>
          {exam.phase === "ready" ? (
            <p className="mt-3 leading-7">
              Everything looks good. Starting the exam opens full screen and
              turns the rules on.
            </p>
          ) : (
            <>
              <p className="mt-3 leading-7">Fix these, then check again:</p>
              <ul className="mt-3 grid gap-2 pl-5 text-sm">
                {exam.result.blockers.map((blocker) => (
                  <li key={blocker} className="list-disc font-medium">
                    {blocker}
                  </li>
                ))}
              </ul>
              {exam.camera.help && (
                <p className="mt-3 text-sm leading-6 text-destructive">
                  {exam.camera.help}
                </p>
              )}
            </>
          )}
          {exam.result.warnings.length > 0 && (
            <p className="mt-3 text-sm text-muted-foreground">
              Please also: {exam.result.warnings.join(", ")}. This is noted but
              does not stop the exam.
            </p>
          )}
          <div className="mt-6 flex gap-3">
            {exam.phase === "ready" ? (
              <button
                className={primary}
                disabled={exam.busy}
                onClick={() => void exam.begin()}
              >
                Start exam
              </button>
            ) : (
              <button
                className={primary}
                disabled={exam.busy}
                onClick={() => void exam.check()}
              >
                Check again
              </button>
            )}
            <button className={secondary} onClick={onExit}>
              Leave
            </button>
          </div>
        </>
      )}
      {exam.error && (
        <p role="alert" className="mt-4 text-sm text-destructive">
          {exam.error}
        </p>
      )}
      {server && (
        <p className="mt-5 text-xs text-muted-foreground">
          Connected to server: {server}
        </p>
      )}
    </Frame>
  );
}
