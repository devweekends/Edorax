import { describe, expect, it } from "vitest";
import type { CatalogCourseSummary } from "@/shared/api/catalog";
import type { DashboardCourse, MenteeDashboardViewModel } from "@/shared/api/learner";
import {
  dashboardVisibility,
  getLearnerOnboardingStage,
  selectStarterCourses,
} from "@/lib/learner-onboarding";
import { shouldShowStatStrip } from "@/components/learn/mentee-workspace-shell";

function makeCourse(overrides: Partial<DashboardCourse> = {}): DashboardCourse {
  return {
    id: "enr-1",
    courseId: "course-1",
    slug: "intro-networking",
    title: "Networking Foundations",
    coverUrl: null,
    enrollmentStatus: "ACTIVE",
    state: "NOT_STARTED",
    percentComplete: 0,
    chaptersCompleted: 0,
    chaptersTotal: 10,
    pendingReviews: 0,
    totalScore: 0,
    maxScore: 0,
    totalStudySeconds: 0,
    lastActiveAt: null,
    currentModule: "Module 1",
    xp: 0,
    stage: { current: 1, total: 3, title: "Module 1" },
    targetChapter: { title: "Chapter 1", slug: "ch-1", status: "NOT_STARTED", blocksCompleted: 0, blocksTotal: 3 },
    href: "/courses/intro-networking/ch-1",
    overviewHref: "/courses/intro-networking",
    actionLabel: "Start Chapter 1",
    actionReason: "Begin with the first available chapter.",
    priority: 30,
    ...overrides,
  };
}

function makeModel(overrides: Partial<MenteeDashboardViewModel> = {}): MenteeDashboardViewModel {
  return {
    learner: { name: "Amina" },
    primaryCourse: null,
    actions: [],
    courses: [],
    overview: {
      assignedCourses: 0,
      inProgressCourses: 0,
      completedCourses: 0,
      chaptersCompleted: 0,
      chaptersTotal: 0,
      todaySeconds: 0,
      weekSeconds: 0,
      totalSeconds: 0,
      pendingReviews: 0,
      openHelpRequests: 0,
    },
    activity: {
      week: [],
      activeDays: 0,
      maxDaySeconds: 1,
      lastActiveAt: null,
      recentChapter: null,
      runningSession: null,
    },
    latestFeedback: null,
    help: { openCount: 0, latest: null },
    recentEvents: [],
    habit: {
      streakCount: 0,
      graceUsed: false,
      streakMilestone: null,
      weeklyGoal: null,
      goal: null,
    },
    gamification: {
      features: {
        xp: true,
        streakFreezes: true,
        levels: true,
        career: true,
        credits: true,
        leaderboards: true,
        leagueTiers: true,
        recovery: true,
      },
      hidden: false,
      leaderboardOptIn: false,
      xp: { total: 0, thisWeek: 0 },
      level: { level: 1, xpTotal: 0, intoLevel: 0, levelSpan: 50, toNext: 50, percent: 0 },
      career: null,
      credits: { balance: 0, earnedTotal: 0 },
      freezes: { available: 0, max: 2, recentlyCoveredDays: [] },
      topThree: null,
    },
    leaderboard: null,
    ...overrides,
  };
}

function makeCatalogCourse(overrides: Partial<CatalogCourseSummary>): CatalogCourseSummary {
  return {
    id: "c-1",
    slug: "course-1",
    title: "Course 1",
    description: "Description",
    coverUrl: null,
    difficulty: "INTERMEDIATE",
    estimatedHours: 4,
    category: "TECH",
    subcategory: null,
    tags: [],
    pricingType: "FREE",
    priceCents: 0,
    currency: "USD",
    projectGoal: null,
    instructorName: null,
    moduleCount: 2,
    chapterCount: 6,
    ratingAverage: null,
    ratingCount: 0,
    enrollmentLifecycle: null,
    ...overrides,
  };
}

