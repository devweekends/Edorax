import type { IDEAPI } from './ide';
import type {
  CatalogCourseSummary,
  CatalogCourseDetail,
} from '../../../server/src/shared/api/catalog';
import type { LearnerProfile } from '../../../server/src/shared/api/learner';

export type Course = CatalogCourseSummary;
export type CourseDetail = CatalogCourseDetail & { signedIn: boolean };
export type Result<T> =
  | { ok: true; data: T }
  | { ok: false; message: string; code: string };
export type CatalogResult =
  | { ok: true; courses: Course[] }
  | { ok: false; message: string; code?: string };
export type EnrollmentResult = { lifecycle: 'ACTIVE' | 'PAYMENT_REQUIRED' };
export interface DesktopAPI {
  ide?: IDEAPI;
  labs: import('./labs').LabsAPI;
  shellLabs: import('./shell-labs').ShellLabsAPI;
  readonly platform?: string;
  offline: {
    status(slug: string): Promise<{ available: boolean; downloadedAt: string | null; chapters: number; pending: number }>;
    download(slug: string): Promise<Result<{ chapters: number; locked: number }>>;
    remove(slug: string): Promise<void>;
    sync(): Promise<{ pending: number; message: string | null }>;
    onStatus(listener: (status: { pending: number; message: string | null; code: string | null; synced: number; dropped: string[] }) => void): () => void;
  };
  webOrigin(): Promise<string>;
  integrityRequest(
    path: string,
    method: string,
    body?: unknown,
  ): Promise<Result<unknown>>;
  learning: Omit<ReturnType<typeof import('../api/learning').createLearningClient>, 'downloadChapter'>;
  startLearning(slug: string): Promise<Result<{ href: string | null }>>;
  enroll(courseId: string): Promise<Result<EnrollmentResult>>;
  listCourses(): Promise<CatalogResult>;
  audiobooks: {
    library(): Promise<import('./audiobooks').AudiobookLibraryResult>;
    download(slug: string): Promise<{ ok: boolean; message?: string }>;
    remove(slug: string): Promise<{ ok: boolean; message?: string }>;
  };
  courseDetail(slug: string): Promise<Result<CourseDetail>>;
  learnerProfile(): Promise<Result<LearnerProfile>>;
  home(): Promise<Result<import('./home').HomeSummary>>;
  progress(): Promise<Result<import('./progress').ProgressData>>;
  leaderboard: {
    context(): Promise<Result<import('./leaderboard').LeaderboardContext>>;
    hub(selection: import('./leaderboard').LeaderboardSelection): Promise<Result<import('./leaderboard').LeaderboardHubView>>;
    setOptIn(optIn: boolean): Promise<Result<null>>;
  };
  remote: { request(path: string, method: string, body?: unknown): Promise<Result<unknown>> };
  openWeb(path: string): Promise<void>;
  quizLockdown(active: boolean): Promise<{ screens: number }>;
  onQuizScreens(listener: (state: { screens: number }) => void): () => void;
  signIn(): Promise<Result<{ signedIn: true }>>;
  authStatus(): Promise<Result<{ signedIn: boolean }>>;
  cancelSignIn(): Promise<void>;
  signOut(): Promise<Result<{ signedIn: false }>>;
}
declare global {
  interface Window {
    buildment: DesktopAPI;
  }
}

export function filterCourses(
  courses: Course[],
  query: string,
  category: string,
): Course[] {
  const search = query.trim().toLowerCase();
  return courses.filter(
    (course) =>
      (category === 'all' || course.category === category) &&
      [course.title, course.description, course.instructorName].some((value) =>
        value?.toLowerCase().includes(search),
      ),
  );
}

export function isMyCourse(course: Course): boolean {
  return (
    course.enrollmentLifecycle === 'PENDING_ACCOUNT' ||
    course.enrollmentLifecycle === 'PAYMENT_REQUIRED' ||
    course.enrollmentLifecycle === 'ACTIVE' ||
    course.enrollmentLifecycle === 'COMPLETED'
  );
}

export function coursePrice(course: Course): string {
  if (course.pricingType === 'FREE') return 'Free';
  try {
    return new Intl.NumberFormat('en', {
      style: 'currency',
      currency: course.currency,
      maximumFractionDigits: 2,
    }).format(course.priceCents / 100);
  } catch {
    return `${course.currency} ${(course.priceCents / 100).toFixed(2)}`;
  }
}
