import { useEffect, useRef, useState } from 'react';
import { filterCourses, isMyCourse, type Course } from '../domain/catalog';
import { CourseReader } from './learning/CourseReader';
import { useDotVoice } from './mascot/DotVoice';
import { CoursePreview } from './courses/CoursePreview';
import { CourseCatalog } from './courses/CourseCatalog';
import { Sidebar, type Section } from './layout/Sidebar';
import { HomePage } from './home/HomePage';
import { ProgressPage } from './progress/ProgressPage';
import { MyLearningPage } from './mylearning/MyLearningPage';
import { WorkspaceHeader } from './layout/WorkspaceHeader';
import { useSession } from './auth/useSession';
import { SignInPrompt } from './auth/SignInPrompt';
import { AudiobookLibrary } from './audiobooks/AudiobookLibrary';
import { MiniPlayer } from './audiobooks/MiniPlayer';
import { VisualLabs } from './visual-labs/VisualLabs';
import { ShellLabs } from './shell-labs/ShellLabs';
import type { ShellTopic } from '../domain/shell-labs';
import { BrandMark } from './auth/BrandMark';
import { LeaderboardPage } from './leaderboard/LeaderboardPage';
import { StreakPopup } from './streak/StreakPopup';
import type { LeaderboardSelection } from '../domain/leaderboard';
import { QuestionsPage } from './questions/QuestionsPage';
import { SettingsPage } from './settings/SettingsPage';

