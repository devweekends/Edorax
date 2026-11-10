import { createLearningClient } from './learning';
import { backendBase, isCourse } from './catalog';
import { isRecord as record, isCourseDetail as isDetail } from './validation';
import type {
  CatalogResult,
  CourseDetail,
  EnrollmentResult,
  Result,
} from '../domain/catalog';
import type { LearnerProfile } from '../../../server/src/shared/api/learner';
import type { HomeCareer, HomeCourse, HomeSummary } from '../domain/home';
import type { ProgressData } from '../domain/progress';
import {
  isLeaderboardSelection,
  type LeaderboardContext,
  type LeaderboardHubView,
  type LeaderboardSelection,
} from '../domain/leaderboard';

// This module runs only in Electron's main process. Tokens never cross IPC.
export function createPreviewClient(
  base: string,
  request: typeof fetch = fetch,
) {
  let token: string | null = null;
  let authVersion = 0;
  let userId: string | null = null;
  let expiresAt: string | null = null;
  async function call(
    path: string,
    method = 'GET',
    body?: unknown,
    session = token,
  ): Promise<Result<unknown>> {
    try {
      const headers: Record<string, string> = { Accept: 'application/json' };
      if (session) headers.Authorization = 'Bearer ' + session;
      const snapshot = body instanceof Uint8Array;
      if (body !== undefined)
        headers['Content-Type'] = snapshot ? 'image/jpeg' : 'application/json';

      const options: RequestInit = {
        method,
        headers,
        redirect: 'error',
        signal: AbortSignal.timeout(15_000),
      };
      if (snapshot) options.body = new Uint8Array(body).buffer;
      else if (body !== undefined) options.body = JSON.stringify(body);

      const response = await request(backendBase(base) + path, options);
      if (response.status === 401 && session && session === token) {
        token = null;
        userId = null;
        expiresAt = null;
      }
      if (response.status === 204) return { ok: true, data: null };
      const payload: unknown = await response.json();
      if (!response.ok || !record(payload) || payload.success !== true) {
        let code = 'REQUEST_FAILED';
        let message = 'The request could not be completed. Please try again.';
        if (record(payload)) {
          if (typeof payload.code === 'string') code = payload.code;
          if (typeof payload.message === 'string')
            message = payload.message.slice(0, 500);
        }
        if (response.status === 401) code = 'AUTH_REQUIRED';
        return { ok: false, code, message };
      }
      return { ok: true, data: payload.data };
    } catch {
      return {
        ok: false,
        code: 'CONNECTION_ERROR',
        message:
          'Could not reach the course service. Check your connection and try again.',
      };
    }
  }
  return {
    restoreSession(saved: { token: string; userId: string; expiresAt: string }) {
      if (Date.parse(saved.expiresAt) <= Date.now()) return;
      token = saved.token;
      userId = saved.userId;
      expiresAt = saved.expiresAt;
    },
    sessionSnapshot() {
      return token && userId && expiresAt ? { token, userId, expiresAt } : null;
    },
    async integrityRequest(
      path: string,
      method: string,
      body?: unknown,
    ): Promise<Result<unknown>> {
      if (!token)
        return {
          ok: false,
          code: 'AUTH_REQUIRED',
          message: 'Sign in to continue.',
        };
      // Only the integrity endpoints are available through this bridge.
      const opening =
        /^\/api\/v1\/chapters\/[a-zA-Z0-9_-]+\/integrity$/.test(path) &&
        method === 'POST';
      const events =
        /^\/api\/v1\/integrity\/attempts\/[a-zA-Z0-9_-]+\/events$/.test(path) &&
        method === 'POST';
      const camera =
        /^\/api\/v1\/integrity\/attempts\/[a-zA-Z0-9_-]+\/camera$/.test(path) &&
        method === 'PUT';
      const snapshot =
        /^\/api\/v1\/integrity\/attempts\/[a-zA-Z0-9_-]+\/snapshots$/.test(
          path,
        ) && method === 'POST';
      if (!opening && !events && !camera && !snapshot)
        return {
          ok: false,
          code: 'INVALID_INPUT',
          message: 'Invalid integrity request.',
        };
      if (
        snapshot &&
        (!(body instanceof Uint8Array) || body.byteLength > 48 * 1024)
      )
        return {
          ok: false,
          code: 'INVALID_INPUT',
          message: 'Invalid quiz snapshot.',
        };
      return call(path, method, body);
    },
    learning: createLearningClient(async (path, method, body) => {
      if (!token)
        return {
          ok: false,
          code: 'AUTH_REQUIRED',
          message: 'Sign in to study this course.',
        };
      return call(path, method, body);
    }),
    request(path: string, method: string, body?: unknown): Promise<Result<unknown>> {
      return call(path, method, body);
    },
    async listCourses(): Promise<CatalogResult> {
      let result = await call('/api/v1/catalog');
      if (!result.ok && result.code === 'AUTH_REQUIRED')
        result = await call('/api/v1/catalog');
      if (!result.ok) return { ok: false, message: result.message, code: result.code };
      if (
        !record(result.data) ||
        !Array.isArray(result.data.courses) ||
        !result.data.courses.every(isCourse)
      )
        return {
          ok: false,
          message: 'The backend returned an unexpected course response.',
        };
      return { ok: true, courses: result.data.courses };
    },
    async courseDetail(slug: string): Promise<Result<CourseDetail>> {
      if (typeof slug !== 'string' || !slug || slug.length > 200)
        return { ok: false, code: 'INVALID_INPUT', message: 'Invalid course.' };
      const result = await call(`/api/v1/catalog/${encodeURIComponent(slug)}`);
      if (!result.ok) return result;
      if (!isDetail(result.data))
        return {
          ok: false,
          code: 'INVALID_RESPONSE',
          message:
            'The course service returned an unexpected curriculum. Please try again.',
        };
      return { ok: true, data: result.data };
    },
    async learnerProfile(): Promise<Result<LearnerProfile>> {
      if (!token)
        return {
          ok: false,
          code: 'AUTH_REQUIRED',
          message: 'Sign in to view your profile.',
        };
      const result = await call('/api/v1/learner/profile');
      if (!result.ok) return result;
      if (!record(result.data) || typeof result.data.email !== 'string')
        return {
          ok: false,
          code: 'INVALID_RESPONSE',
          message: 'Could not read your profile.',
        };
      return { ok: true, data: result.data as LearnerProfile };
    },
    async leaderboardContext(): Promise<Result<LeaderboardContext>> {
      if (!token)
        return { ok: false, code: 'AUTH_REQUIRED', message: 'Sign in to see leaderboards.' };
      const result = await call('/api/v1/learner/dashboard');
      if (!result.ok) return result;
      const model = result.data;
      if (!record(model) || !Array.isArray(model.courses) || !record(model.gamification))
        return { ok: false, code: 'INVALID_RESPONSE', message: 'Could not read your courses.' };
      const gamification = model.gamification as { hidden?: boolean; features?: { leaderboards?: boolean } };
      const courses = (model.courses as Array<{ courseId: string; title: string; state: string }>)
        .filter((course) => course.state !== 'DROPPED' && course.state !== 'PAYMENT_REQUIRED')
        .map((course) => ({ courseId: course.courseId, title: course.title }));
      const primary = record(model.primaryCourse)
        ? (model.primaryCourse as { courseId: string; state: string })
        : null;
      return {
        ok: true,
        data: {
          courses,
          featuresEnabled: Boolean(gamification.features?.leaderboards && !gamification.hidden),
          initialCourseId:
            primary && primary.state !== 'PAYMENT_REQUIRED'
              ? primary.courseId
              : (courses[0]?.courseId ?? null),
        },
      };
    },
    async leaderboardHub(selection: LeaderboardSelection): Promise<Result<LeaderboardHubView>> {
      if (!isLeaderboardSelection(selection))
        return { ok: false, code: 'INVALID_INPUT', message: 'Invalid leaderboard request.' };
      if (!token)
        return { ok: false, code: 'AUTH_REQUIRED', message: 'Sign in to see leaderboards.' };
      const params = new URLSearchParams({ category: selection.category, scope: selection.scope });
      if (selection.courseId) params.set('courseId', selection.courseId);
      const result = await call(`/api/v1/learner/leaderboards?${params.toString()}`);
      if (!result.ok) return result;
      if (!record(result.data) || typeof result.data.status !== 'string')
        return { ok: false, code: 'INVALID_RESPONSE', message: 'Could not read this board.' };
      return { ok: true, data: result.data as LeaderboardHubView };
    },
    async setLeaderboardOptIn(optIn: boolean): Promise<Result<null>> {
      if (typeof optIn !== 'boolean')
        return { ok: false, code: 'INVALID_INPUT', message: 'Invalid choice.' };
      if (!token)
        return { ok: false, code: 'AUTH_REQUIRED', message: 'Sign in to join leaderboards.' };
      const result = await call('/api/v1/learner/gamification', 'PATCH', { leaderboardOptIn: optIn });
      if (!result.ok) return result;
      return { ok: true, data: null };
    },
    async learnerHome(): Promise<Result<HomeSummary>> {
      if (!token)
        return { ok: false, code: 'AUTH_REQUIRED', message: 'Sign in to see your learning.' };
      const result = await call('/api/v1/learner/dashboard');
      if (!result.ok) return result;
      const model = result.data;
      if (
        !record(model) ||
        !Array.isArray(model.courses) ||
        !record(model.gamification) ||
        !record(model.overview) ||
        !record(model.activity)
      )
        return { ok: false, code: 'INVALID_RESPONSE', message: 'Could not read your dashboard.' };

      type RawCourse = {
        courseId: string;
        slug: string;
        title: string;
        state: string;
        percentComplete: number;
        chaptersCompleted: number;
        chaptersTotal: number;
        pendingReviews: number;
        xp: number | null;
        stage: { current: number; total: number; title: string } | null;
        targetChapter: { title: string } | null;
        totalStudySeconds: number;
        lastActiveAt: string | null;
        currentModule: string | null;
      };
      const toCourse = (raw: RawCourse): HomeCourse => ({
        courseId: raw.courseId,
        slug: raw.slug,
        title: raw.title,
        state: raw.state,
        percentComplete: raw.percentComplete,
        chaptersCompleted: raw.chaptersCompleted,
        chaptersTotal: raw.chaptersTotal,
        pendingReviews: raw.pendingReviews,
        targetChapter: raw.targetChapter?.title ?? null,
        stage: raw.stage,
        xp: raw.xp,
        totalStudySeconds: raw.totalStudySeconds,
        lastActiveAt: raw.lastActiveAt,
        currentModule: raw.currentModule,
      });

      const game = model.gamification as {
        xp: { total: number; thisWeek: number } | null;
        level: { level: number; percent: number; toNext: number; totalXp: number } | null;
        career: HomeCareer | null;
        freezes: { available: number; max: number } | null;
      };
      const overview = model.overview as { weekSeconds: number; chaptersCompleted: number; chaptersTotal: number; pendingReviews: number };
      const activity = model.activity as { week: { day: string; seconds: number }[]; activeDays: number };
      const habit = record(model.habit) ? (model.habit as { streakCount?: unknown; goal?: unknown; streakMilestone?: unknown }) : null;
      const learner = record(model.learner) ? (model.learner as { name?: unknown }) : null;
      const primaryRaw = record(model.primaryCourse) ? (model.primaryCourse as RawCourse) : null;
      const events = Array.isArray(model.recentEvents)
        ? (model.recentEvents as Array<{ id: string; title: string; context: string; occurredAt: string; type: string }>).slice(0, 5)
        : [];
      const actions = Array.isArray(model.actions)
        ? (model.actions as Array<{ id: string; title: string; context: string; statusLabel: string; kind: string; href?: string | null }>).slice(0, 3)
        : [];

      return {
        ok: true,
        data: {
          name: typeof learner?.name === 'string' ? learner.name : '',
          primary: primaryRaw && primaryRaw.state !== 'PAYMENT_REQUIRED' ? toCourse(primaryRaw) : null,
          courses: (model.courses as RawCourse[]).filter((course) => course.state !== 'DROPPED').map(toCourse),
          streak: habit && typeof habit.streakCount === 'number' ? habit.streakCount : 0,
          freezes: game.freezes ? { available: game.freezes.available, max: game.freezes.max } : null,
          level: game.level
            ? { level: game.level.level, percent: game.level.percent, toNext: game.level.toNext, totalXp: game.level.totalXp }
            : null,
          xp: game.xp ? { thisWeek: game.xp.thisWeek, total: game.xp.total } : null,
          career: game.career,
          week: activity.week,
          weekSeconds: overview.weekSeconds,
          activeDays: activity.activeDays,
          chaptersCompleted: overview.chaptersCompleted,
          chaptersTotal: overview.chaptersTotal,
          pendingReviews: overview.pendingReviews,
          events: events.map((event) => ({ id: event.id, title: event.title, context: event.context, occurredAt: event.occurredAt, type: event.type })),
          actions: actions.map((action) => ({ id: action.id, title: action.title, context: action.context, statusLabel: action.statusLabel, kind: action.kind, href: action.href ?? null })),
          goal: (habit?.goal ?? null) as HomeSummary['goal'],
          streakMilestone: habit && typeof habit.streakMilestone === 'number' ? habit.streakMilestone : null,
        },
      };
    },
    async learnerProgress(): Promise<Result<ProgressData>> {
      if (!token)
        return { ok: false, code: 'AUTH_REQUIRED', message: 'Sign in to see your progress.' };
      const progress = await call('/api/v1/learner/progress');
      if (!progress.ok) return progress;
      if (!record(progress.data) || !Array.isArray(progress.data.courses) || !record(progress.data.overall))
        return { ok: false, code: 'INVALID_RESPONSE', message: 'Could not read your progress.' };
      const profile = await call('/api/v1/learner/profile');
      const timezone = profile.ok && record(profile.data) && typeof profile.data.timezone === 'string' ? profile.data.timezone : 'UTC';
      const dashboard = await call('/api/v1/learner/dashboard');
      let streak = 0;
      if (dashboard.ok && record(dashboard.data) && record(dashboard.data.habit)) {
        const count = (dashboard.data.habit as { streakCount?: unknown }).streakCount;
        if (typeof count === 'number') streak = count;
      }
      return { ok: true, data: { ...(progress.data as Omit<ProgressData, 'streak' | 'timezone'>), streak, timezone } };
    },
    async enroll(courseId: string): Promise<Result<EnrollmentResult>> {
      if (typeof courseId !== 'string' || !courseId || courseId.length > 200)
        return { ok: false, code: 'INVALID_INPUT', message: 'Invalid course.' };
      if (!token)
        return {
          ok: false,
          code: 'AUTH_REQUIRED',
          message: 'Sign in to enroll in this course.',
        };
      const result = await call('/api/v1/enrollments', 'POST', { courseId });
      if (!result.ok) return result;
      if (
        !record(result.data) ||
        (result.data.lifecycle !== 'ACTIVE' &&
          result.data.lifecycle !== 'PAYMENT_REQUIRED')
      )
        return {
          ok: false,
          code: 'INVALID_RESPONSE',
          message:
            'Could not confirm enrollment. Refresh the course before trying again.',
        };
      return { ok: true, data: { lifecycle: result.data.lifecycle } };
    },
    // Ask the server which lesson this enrollment can open next.
    async nextLesson(slug: string): Promise<Result<{ href: string | null }>> {
      if (typeof slug !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(slug))
        return { ok: false, code: 'INVALID_INPUT', message: 'Invalid course.' };
      if (!token)
        return {
          ok: false,
          code: 'AUTH_REQUIRED',
          message: 'Sign in to start learning.',
        };
      const result = await call(
        '/api/v1/courses/' + encodeURIComponent(slug) + '/continue',
      );
      if (!result.ok) return result;
      if (!record(result.data))
        return {
          ok: false,
          code: 'INVALID_RESPONSE',
          message: 'Could not find the next lesson.',
        };
      const href = result.data.href;
      if (href === null) return { ok: true, data: { href: null } };
      // Only accept lesson paths belonging to this course.
      const prefix = '/courses/' + encodeURIComponent(slug) + '/';
      if (
        typeof href !== 'string' ||
        !href.startsWith(prefix) ||
        !/^[a-zA-Z0-9_-]+$/.test(href.slice(prefix.length))
      )
        return {
          ok: false,
          code: 'INVALID_RESPONSE',
          message: 'The service returned an invalid lesson address.',
        };
      return { ok: true, data: { href } };
    },
    cancelSignIn() {
      authVersion++;
    },
    async authStatus(): Promise<Result<{ signedIn: boolean }>> {
      if (expiresAt && Date.parse(expiresAt) <= Date.now()) {
        token = null;
        userId = null;
        expiresAt = null;
      }
      if (!token) return { ok: true, data: { signedIn: false } };
      const result = await call('/api/v1/auth/me');
      if (result.ok && record(result.data) && record(result.data.user)) {
        if (typeof result.data.user.id === 'string')
          userId = result.data.user.id;
        return { ok: true, data: { signedIn: true } };
      }
      // `call` clears the token on 401; otherwise keep the optimistic state.
      return { ok: true, data: { signedIn: Boolean(token) } };
    },
    async resolveLocalLabUser(): Promise<string | null> {
      if (!token) return null;
      if (userId) return userId;
      const session = token;
      const result = await call('/api/v1/auth/me', 'GET', undefined, session);
      if (session !== token)
        throw new Error('Your session changed. Reopen the workspace.');
      if (!result.ok) throw new Error(result.message);
      if (
        !record(result.data) ||
        !record(result.data.user) ||
        typeof result.data.user.id !== 'string'
      )
        throw new Error(
          'Could not identify your account. Please sign in again.',
        );
      userId = result.data.user.id;
      return userId;
    },
    localLabUser() {
      return token ? userId : null;
    },
    async exchange(
      code: string,
      verifier: string,
    ): Promise<Result<{ signedIn: true }>> {
      if (
        !/^[A-Za-z0-9_-]{43}$/.test(code) ||
        !/^[A-Za-z0-9_-]{43}$/.test(verifier)
      )
        return {
          ok: false,
          code: 'INVALID_INPUT',
          message: 'Invalid browser sign-in response.',
        };
      const version = ++authVersion;
      const result = await call(
        '/api/v1/auth/desktop/exchange',
        'POST',
        { code, verifier },
        null,
      );
      if (!result.ok) return result;
      if (
        !record(result.data) ||
        !record(result.data.session) ||
        typeof result.data.session.token !== 'string' ||
        !result.data.session.token
      ) {
        return {
          ok: false,
          code: 'INVALID_RESPONSE',
          message:
            'The service did not return a valid session. Please try again.',
        };
      }
      if (version !== authVersion)
        return {
          ok: false,
          code: 'CANCELLED',
          message: 'Sign-in was cancelled. Please try again.',
        };
      token = result.data.session.token;
      expiresAt = typeof result.data.session.expiresAt === 'string'
        ? result.data.session.expiresAt : null;
      userId =
        record(result.data.user) && typeof result.data.user.id === 'string'
          ? result.data.user.id
          : null;
      return { ok: true, data: { signedIn: true } };
    },
    async signOut(): Promise<Result<{ signedIn: false }>> {
      const previous = token;
      token = null;
      userId = null;
      expiresAt = null;
      authVersion++;
      if (previous) {
        const result = await call(
          '/api/v1/auth/logout',
          'POST',
          undefined,
          previous,
        );
        if (!result.ok)
          return {
            ok: false,
            code: 'LOCAL_SIGN_OUT',
            message:
              'Signed out on this device. The service could not confirm session revocation.',
          };
      }
      return { ok: true, data: { signedIn: false } };
    },
  };
}
