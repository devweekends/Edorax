import { test, expect } from '@playwright/test';
import { courses, courseDetail, courseOverview } from '../fixtures';
import { COURSE_FAMILIES } from '../../../server/src/shared/lib/course-tracks';

async function setup(
  page: import('@playwright/test').Page,
  overview = courseOverview,
  failOnce = false,
  delayDetail = false,
) {
  await page.addInitScript(
    ({ courses, courseDetail, overview, failOnce, delayDetail }) => {
      let attempts = 0;
      window.buildment = {
        listCourses: async () => ({ ok: true, courses }),
        courseDetail: async () => {
          if (delayDetail)
            await new Promise<void>((resolve) => {
              (window as any).resolveCourseDetail = resolve;
            });
          return {
            ok: true,
            data: { ...courseDetail, signedIn: true, access: 'active' },
          };
        },
        webOrigin: async () => 'https://edorax.com',
        cancelSignIn: async () => {},
        signOut: async () => ({ ok: true, data: { signedIn: false } }),
        startLearning: async () => ({
          ok: true,
          data: { href: '/courses/systems/chapter-two' },
        }),
        learning: {
          overview: async () =>
            ++attempts === 1 && failOnce
              ? {
                  ok: false,
                  code: 'CONNECTION_ERROR',
                  message: 'Course service unavailable',
                }
              : { ok: true, data: overview },
          updateTrack: async (
            course: string,
            kind: 'variant' | 'specialisation',
            slug: string,
          ) => {
            (window as any).savedTrack = { course, kind, slug };
            if (kind === 'variant') overview.track!.variantChosen = true;
            else overview.track!.specialisationSlug = slug;
            return {
              ok: true,
              data: { courseSlug: course, track: overview.track },
            };
          },
          lesson: async (_course: string, chapter: string) => {
            (window as any).openedChapter = chapter;
            const entry = overview
              .syllabus!.modules.flatMap((m) => m.chapters)
              .find((c) => c.slug === chapter)!;
            return {
              ok: true,
              data: {
                course: overview.course,
                chapter: {
                  ...entry,
                  lessonLabel: '01.02',
                  readerMode: 'DEFAULT',
                },
                locked: entry?.locked,
                modules: overview.syllabus!.modules,
                document: { type: 'root', children: [] },
                content: null,
              },
            };
          },
        },
      } as any;
    },
    { courses, courseDetail, overview, failOnce, delayDetail },
  );
  await page.goto('/');
  await page
    .getByRole('button', { name: 'Preview ' + courses[0].title, exact: true })
    .click();
}

test('enrolled overview shows web progress and checkpoint details and opens the chosen lesson natively', async ({
  page,
}) => {
  await setup(page);
  await expect(page.getByText('2 awaiting review')).toBeVisible();
  await expect(page.getByText('33%', { exact: true })).toBeVisible();
  await expect(
    page.getByText('1/3 lessons complete', { exact: true }),
  ).toBeVisible();
  await expect(page.getByText('4/4 checkpoints')).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Continue learning' }),
  ).toHaveAttribute('href', '/courses/systems/chapter-two');
  await page.getByRole('button', { name: /Resource controls:/ }).click();
  await expect(
    page.getByText('Unlocks after Understanding memory'),
  ).toBeVisible();
  await page.screenshot({
    path: 'test-results/enrolled-course.png',
    fullPage: true,
  });
  await page.getByRole('link', { name: /Your first process/ }).click();
  await expect(
    page.getByRole('heading', { name: 'Your first process', exact: true }),
  ).toBeVisible();
  expect(await page.evaluate(() => (window as any).openedChapter)).toBe(
    'chapter-one',
  );
  await expect(page.locator('webview, iframe')).toHaveCount(0);
  await page.getByRole('button', { name: 'Back to course preview' }).click();
  await expect(
    page.getByRole('link', { name: 'Continue learning' }),
  ).toBeVisible();
});

test('overview failures can be retried without showing the public preview as enrolled content', async ({
  page,
}) => {
  await setup(page, courseOverview, true);
  await expect(page.getByRole('alert')).toContainText(
    'Course service unavailable',
  );
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(
    page.getByRole('heading', { name: 'Course content' }),
  ).toBeVisible();
  await page.setViewportSize({ width: 760, height: 600 });
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(
    page.getByRole('link', { name: 'Continue learning' }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: 'test-results/enrolled-course-dark.png',
    fullPage: true,
  });
});

