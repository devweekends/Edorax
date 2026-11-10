import { EnrolledCourse, CourseLoading } from './EnrolledCourse';
import { useEffect, useRef, useState } from 'react';
import { BookOpen, RefreshCw, Target, UserRound } from 'lucide-react';
import type { Course, CourseDetail } from '../../domain/catalog';
import { SignInPrompt } from '../auth/SignInPrompt';
import { Curriculum } from './Curriculum';
import { CourseSummary } from './CourseSummary';

const button =
  'rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-50';

export function CoursePreview({
  course,
  signedIn,
  busy,
  authRevision,
  onSignIn,
  onSession,
  onStart,
  onBack,
}: {
  course: Course;
  signedIn: boolean;
  busy: boolean;
  authRevision: number;
  onSignIn: () => void;
  onSession: (value: boolean) => void;
  onStart: (chapter?: string) => void;
  onBack: () => void;
}) {
  const [detail, setDetail] = useState<CourseDetail | null>(null);
  const [state, setState] = useState<
    'loading' | 'auth' | 'ready' | 'error' | 'unverified'
  >('loading');
  const [message, setMessage] = useState('');
  const [enrolling, setEnrolling] = useState(false);
  const [enrollError, setEnrollError] = useState('');
  const enrollmentPending = useRef(false);
  async function enroll() {
    if (!signedIn || busy || enrollmentPending.current || !detail) return;
    enrollmentPending.current = true;
    setEnrolling(true);
    setEnrollError('');
    const request = generation.current;
    try {
      const result = await window.buildment.enroll(course.id);
      if (!live.current || request !== generation.current) return;
      if (
        result.ok ||
        result.code === 'ALREADY_ENROLLED' ||
        result.code === 'PAYMENT_PENDING'
      ) {
        await load();
      } else {
        setEnrollError(result.message);
        if (result.code === 'AUTH_REQUIRED') {
          onSession(false);
          await load();
        }
      }
    } catch {
      if (live.current && request === generation.current)
        setEnrollError('Could not confirm enrollment. Please try again.');
    } finally {
      enrollmentPending.current = false;
      if (live.current) setEnrolling(false);
    }
  }
  const [imageFailed, setImageFailed] = useState(false);
  const live = useRef(true);
  const generation = useRef(0);
  const heading = useRef<HTMLHeadingElement>(null);

  async function load() {
    const request = ++generation.current;
    setState('loading');
    setMessage('');
    setDetail(null);
    try {
      const result = await window.buildment.courseDetail(course.slug);
      if (!live.current || generation.current !== request) return;
      if (result.ok) {
        setDetail(result.data);
        setState('ready');
        onSession(result.data.signedIn);
      } else if (result.code === 'AUTH_REQUIRED') {
        setState('auth');
        onSession(false);
      } else {
        setMessage(result.message);
        setState(result.code === 'EMAIL_UNVERIFIED' ? 'unverified' : 'error');
      }
    } catch {
      if (!live.current || generation.current !== request) return;
      setState('error');
      setMessage('Could not load the curriculum. Please try again.');
    }
  }

  useEffect(() => {
    live.current = true;
    setEnrollError('');
    heading.current?.focus({ preventScroll: true });
    void load();
    return () => {
      live.current = false;
      generation.current++;
    };
  }, [course.slug, authRevision]);

  // Access is not known yet: never render the public preview as a placeholder.
  if (state === 'loading') {
    return (
      <div className="course-overview-surface">
        <CourseLoading />
      </div>
    );
  }

  if (
    signedIn &&
    state === 'ready' &&
    detail?.signedIn &&
    detail.access === 'active'
  ) {
    return (
      <EnrolledCourse
        slug={course.slug}
        onStart={onStart}
        onBack={onBack}
        onSession={onSession}
      />
    );
  }
  const current = detail || course;
  const cover =
    current.coverUrl &&
    /^(https:\/\/|http:\/\/(localhost|127\.0\.0\.1)(:|\/))/.test(
      current.coverUrl,
    )
      ? current.coverUrl
      : null;
  return (
    <div className="mx-auto max-w-[1180px] px-8 py-8 lg:px-12">
      <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_240px] xl:grid-cols-[minmax(0,1fr)_280px]">
        <div className="min-w-0">
          <section className="overflow-hidden rounded-2xl border border-border bg-card">
            <div className="relative flex h-48 items-center justify-center overflow-hidden bg-muted">
              {cover && !imageFailed ? (
                <img
                  src={cover}
                  alt=""
                  referrerPolicy="no-referrer"
                  onError={() => setImageFailed(true)}
                  className="size-full object-cover"
                />
              ) : (
                <>
                  <div className="cover-grid absolute inset-0 opacity-60" />
                  <BookOpen
                    size={58}
                    strokeWidth={1}
                    className="relative text-primary/60"
                  />
                  <span className="absolute bottom-5 right-6 text-[10px] tracking-[0.22em] text-muted-foreground">
                    EDORAX / COURSE PREVIEW
                  </span>
                </>
              )}
            </div>
            <div className="p-7 lg:p-8">
              <span className="rounded-full bg-muted px-3 py-1 text-[11px] font-medium text-muted-foreground">
                {current.category === 'TECH'
                  ? 'Technical course'
                  : current.category === 'CLOUD_DEVOPS'
                    ? 'Cloud and DevOps'
                    : 'Soft skills'}
              </span>
              <h1
                ref={heading}
                tabIndex={-1}
                className="mt-5 text-3xl font-semibold leading-tight tracking-tight outline-none lg:text-4xl"
              >
                {current.title}
              </h1>
              <p className="mt-5 whitespace-pre-line text-sm leading-7 text-muted-foreground">
                {current.description || 'Discover the course curriculum below.'}
              </p>
              <div className="mt-6 flex items-center gap-2 text-sm">
                <UserRound size={16} className="text-muted-foreground" />
                <span>{current.instructorName || 'Edorax'}</span>
              </div>
            </div>
          </section>
          {current.projectGoal && (
            <section className="mt-6 rounded-2xl border border-border bg-secondary/40 p-6">
              <div className="mb-3 flex items-center gap-2">
                <Target size={18} className="text-primary" />
                <h2 className="font-semibold">What you’ll build</h2>
              </div>
              <p className="whitespace-pre-line text-sm leading-7 text-muted-foreground">
                {current.projectGoal}
              </p>
            </section>
          )}

          {!signedIn && <SignInPrompt busy={busy} onSignIn={onSignIn} />}

          <section aria-labelledby="curriculum-title" className="mt-9">
            <div className="mb-5 flex items-center justify-between gap-3">
              <div>
                <h2
                  id="curriculum-title"
                  className="text-xl font-semibold tracking-tight"
                >
                  Course curriculum
                </h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  Explore the modules and chapters in this course.
                </p>
              </div>
            </div>
            {(state === 'error' || state === 'unverified') && (
              <div
                role="alert"
                className="rounded-2xl border border-border bg-card p-6"
              >
                <h3 className="font-semibold">
                  {state === 'unverified'
                    ? 'Verify your email to continue'
                    : 'Curriculum unavailable'}
                </h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  {state === 'unverified'
                    ? 'Open the verification email from Edorax, then try again. You can still browse this course preview.'
                    : message}
                </p>
                <button
                  onClick={() => void load()}
                  disabled={busy}
                  className={`${button} mt-4 flex items-center gap-2`}
                >
                  <RefreshCw size={14} />
                  {state === 'unverified'
                    ? 'I’ve verified my email'
                    : 'Try again'}
                </button>
              </div>
            )}
            {state === 'ready' && detail && (
              <Curriculum modules={detail.modules} />
            )}
          </section>
        </div>
        <CourseSummary course={current}>
          {signedIn && detail?.signedIn && detail.access === 'none' && (
            <button
              disabled={busy || enrolling || state !== 'ready'}
              onClick={() => void enroll()}
              className={button + ' mt-6 w-full'}
            >
              {enrolling ? 'Enrolling…' : 'Enroll in course'}
            </button>
          )}
          {signedIn && detail?.access === 'payment_required' && (
            <p
              role="status"
              className="mt-6 rounded-lg bg-muted px-3 py-3 text-sm"
            >
              Enrollment started. Complete payment on the Edorax website to
              access this course.
            </p>
          )}
          {signedIn && detail?.access === 'payment_required' && (
            <button
              type="button"
              onClick={() => void window.buildment.openWeb(`/courses/${current.slug}/checkout`)}
              className={button + ' mt-3 w-full'}
            >
              Complete checkout on the website
            </button>
          )}
          {signedIn && enrollError && (
            <p role="alert" className="mt-3 text-sm text-muted-foreground">
              {enrollError}
            </p>
          )}
        </CourseSummary>
      </div>
    </div>
  );
}
