import test from 'node:test';
import assert from 'node:assert/strict';
import { GUIDED_TRACKS, guidedTrackViews } from '../src/domain/guided-labs';
import { coursePrice, type Course } from '../src/domain/catalog';

function course(slug: string, over: Partial<Course> = {}): Course {
  return {
    id: slug,
    slug,
    title: `Title of ${slug}`,
    description: null,
    coverUrl: null,
    difficulty: null,
    estimatedHours: 36,
    category: 'TECH',
    subcategory: null,
    tags: [],
    pricingType: 'PAID',
    priceCents: 1000,
    currency: 'USD',
    projectGoal: null,
    instructorName: null,
    moduleCount: 4,
    chapterCount: 57,
    ratingAverage: null,
    ratingCount: 0,
    enrollmentLifecycle: null,
    ...over,
  } as Course;
}

test('without the catalog every track lists as coming soon with its fallback title', () => {
  const views = guidedTrackViews(null, coursePrice);
  assert.equal(views.length, GUIDED_TRACKS.length);
  for (const view of views) {
    assert.equal(view.open, false);
    assert.equal(view.title, view.track.fallbackTitle);
    assert.equal(view.price, '');
  }
  assert.equal(views.find((v) => v.track.slug === 'site-and-outreach')?.length, 'About two weeks');
});

test('a track in the catalog opens with the catalog title, length and price', () => {
  const views = guidedTrackViews([course('dw-level-1'), course('dw-level-3', { pricingType: 'FREE', priceCents: 0, chapterCount: 0 })], coursePrice);
  const level1 = views.find((v) => v.track.slug === 'dw-level-1')!;
  assert.equal(level1.open, true);
  assert.equal(level1.title, 'Title of dw-level-1');
  assert.equal(level1.length, '36 hours · 57 chapters');
  assert.equal(level1.price, '$10.00');
  const level3 = views.find((v) => v.track.slug === 'dw-level-3')!;
  assert.equal(level3.length, '36 hours');
  assert.equal(level3.price, 'Free');
  assert.equal(views.find((v) => v.track.slug === 'site-and-outreach')!.open, false);
});
