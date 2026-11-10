import type { Course, CourseDetail } from '../src/domain/catalog';

export const courses: Course[] = [
  {
    id: 'one',
    slug: 'systems',
    title: 'Systems from the ground up',
    description:
      'Understand processes, memory, and the foundations of Linux through hands-on projects.',
    coverUrl: null,
    difficulty: 'Intermediate',
    estimatedHours: 12,
    category: 'TECH',
    subcategory: null,
    tags: [],
    pricingType: 'FREE',
    priceCents: 0,
    currency: 'USD',
    projectGoal: 'Build a process explorer',
    instructorName: 'Edorax Team',
    moduleCount: 6,
    chapterCount: 24,
    ratingAverage: null,
    ratingCount: 0,
    enrollmentLifecycle: null,
  },
  {
    id: 'two',
    slug: 'communication',
    title: 'Communicate with clarity',
    description:
      'Turn complex ideas into clear conversations and become a more confident collaborator.',
    coverUrl: null,
    difficulty: 'Beginner',
    estimatedHours: 4,
    category: 'SOFT_SKILLS',
    subcategory: null,
    tags: [],
    pricingType: 'PAID',
    priceCents: 2500,
    currency: 'USD',
    projectGoal: null,
    instructorName: 'Course Mentor',
    moduleCount: 3,
    chapterCount: 12,
    ratingAverage: null,
    ratingCount: 0,
    enrollmentLifecycle: null,
  },
];

export const courseDetail: CourseDetail = {
  signedIn: true,
  ...courses[0],
  access: 'active',
  modules: [
    {
      id: 'module-one',
      title: 'Linux foundations',
      order: 1,
      chapters: [
        {
          id: 'chapter-one',
          title: 'Your first process',
          order: 1,
          estimatedMinutes: 15,
        },
        {
          id: 'chapter-two',
          title: 'Understanding memory',
          order: 2,
          estimatedMinutes: 25,
        },
      ],
    },
    {
      id: 'module-two',
      title: 'Resource controls',
      order: 2,
      chapters: [
        {
          id: 'chapter-three',
          title: 'Working with cgroups',
          order: 1,
          estimatedMinutes: 30,
        },
      ],
    },
  ],
};

export const courseOverview: import('../../server/src/shared/api/catalog').CourseOverview =
  {
    course: { ...courses[0], status: 'PUBLISHED' },
    access: 'active',
    enrollment: {
      percentComplete: 33,
      chaptersCompleted: 1,
      pendingReviews: 2,
      status: 'IN_PROGRESS',
    },
    rating: null,
    ratingDismissed: false,
    coupon: null,
    track: null,
    syllabus: {
      chapterCount: 3,
      continueHref: '/courses/systems/chapter-two',
      defaultOpenModuleId: 'module-one',
      modules: courseDetail.modules.map((module, index) => ({
        ...module,
        completedCount: index === 0 ? 1 : 0,
        chapters: module.chapters.map((chapter, chapterIndex) => ({
          id: chapter.id,
          slug: chapter.id,
          title: chapter.title,
          status:
            index === 0 && chapterIndex === 0
              ? 'COMPLETED'
              : index === 0
                ? 'IN_PROGRESS'
                : 'NOT_STARTED',
          blockCount: 4,
          blocksCompleted: index === 0 && chapterIndex === 0 ? 4 : 1,
          locked: index === 1,
          unlocksAfter: index === 1 ? 'Understanding memory' : null,
        })),
      })),
    },
  };