describe("getLearnerOnboardingStage", () => {
  it("returns choose_course when the learner has no active courses", () => {
    expect(getLearnerOnboardingStage(makeModel())).toBe("choose_course");
    expect(
      getLearnerOnboardingStage(makeModel({ courses: [makeCourse({ state: "DROPPED" })] }))
    ).toBe("choose_course");
  });

  it("returns first_lesson when enrolled with zero progress and zero activity", () => {
    const course = makeCourse();
    expect(
      getLearnerOnboardingStage(makeModel({ courses: [course], primaryCourse: course }))
    ).toBe("first_lesson");
  });

  it("returns building_habit after first chapter or first study activity", () => {
    const course = makeCourse({ state: "IN_PROGRESS", chaptersCompleted: 1, totalStudySeconds: 300 });
    const base = makeModel({ courses: [course], primaryCourse: course });
    expect(
      getLearnerOnboardingStage({
        ...base,
        overview: { ...base.overview, chaptersCompleted: 1, totalSeconds: 300 },
        activity: { ...base.activity, activeDays: 1 },
        habit: { ...base.habit, streakCount: 1 },
      })
    ).toBe("building_habit");
  });

  it("returns established once the learner has 3+ chapters, 2+ active days, level 2+, or leaderboard opt-in", () => {
    const course = makeCourse({ state: "IN_PROGRESS", chaptersCompleted: 3 });
    const base = makeModel({ courses: [course], primaryCourse: course });

    expect(
      getLearnerOnboardingStage({ ...base, overview: { ...base.overview, chaptersCompleted: 3 } })
    ).toBe("established");
    expect(
      getLearnerOnboardingStage({ ...base, activity: { ...base.activity, activeDays: 2 } })
    ).toBe("established");
    expect(
      getLearnerOnboardingStage({
        ...base,
        gamification: { ...base.gamification, level: { ...base.gamification.level!, level: 2 } },
      })
    ).toBe("established");
    expect(
      getLearnerOnboardingStage({
        ...base,
        gamification: { ...base.gamification, leaderboardOptIn: true },
      })
    ).toBe("established");
  });
});

describe("dashboardVisibility", () => {
  it("keeps quests, leagues, snapshot, and goal editor hidden on Day 0", () => {
    expect(dashboardVisibility("choose_course")).toEqual({
      showGoalEditorInHeader: false,
      showQuickGoalNudge: false,
      showWeeklySnapshot: false,
      showWeeklyQuests: false,
      showLeagueGoal: false,
    });
    expect(dashboardVisibility("first_lesson")).toEqual({
      showGoalEditorInHeader: false,
      showQuickGoalNudge: false,
      showWeeklySnapshot: false,
      showWeeklyQuests: false,
      showLeagueGoal: false,
    });
  });

  it("shows snapshot and quick goal nudge while building a habit, then quests and leagues once established", () => {
    expect(dashboardVisibility("building_habit")).toEqual({
      showGoalEditorInHeader: false,
      showQuickGoalNudge: true,
      showWeeklySnapshot: true,
      showWeeklyQuests: false,
      showLeagueGoal: false,
    });
    expect(dashboardVisibility("established")).toEqual({
      showGoalEditorInHeader: true,
      showQuickGoalNudge: false,
      showWeeklySnapshot: true,
      showWeeklyQuests: true,
      showLeagueGoal: true,
    });
  });
});

describe("selectStarterCourses", () => {
  const catalog: CatalogCourseSummary[] = [
    makeCatalogCourse({ id: "paid-beg", title: "Paid Beginner", pricingType: "PAID", priceCents: 2900, difficulty: "BEGINNER", category: "TECH" }),
    makeCatalogCourse({ id: "free-adv", title: "Free Advanced", pricingType: "FREE", difficulty: "ADVANCED", category: "TECH" }),
    makeCatalogCourse({ id: "free-beg", title: "Free Beginner", pricingType: "FREE", difficulty: "BEGINNER", category: "TECH" }),
    makeCatalogCourse({ id: "free-soft", title: "Communication", pricingType: "FREE", difficulty: "BEGINNER", category: "SOFT_SKILLS" }),
  ];

  it("prioritizes free courses and beginner difficulty", () => {
    const picked = selectStarterCourses(catalog, "TECH");
    expect(picked.map((c) => c.id)).toEqual(["free-beg", "free-adv", "paid-beg"]);
  });

  it("respects category filter and limit", () => {
    expect(selectStarterCourses(catalog, "SOFT_SKILLS").map((c) => c.id)).toEqual(["free-soft"]);
    expect(selectStarterCourses(catalog, null, 2)).toHaveLength(2);
  });
});

describe("shouldShowStatStrip", () => {
  it("hides the strip for brand-new learners with all zeros or when gamification is hidden", () => {
    expect(shouldShowStatStrip({ streak: 0, xpTotal: 0, level: 1, career: "Starter", credits: 0, hidden: false })).toBe(false);
    expect(shouldShowStatStrip({ streak: 5, xpTotal: 200, level: 3, career: "Builder", credits: 50, hidden: true })).toBe(false);
  });

  it("shows the strip once the learner earns their first streak, XP, or credits", () => {
    expect(shouldShowStatStrip({ streak: 1, xpTotal: 0, level: 1, career: null, credits: 0, hidden: false })).toBe(true);
    expect(shouldShowStatStrip({ streak: 0, xpTotal: 20, level: 1, career: null, credits: 0, hidden: false })).toBe(true);
    expect(shouldShowStatStrip({ streak: 0, xpTotal: 0, level: 1, career: null, credits: 10, hidden: false })).toBe(true);
  });
});
