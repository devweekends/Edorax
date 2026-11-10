import { test, expect } from '@playwright/test';
import { courses, courseDetail } from '../fixtures';
import { parseLesson } from '../../src/learning/parse-lesson';

const document = parseLesson(`# Native lesson

Learn by testing one change at a time.

<Quiz id="question-one" />`);
for (const muted of [false, true]) {
  test(`native reader submits quizzes, completes chapters and respects sound mute=${muted}`, async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.addInitScript((muted) => {
      localStorage.setItem('buildment:sound', muted ? 'off' : 'on');
      (window as any).feedbackSounds = [];
      HTMLMediaElement.prototype.play = function () {
        (window as any).feedbackSounds.push(this.src);
        return Promise.resolve();
      };
    }, muted);
    await page.addInitScript(
      ({ courses, courseDetail, document }) => {
        let passed = false;
        let complete = false;
        let signedIn = false;
        const modules =
          (): import('../../../server/src/shared/api/syllabus').SyllabusModule[] => [
            {
              id: 'module',
              order: 1,
              title: 'Debugging basics',
              completedCount: complete ? 1 : 0,
              chapters: [
                {
                  id: 'chapter',
                  slug: 'lesson-one',
                  title: 'Native quiz lesson',
                  status: complete ? 'COMPLETED' : 'IN_PROGRESS',
                  blockCount: 1,
                },
                {
                  id: 'next',
                  slug: 'lesson-two',
                  title: 'Next debugging lesson',
                  status: 'NOT_STARTED',
                  blockCount: 0,
                  locked: !complete,
                },
              ],
            },
          ];
        window.buildment = {
          ...window.buildment,
          webOrigin: async () => 'https://edorax.com',
          integrityRequest: async (path, _method, body) => {
            if (path.endsWith('/integrity'))
              return {
                ok: true,
                data: {
                  attemptId: 'attempt-one',
                  attempt: 1,
                  startedAt: new Date().toISOString(),
                  flagCount: 0,
                  camera: {
                    enabled: false,
                    status: 'NOT_REQUESTED',
                    intervalSeconds: 60,
                    width: 320,
                    height: 240,
                    retentionDays: 30,
                  },
                },
              };
            if (path.endsWith('/events')) {
              (window as any).integrityEvents = [
                ...((window as any).integrityEvents || []),
                ...(body as any).events,
              ];
              return {
                ok: true,
                data: { accepted: (body as any).events.length, flagCount: 1 },
              };
            }
            return { ok: true, data: null };
          },
          listCourses: async () => ({ ok: true, courses }),
          courseDetail: async () => ({
            ok: true,
            data: { ...courseDetail, signedIn, access: 'active' },
          }),
          signIn: async () => {
            signedIn = true;
            return { ok: true, data: { signedIn: true } };
          },
          signOut: async () => {
            signedIn = false;
            return { ok: true, data: { signedIn: false } };
          },
          cancelSignIn: async () => {},
          enroll: async () => ({ ok: true, data: { lifecycle: 'ACTIVE' } }),
          startLearning: async () => ({
            ok: true,
            data: { href: '/courses/systems/lesson-one' },
          }),
          learning: {
            upgradeCurriculum: async () => ({
              ok: true,
              data: { success: true, releaseId: 'rel-1' },
            }),
            updateTrack: async () => {
              throw new Error('Unexpected track mutation');
            },
            lesson: async (_course, chapter) => ({
              ok: true,
              data: {
                course: {
                  id: courses[0].id,
                  slug: courses[0].slug,
                  title: courses[0].title,
                  projectGoal: null,
                },
                chapter: {
                  id: chapter === 'lesson-one' ? 'chapter' : 'next',
                  slug: chapter,
                  title:
                    chapter === 'lesson-one'
                      ? 'Native quiz lesson'
                      : 'Next debugging lesson',
                  lessonLabel: '01.01',
                  estimatedMinutes: 10,
                  readerMode: chapter === 'lesson-one' ? 'QUIZ' : 'DEFAULT',
                  isMilestone: false,
                  blockCount: 1,
                },
                prev: null,
                next:
                  chapter === 'lesson-one'
                    ? {
                        slug: 'lesson-two',
                        title: 'Next debugging lesson',
                        moduleOrder: 1,
                        order: 2,
                      }
                    : null,
                modules: modules() as any,
                track: null,
                locked: false,
                previous: null,
                content: {
                  source: '',
                  learningLogAnswers: {},
                  checklistState: {},
                  chapterComplete: complete,
                  canMarkComplete: passed && !complete,
                  checkpointsCompleted: passed ? 1 : 0,
                  checkpointsTotal: 1,
                  nextLocked: !complete,
                  reflectionPending: false,
                  recap: { checks: '', open: '', next: '' },
                  streakMilestone: null,
                  headingNotes: {},
                  predictGate: false,
                  predictRevealed: true,
                  helpThread: null,
                },
                document:
                  chapter === 'lesson-one'
                    ? document
                    : {
                        type: 'root',
                        children: [
                          {
                            type: 'paragraph',
                            children: [
                              {
                                type: 'text',
                                value: 'You unlocked this lesson.',
                              },
                            ],
                          },
                        ],
                      },
              },
            }),
            block: async () => ({
              ok: true,
              data: {
                type: 'QUIZ',
                config: {
                  quizType: 'single',
                  prompt: 'What should you change?',
                  options: [
                    { id: 'one', label: 'One thing at a time' },
                    { id: 'all', label: 'Everything at once' },
                  ],
                  allowRetry: true,
                },
                initialState: passed
                  ? {
                      selected: ['one'],
                      isCorrect: true,
                      score: 1,
                      maxScore: 1,
                    }
                  : null,
              },
            }),
            aiInterview: async () => ({
              ok: false,
              code: 'NOT_USED',
              message: 'This reader fixture does not provide interviews.',
            }),
            quiz: async () => ({
              ok: true,
              data: {
                steps: [],
                blockIds: ['question-one'],
                initialAnswers: passed ? { 'question-one': ['one'] } : {},
                initialBlockGrades: {},
                initialScoreSummary: null,
              },
            }),
            submitQuiz: async (id, answers) => {
              if (
                id !== 'chapter' ||
                answers.length !== 1 ||
                answers[0].blockId !== 'question-one'
              )
                throw new Error('Wrong quiz submission');
              passed = answers[0].selected.includes('one');
              return { ok: true, data: { score: passed ? 1 : 0, maxScore: 1 } };
            },
            complete: async () => {
              if (!passed) throw new Error('Quiz incomplete');
              complete = true;
              return { ok: true, data: null };
            },
            overview: async () => ({
              ok: true,
              data: {
                course: { ...courses[0], status: 'PUBLISHED' },
                access: 'active',
                coupon: null,
                track: null,
                enrollment: {
                  percentComplete: 0,
                  chaptersCompleted: 0,
                  pendingReviews: 0,
                  status: 'IN_PROGRESS',
                },
                rating: null,
                ratingDismissed: false,
                syllabus: {
                  modules: modules(),
                  chapterCount: 2,
                  continueHref: '/courses/systems/lesson-one',
                  defaultOpenModuleId: 'module',
                },
              },
            }),
            answer: async () => {
              throw new Error('Quiz chapters must use batch submission');
            },
            saveLog: async () => ({ ok: true, data: null }),
            checklist: async () => ({ ok: true, data: null }),
          },
        };
      },
      { courses, courseDetail, document },
    );
    await page.goto('/');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await page
      .getByRole('button', { name: 'Preview ' + courses[0].title, exact: true })
      .click();
    await page
      .getByRole('link', { name: 'Start learning', exact: true })
      .click();
    await expect(
      page.getByRole('heading', { name: 'Native quiz lesson', exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Start quiz', exact: true }),
    ).toBeVisible();
    await expect(page.locator('iframe, webview')).toHaveCount(0);
    await expect(
      page.getByRole('navigation', { name: 'Course chapters' }),
    ).toBeVisible();
    await expect(
      page.getByRole('complementary', { name: 'Main navigation' }),
    ).toHaveCount(0);
    await page.getByRole('button', { name: 'Start quiz', exact: true }).click();
    await page
      .getByRole('region', { name: 'Quiz session' })
      .evaluate((el) =>
        el.dispatchEvent(
          new Event('copy', { bubbles: true, cancelable: true }),
        ),
      );
    await expect(
      page.getByText('Copy is turned off during this quiz.'),
    ).toBeVisible();

    await expect(
      page.getByRole('button', { name: 'Mark lesson complete' }),
    ).toBeDisabled();
    await expect(
      page.getByRole('button', { name: 'Next lesson', exact: true }),
    ).toBeDisabled();
    await page
      .getByRole('radio', { name: 'Everything at once', exact: true })
      .click();
    await page
      .getByRole('button', { name: 'Submit quiz', exact: true })
      .click();
    await expect(page.getByText('Quiz score: 0 / 1')).toBeVisible();
    if (!muted)
      expect(await page.evaluate(() => (window as any).feedbackSounds)).toEqual(
        [expect.stringContaining('error.wav')],
      );
    await expect(
      page.getByRole('button', { name: 'Mark lesson complete' }),
    ).toBeDisabled();
    await page
      .getByRole('radio', { name: 'One thing at a time', exact: true })
      .click();
    await page
      .getByRole('button', { name: 'Submit again', exact: true })
      .click();
    await expect(page.getByText('Quiz score: 1 / 1')).toBeVisible();
    if (!muted)
      expect(await page.evaluate(() => (window as any).feedbackSounds)).toEqual(
        [
          expect.stringContaining('error.wav'),
          expect.stringContaining('celebration.wav'),
        ],
      );
    await page.getByRole('button', { name: 'Mark lesson complete' }).click();
    await expect(
      page.getByRole('button', { name: 'Lesson completed' }),
    ).toBeDisabled();
    const sounds: string[] = await page.evaluate(
      () => (window as any).feedbackSounds,
    );
    expect(sounds).toEqual(
      muted
        ? []
        : [
            expect.stringContaining('error.wav'),
            expect.stringContaining('celebration.wav'),
            expect.stringContaining('completion.wav'),
          ],
    );
    for (const url of sounds) {
      const response = await page.request.get(url);
      expect(response.ok()).toBe(true);
      expect((await response.body()).subarray(0, 4).toString()).toBe('RIFF');
    }
    await page.screenshot({
      path: 'test-results/native-reader.png',
      fullPage: true,
    });
    await page
      .getByRole('button', { name: 'Next lesson', exact: true })
      .click();
    await expect(page.getByText('You unlocked this lesson.')).toBeVisible();
    await page.locator('summary').filter({ hasText: 'Profile' }).click();
    await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    await expect(page.getByText('You unlocked this lesson.')).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: 'Sign in', exact: true }),
    ).toBeVisible();
  });
}
