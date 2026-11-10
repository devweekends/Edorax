import {
  BookOpen,
  ArrowUpRight,
  RefreshCw,
  Search,
  UserRound,
  WifiOff,
} from 'lucide-react';
import { isMyCourse, type Course } from '../../domain/catalog';
import { CourseCard } from './CourseCard';
import { categoryName } from './format';
import type { Dispatch, SetStateAction } from 'react';
type Props = {
  courses: Course[];
  visible: Course[];
  categories: string[];
  loading: boolean;
  error: string;
  query: string;
  category: string;
  setQuery: Dispatch<SetStateAction<string>>;
  setCategory: Dispatch<SetStateAction<string>>;
  load: () => Promise<void>;
  openCourse: (course: Course) => void;
  tab: 'all' | 'mine';
  setTab: Dispatch<SetStateAction<'all' | 'mine'>>;
  signedIn: boolean;
  onSignIn: () => void;
};
export function CourseCatalog({
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
  onSignIn,
}: Props) {
  const mineCount = courses.filter(isMyCourse).length;
  return (
    <div className="mx-auto max-w-[1320px] px-8 py-9 lg:px-12">
      <section className="relative mb-9 overflow-hidden rounded-2xl border border-border bg-muted p-8 lg:p-10">
        <div className="relative z-10 lg:max-w-[75%]">
          <p className="mb-4 text-[10px] font-semibold uppercase tracking-[0.22em] text-primary/70">
            Learn. Build. Make it yours.
          </p>
          <h1 className="font-heading text-4xl font-bold leading-[1.15] tracking-tight text-foreground lg:text-[46px]">
            Your next chapter
            <br />
            <span className="italic text-primary">starts here.</span>
          </h1>
          <p className="mt-4 max-w-md text-sm leading-6 text-muted-foreground">
            Explore practical courses. Build your understanding.
            <br className="hidden lg:block" /> Turn what you learn into
            something real.
          </p>
        </div>
        <div
          aria-hidden="true"
          className="absolute right-7 top-1/2 hidden size-60 -translate-y-1/2 items-center justify-center rounded-full border border-primary/10 lg:flex"
        >
          <div className="flex size-44 items-center justify-center rounded-full border border-primary/10">
            <div className="flex size-28 rotate-[-12deg] items-center justify-center rounded-3xl bg-primary text-primary-foreground shadow-xl shadow-primary/10">
              <BookOpen size={48} strokeWidth={1.1} />
            </div>
          </div>
          <ArrowUpRight
            size={24}
            className="absolute top-5 right-8 text-primary/50"
          />
        </div>
      </section>

      <nav aria-label="Courses" className="mb-6 flex flex-wrap gap-2">
        <button
          aria-pressed={tab === 'all'}
          onClick={() => setTab('all')}
          className={`rounded-lg px-4 py-2.5 text-xs font-medium transition-colors ${tab === 'all' ? 'bg-primary text-primary-foreground' : 'border border-border bg-card text-muted-foreground hover:border-primary'}`}
        >
          All courses
        </button>
        <button
          aria-pressed={tab === 'mine'}
          onClick={() => setTab('mine')}
          className={`rounded-lg px-4 py-2.5 text-xs font-medium transition-colors ${tab === 'mine' ? 'bg-primary text-primary-foreground' : 'border border-border bg-card text-muted-foreground hover:border-primary'}`}
        >
          My courses
        </button>
      </nav>

      <section aria-labelledby="courses-title">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <h2
                id="courses-title"
                className="text-xl font-semibold tracking-tight"
              >
                {tab === 'mine' ? 'My courses' : 'Explore courses'}
              </h2>
              {!loading && !error && (
                <span className="rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                  {tab === 'mine' ? mineCount : courses.length}
                </span>
              )}
            </div>
            <p className="mt-1.5 text-xs text-muted-foreground">
              {tab === 'mine'
                ? 'Pick up where you left off.'
                : 'Find something worth getting curious about.'}
            </p>
          </div>
          <button
            onClick={() => void load()}
            disabled={loading}
            aria-label="Refresh courses"
            className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-xs text-muted-foreground hover:text-primary disabled:opacity-50"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
        {tab === 'all' && (
          <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
            <div
              aria-label="Course categories"
              className="flex flex-wrap gap-2"
            >
              {['all', ...categories].map((value) => (
                <button
                  key={value}
                  aria-pressed={category === value}
                  onClick={() => setCategory(value)}
                  className={`rounded-lg px-4 py-2.5 text-xs font-medium transition-colors ${category === value ? 'bg-primary text-primary-foreground' : 'border border-border bg-card text-muted-foreground hover:border-primary'}`}
                >
                  {value === 'all' ? 'All categories' : categoryName(value)}
                </button>
              ))}
            </div>
            <label className="flex min-w-52 items-center gap-2 rounded-lg border border-border bg-card px-3 py-2.5 text-muted-foreground">
              <Search size={15} />
              <input
                aria-label="Search courses"
                placeholder="Search courses…"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                className="w-44 bg-transparent text-xs text-foreground outline-none placeholder:text-muted-foreground/70"
              />
            </label>
          </div>
        )}

        {loading ? (
          <div
            role="status"
            aria-label="Loading courses"
            className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3"
          >
            {[1, 2, 3].map((key) => (
              <div
                key={key}
                className="h-96 animate-pulse rounded-2xl border border-border bg-card"
              >
                <div className="h-40 rounded-t-2xl bg-[#e8ece5]" />
                <div className="space-y-4 p-5">
                  <div className="h-4 w-1/3 rounded bg-background" />
                  <div className="h-6 w-4/5 rounded bg-background" />
                  <div className="h-14 rounded bg-background" />
                </div>
              </div>
            ))}
          </div>
        ) : error ? (
          <div
            role="alert"
            className="rounded-2xl border border-border bg-card px-6 py-12 text-center"
          >
            <WifiOff className="mx-auto mb-4 text-muted-foreground" size={28} />
            <h3 className="font-semibold">We couldn’t load your courses</h3>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">
              {error}
            </p>
            <button
              onClick={() => void load()}
              className="mt-5 rounded-lg bg-primary px-5 py-2.5 text-sm text-primary-foreground"
            >
              Try again
            </button>
          </div>
        ) : tab === 'mine' && !signedIn ? (
          <div
            role="status"
            className="rounded-2xl border border-dashed border-border bg-card/50 px-6 py-14 text-center"
          >
            <UserRound className="mx-auto mb-4 text-primary" size={28} />
            <h3 className="font-semibold">Sign in to see your courses</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Your enrolled courses and progress will appear here.
            </p>
            <button
              onClick={onSignIn}
              className="mt-5 rounded-lg bg-primary px-5 py-2.5 text-sm text-primary-foreground"
            >
              Sign in
            </button>
          </div>
        ) : tab === 'mine' && !visible.length ? (
          <div
            role="status"
            className="rounded-2xl border border-dashed border-border bg-card/50 px-6 py-14 text-center"
          >
            <BookOpen className="mx-auto mb-4 text-primary" size={28} />
            <h3 className="font-semibold">You have not joined a course yet</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Pick one from the list. If a mentor sent you a link, open it to
              join.
            </p>
            <button
              onClick={() => {
                setTab('all');
                setQuery('');
                setCategory('all');
              }}
              className="mt-5 rounded-lg bg-primary px-5 py-2.5 text-sm text-primary-foreground"
            >
              Browse courses
            </button>
          </div>
        ) : !visible.length ? (
          <div
            role="status"
            className="rounded-2xl border border-dashed border-border bg-card/50 px-6 py-14 text-center"
          >
            <BookOpen className="mx-auto mb-4 text-primary" size={28} />
            <h3 className="font-semibold">
              {courses.length
                ? 'No matching courses'
                : 'A new chapter is on its way'}
            </h3>
            <p className="mt-2 text-sm text-muted-foreground">
              {courses.length
                ? 'Try another search or choose a different category.'
                : 'Published courses will appear here when they are available.'}
            </p>
            {courses.length > 0 && (
              <button
                onClick={() => {
                  setQuery('');
                  setCategory('all');
                }}
                className="mt-5 text-sm font-semibold text-primary underline underline-offset-4"
              >
                Clear filters
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
            {visible.map((course, index) => (
              <CourseCard
                key={course.id}
                course={course}
                index={index}
                onOpen={() => openCourse(course)}
              />
            ))}
          </div>
        )}
        <p aria-live="polite" className="mt-6 text-xs text-muted-foreground">
          {!loading && !error
            ? `${visible.length} ${visible.length === 1 ? 'course' : 'courses'} ${tab === 'mine' ? 'in your library' : query || category !== 'all' ? 'available with these filters' : 'available to explore'}`
            : '\u00a0'}
        </p>
      </section>
      <footer className="mt-10 flex items-center justify-between border-t border-border pt-5 text-[10px] text-muted-foreground/70">
        <span>Made for the way you learn.</span>
        <span>Edorax · Learning workspace</span>
      </footer>
    </div>
  );
}
