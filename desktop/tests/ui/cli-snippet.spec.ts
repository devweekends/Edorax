import { test, expect } from '@playwright/test';
import { courses, courseDetail } from '../fixtures';
import { parseLesson } from '../../src/learning/parse-lesson';

const document = parseLesson(`# CLI lesson

Run the lab:

\`\`\`text
bash lab/start.sh
\`\`\`

Start the stack:

\`\`\`powershell
docker compose up -d
\`\`\`
`);

test('shell fences expose Run in terminal and execute in the course terminal', async ({
  page,
}) => {
  page.on('pageerror', (error) => console.log('PAGEERROR:', error.message));
  page.on('console', (message) => {
    if (message.type() === 'error')
      console.log('CONSOLE-ERROR:', message.text().slice(0, 400));
  });
  await page.addInitScript(
    ({ courses, courseDetail, document }) => {
      let signedIn = false;
      (window as any).terminalCalls = [];
      (window as any).terminalChunks = [];
      window.buildment = {
        ...window.buildment,
        webOrigin: async () => 'https://edorax.com',
        integrityRequest: async () => ({ ok: true, data: null }),
        listCourses: async () => ({ ok: true, courses }),
        courseDetail: async () => ({
          ok: true,
          data: { ...courseDetail, signedIn, access: 'active' },
        }),
        learnerProfile: async () => ({
          ok: true,
          data: { id: 'u1', email: 'learner@example.com', name: 'Learner' },
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
        offline: {
          status: async () => ({
            available: false,
            downloadedAt: null,
            chapters: 0,
            pending: 0,
          }),
          download: async () => ({
            ok: true,
            data: { chapters: 0, locked: 0 },
          }),
          remove: async () => {},
          sync: async () => ({ pending: 0, message: null }),
        },
        startLearning: async () => ({
          ok: true,
          data: { href: '/courses/systems/lesson-one' },
        }),
        learning: {
          lesson: async () => ({
            ok: true,
            data: {
              course: {
                id: courses[0].id,
                slug: courses[0].slug,
                title: courses[0].title,
                projectGoal: null,
              },
              chapter: {
                id: 'chapter',
                slug: 'lesson-one',
                title: 'CLI lesson',
                lessonLabel: '01.01',
                estimatedMinutes: 10,
                readerMode: 'DEFAULT',
                isMilestone: false,
                blockCount: 2,
              },
              prev: null,
              next: null,
              modules: [
                {
                  id: 'module',
                  order: 1,
                  title: 'Debugging basics',
                  completedCount: 0,
                  chapters: [
                    {
                      id: 'chapter',
                      slug: 'lesson-one',
                      title: 'CLI lesson',
                      status: 'IN_PROGRESS',
                      blockCount: 2,
                    },
                  ],
                },
              ],
              track: null,
              locked: false,
              previous: null,
              content: {
                source: '',
                learningLogAnswers: {},
                checklistState: {},
                chapterComplete: false,
                canMarkComplete: false,
                checkpointsCompleted: 0,
                checkpointsTotal: 0,
                nextLocked: true,
                reflectionPending: false,
                recap: { checks: '', open: '', next: '' },
                streakMilestone: null,
                headingNotes: {},
                predictGate: false,
                predictRevealed: true,
                helpThread: null,
              },
              document,
            },
          }),
          saveLog: async () => ({ ok: true, data: null }),
          checklist: async () => ({ ok: true, data: null }),
          overview: async () => ({
            ok: true,
            data: {
              course: { ...courses[0], status: 'PUBLISHED' },
              access: 'active',
              enrollment: {
                percentComplete: 0,
                chaptersCompleted: 0,
                pendingReviews: 0,
                status: 'IN_PROGRESS',
              },
              rating: null,
              ratingDismissed: false,
              coupon: null,
              track: null,
              syllabus: {
                modules: [
                  {
                    id: 'module',
                    order: 1,
                    title: 'Debugging basics',
                    completedCount: 0,
                    chapters: [
                      {
                        id: 'chapter',
                        slug: 'lesson-one',
                        title: 'CLI lesson',
                        status: 'IN_PROGRESS',
                        blockCount: 2,
                        blocksCompleted: 0,
                        locked: false,
                        unlocksAfter: null,
                      },
                    ],
                  },
                ],
                chapterCount: 1,
                continueHref: '/courses/systems/lesson-one',
                defaultOpenModuleId: 'module',
              },
            },
          }),
        },
        labs: {
          prepareTerminal: async () => {
            (window as any).terminalCalls.push('prepare');
            return { blockId: 'terminal-x', folder: '/home/learner' };
          },
          openTerminal: async () => {
            (window as any).terminalCalls.push('open');
          },
          closeTerminal: async () => {},
          terminalInput: async (_b: string, _id: string, data: string) => {
            (window as any).terminalChunks.push(data);
          },
          resizeTerminal: async () => {},
          onTerminalData: () => () => {},
        },
      } as any;
    },
    { courses, courseDetail, document },
  );
  await page.goto('/');
  await page
    .getByRole('button', { name: 'Sign in with browser', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Preview ' + courses[0].title, exact: true })
    .click();
  await page.getByRole('link', { name: 'Start learning', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'CLI lesson', exact: true }).first(),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Run in terminal' }),
  ).toHaveCount(2);
  await page.getByRole('button', { name: 'Run in terminal' }).first().click();
  await expect(
    page.getByRole('region', { name: 'Course terminal' }),
  ).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => (window as any).terminalChunks.join('')))
    .toContain('bash lab/start.sh');
  await expect
    .poll(() => page.evaluate(() => (window as any).terminalCalls.join(',')))
    .toBe('prepare,open');

  // A reload restores the lesson after authentication, without replaying commands.
  await page.reload();
  await page
    .getByRole('button', { name: 'Sign in with browser', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: 'CLI lesson', exact: true }).first(),
  ).toBeVisible();
  expect(await page.evaluate(() => (window as any).terminalChunks)).toEqual([]);
});