export function App() {
  const [selected, setSelected] = useState<Course | null>(null);
  const [chapter, setChapter] = useState<string | undefined>();
  const [reading, setReading] = useState(false);
  const session = useSession();
  const {
    signedIn,
    setSignedIn,
    authBusy,
    authRevision,
    authChecked,
    changeSession,
  } = session;
  useEffect(() => {
    if (!signedIn) setReading(false);
  }, [signedIn]);
  const { track: trackDot } = useDotVoice();
  useEffect(() => {
    if (signedIn) void trackDot({ type: 'session_start' });
  }, [signedIn, trackDot]);
  const main = useRef<HTMLElement>(null);
  const catalogScroll = useRef(0);
  function openCourse(course: Course) {
    catalogScroll.current = main.current?.scrollTop || 0;
    setSelected(course);
    if (main.current) main.current.scrollTop = 0;
  }
  const [section, setSection] = useState<Section>('home');
  const [shellTopic, setShellTopic] = useState<ShellTopic>('linux');

  function navigate(next: Section) {
    setSection(next);
    setTab(next === 'mine' ? 'mine' : 'all');
    backToCourses();
  }
  function openBySlug(slug: string) {
    const course = courses.find((item) => item.slug === slug);
    if (course) openCourse(course);
  }

  function backToCourses() {
    const id = selected?.id;
    setReading(false);
    setSelected(null);
    requestAnimationFrame(() => {
      if (main.current) main.current.scrollTop = catalogScroll.current;
      if (id)
        document
          .getElementById(`preview-${id}`)
          ?.focus({ preventScroll: true });
    });
  }
  useEffect(() => {
    document.documentElement.dataset.appReady = 'true';
    document.getElementById('startup-status')?.setAttribute('hidden', '');
  }, []);
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem('sidebar-collapsed') === 'true';
    } catch {
      return false;
    }
  });
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');
  const [tab, setTab] = useState<'all' | 'mine'>('all');

  const catalogGeneration = useRef(0);
  const [restoredView, setRestoredView] = useState(false);
  useEffect(() => {
    if (restoredView || !authChecked || !courses.length) return;
    setRestoredView(true);
    try {
      const raw = sessionStorage.getItem('buildment-view');
      if (!raw) return;
      const view = JSON.parse(raw) as {
        slug?: string;
        reading?: boolean;
        chapter?: string;
      };
      if (!view.slug) return;
      const course = courses.find((entry) => entry.slug === view.slug);
      if (!course) return;
      setSelected(course);
      if (view.chapter) setChapter(view.chapter);
      if (view.reading && signedIn) setReading(true);
    } catch {
      /* A broken saved view just opens the catalog. */
    }
  }, [authChecked, courses, signedIn, restoredView]);
  useEffect(() => {
    if (!restoredView) return;
    try {
      if (!selected) sessionStorage.removeItem('buildment-view');
      else
        sessionStorage.setItem(
          'buildment-view',
          JSON.stringify({ slug: selected.slug, reading, chapter }),
        );
    } catch {
      /* Persistence is best effort. */
    }
  }, [selected, reading, chapter, restoredView]);
  async function load() {
    const request = ++catalogGeneration.current;
    setLoading(courses.length === 0);
    setError('');
    try {
      const result = await window.buildment.listCourses();
      if (request !== catalogGeneration.current) return;
      if (result.ok) setCourses(result.courses);
      else setError(result.message);
    } catch {
      if (request !== catalogGeneration.current) return;
      setError(
        'The desktop connection is unavailable. Restart the app and try again.',
      );
    } finally {
      if (request === catalogGeneration.current) setLoading(false);
    }
  }
  useEffect(() => {
    if (signedIn && !selected) void load();
    return () => {
      catalogGeneration.current++;
    };
  }, [authRevision, signedIn, selected?.id]);
  const visible =
    tab === 'mine'
      ? courses.filter(isMyCourse)
      : filterCourses(courses, query, category);
  const categories = [...new Set(courses.map((course) => course.category))];

  function toggleSidebar() {
    setCollapsed((value) => {
      try {
        localStorage.setItem('sidebar-collapsed', String(!value));
      } catch {
        /* The sidebar still works if local preferences cannot be saved. */
      }
      return !value;
    });
  }

  const [leaderboardSeed, setLeaderboardSeed] = useState<LeaderboardSelection | null>(null);
  function openLeaderboard(selection: LeaderboardSelection) {
    setLeaderboardSeed(selection);
    navigate('leaderboard');
  }

  if (!authChecked)
    return (
      <div
        className="flex h-screen items-center justify-center text-sm text-muted-foreground"
        role="status"
      >
        Opening Edorax…
      </div>
    );
  if (!signedIn)
    return (
      <main className="flex min-h-screen items-center justify-center bg-background px-5 text-foreground">
        <div className="w-full max-w-xl">
          <p className="font-display text-4xl font-semibold">
            Welcome to Edorax
          </p>
          <p className="mt-3 text-sm text-muted-foreground">
            Sign in to access your courses. Your browser will open securely,
            then bring you back here.
          </p>
          <SignInPrompt
            busy={authBusy}
            onSignIn={() => void changeSession(true)}
            firstScreen
          />
          {session.authError && (
            <p role="alert" className="mt-4 text-sm text-destructive">
              {session.authError}
            </p>
          )}
        </div>
      </main>
    );

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background text-foreground">
      {!(reading && signedIn) && (
        <WorkspaceHeader
          selected={Boolean(selected)}
          courseTitle={selected?.title}
          backToCourses={backToCourses}
          session={session}
        />
      )}
      {signedIn && <StreakPopup />}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {!(reading && signedIn) && (
          <Sidebar
            collapsed={collapsed}
            toggleSidebar={toggleSidebar}
            section={section}
            onNavigate={navigate}
            myCount={courses.filter(isMyCourse).length}
          />
        )}

        <main ref={main} className="min-w-0 flex-1 overflow-y-auto">
          {selected && reading && signedIn ? (
            <CourseReader
              key={selected.slug + ':' + authRevision}
              courseSlug={selected.slug}
              courseTitle={selected.title}
              initialChapter={chapter}
              session={session}
              onBack={() => setReading(false)}
              onSignedOut={() => {
                setSignedIn(false);
                setReading(false);
              }}
            />
          ) : selected ? (
            <CoursePreview
              key={selected.slug}
              course={selected}
              signedIn={signedIn}
              busy={authBusy}
              authRevision={authRevision}
              onSignIn={() => void changeSession(true)}
              onSession={setSignedIn}
              onBack={backToCourses}
              onStart={(chapter) => {
                setChapter(chapter);
                setReading(true);
              }}
            />
          ) : section === 'home' ? (
            <HomePage
              onOpenCourse={openBySlug}
              onBrowse={() => navigate('courses')}
              onViewAll={() => navigate('mine')}
              onOpenProgress={() => navigate('progress')}
              onOpenLeaderboard={openLeaderboard}
            />
          ) : section === 'mine' ? (
            <MyLearningPage onOpenCourse={openBySlug} onBrowse={() => navigate('courses')} />
          ) : section === 'questions' ? (
            <QuestionsPage />
          ) : section === 'settings' ? (
            <SettingsPage />
          ) : section === 'progress' ? (
            <ProgressPage onOpenCourse={openBySlug} onBrowse={() => navigate('courses')} />
          ) : section === 'leaderboard' ? (
            <LeaderboardPage initialSelection={leaderboardSeed ?? undefined} />
          ) : section === 'audiobooks' ? (
            <AudiobookLibrary />
          ) : section === 'labs' ? (
            <VisualLabs courses={courses} onOpenCourse={openBySlug} onOpenShellLabs={(topic) => {
                setShellTopic(topic);
                navigate('shell-labs');
              }} />
          ) : section === 'shell-labs' ? (
            <ShellLabs topic={shellTopic} onBack={() => navigate('labs')} />
          ) : (
            <CourseCatalog
              {...{
                courses,
                visible,
                categories,
                loading,
                error,
                query,
                category,
                setQuery,
                setCategory,
                load,
                openCourse,
                tab,
                setTab,
                signedIn,
                onSignIn: () => void changeSession(true),
              }}
            />
          )}
        </main>
      </div>
      <MiniPlayer />
    </div>
  );
}