test('variant choice uses the shared picker and saves through the desktop bridge', async ({
  page,
}) => {
  const family = COURSE_FAMILIES[0];
  const variant = family.variants[0];
  const overview = {
    ...courseOverview,
    enrollment: {
      percentComplete: 0,
      chaptersCompleted: 0,
      pendingReviews: 0,
      status: 'IN_PROGRESS' as const,
    },
    track: {
      familySlug: family.slug,
      family,
      variantSlug: variant.slug,
      variantChosen: false,
      variantLocked: false,
      variantAssigned: false,
      specialisationSlug: null,
      specialisationOpen: false,
      availableVariantSlugs: [variant.slug],
    },
  };
  await setup(page, overview);
  await expect(
    page.getByRole('heading', { name: 'Your product', exact: true }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Build with ' + variant.productName })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Understanding memory', exact: true }),
  ).toBeVisible();
  expect(await page.evaluate(() => (window as any).savedTrack)).toEqual({
    course: 'systems',
    kind: 'variant',
    slug: variant.slug,
  });
});

test('completed learners see review and can choose a specialisation', async ({
  page,
}) => {
  const family = COURSE_FAMILIES[0];
  const overview = {
    ...courseOverview,
    enrollment: {
      percentComplete: 100,
      chaptersCompleted: 3,
      pendingReviews: 0,
      status: 'IN_PROGRESS' as const,
    },
    track: {
      familySlug: family.slug,
      family,
      variantSlug: family.variants[0].slug,
      variantChosen: true,
      variantLocked: true,
      variantAssigned: false,
      specialisationSlug: null,
      specialisationOpen: true,
    },
  };
  await setup(page, overview);
  await expect(page.getByRole('link', { name: 'Review course' })).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Choose your specialisation' }),
  ).toBeVisible();
  await page
    .getByRole('button', {
      name: 'Choose ' + family.specialisations[0].label,
      exact: true,
    })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Your specialisation' }),
  ).toBeVisible();
  expect(await page.evaluate(() => (window as any).savedTrack.kind)).toBe(
    'specialisation',
  );
});

test('access lookup never flashes the public preview before an enrolled course', async ({
  page,
}) => {
  await setup(page, courseOverview, false, true);
  await expect(page.getByRole('status')).toContainText('Loading your course');
  await expect(
    page.getByRole('heading', { name: courses[0].title, exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Sign in with browser' }),
  ).toHaveCount(0);
  await expect(page.getByText('AT A GLANCE')).toHaveCount(0);
  await page.evaluate(() => (window as any).resolveCourseDetail());
  await expect(
    page.getByRole('link', { name: 'Continue learning' }),
  ).toBeVisible();
});

test('enrolled course scroll stays inside the viewport with no blank document tail', async ({
  page,
}) => {
  await setup(page);
  await expect(
    page.getByRole('heading', { name: 'Course content' }),
  ).toBeVisible();
  const main = page.getByRole('main');
  await main.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await page.evaluate(() => window.scrollTo(0, 10000));
  const geometry = await page.evaluate(() => ({
    documentHeight: document.documentElement.scrollHeight,
    viewport: innerHeight,
    bodyScroll: scrollY,
    rootBottom: document.getElementById('root')!.getBoundingClientRect().bottom,
    sidebarBottom: document.querySelector('aside')!.getBoundingClientRect()
      .bottom,
    overscroll: getComputedStyle(document.querySelector('main')!)
      .overscrollBehaviorY,
  }));
  expect(geometry.documentHeight).toBe(geometry.viewport);
  expect(geometry.bodyScroll).toBe(0);
  expect(geometry.rootBottom).toBe(geometry.viewport);
  expect(geometry.sidebarBottom).toBe(geometry.viewport);
  expect(geometry.overscroll).toBe('none');
});

test('enrolled overview preserves the organization coupon banner', async ({
  page,
}) => {
  await setup(page, {
    ...courseOverview,
    coupon: {
      displayLabel: 'Organization scholarship',
      percentOff: 100,
      status: 'REDEEMED',
      organizationName: 'Learning team',
    },
  });
  await expect(page.getByText('Organization scholarship')).toBeVisible();
  await expect(
    page.getByText(
      'Access through Learning team — no payment needed for this enrollment.',
    ),
  ).toBeVisible();
});
