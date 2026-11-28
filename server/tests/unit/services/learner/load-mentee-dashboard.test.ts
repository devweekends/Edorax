import { beforeEach, describe, expect, it, vi } from "vitest";

const { enrollmentFindMany, helpFindMany, helpCount, studySessionFindMany, responseFindMany, releaseForEnrollment, releaseModulesWithBlocks } = vi.hoisted(() => ({
  enrollmentFindMany: vi.fn(),
  helpFindMany: vi.fn(),
  helpCount: vi.fn(),
  studySessionFindMany: vi.fn().mockResolvedValue([]),
  responseFindMany: vi.fn().mockResolvedValue([]),
  releaseForEnrollment: vi.fn().mockResolvedValue(null),
  releaseModulesWithBlocks: vi.fn(),
}));

vi.mock("../../../../src/db/prisma.js", () => ({
  prisma: {
    enrollment: { findMany: enrollmentFindMany, count: vi.fn().mockResolvedValue(0) },
    helpThread: { findMany: helpFindMany, count: helpCount },
    dailyActivity: { findMany: vi.fn().mockResolvedValue([]), groupBy: vi.fn().mockResolvedValue([]) },
    studySession: { findMany: studySessionFindMany, count: vi.fn().mockResolvedValue(0) },
    response: { findMany: responseFindMany },
    user: { findUnique: vi.fn().mockResolvedValue(null) },
    userProfile: { findUnique: vi.fn().mockResolvedValue(null) },
    chapterProgress: { count: vi.fn().mockResolvedValue(0), findMany: vi.fn().mockResolvedValue([]) },
    streakFreezeDay: { findMany: vi.fn().mockResolvedValue([]) },
    xpEntry: { aggregate: vi.fn().mockResolvedValue({ _sum: { amount: null } }) },
    leaderboardMember: { findMany: vi.fn().mockResolvedValue([]) },
    leaderboardPlacement: { count: vi.fn().mockResolvedValue(0), findFirst: vi.fn().mockResolvedValue(null) },
  },
}));

vi.mock("../../../../src/services/courses/releases.js", () => ({
  releaseForEnrollment,
  releaseModulesWithBlocks,
}));

import { loadMenteeDashboard } from "../../../../src/services/learner/load-mentee-dashboard.js";

describe("loadMenteeDashboard learner scope", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    enrollmentFindMany.mockResolvedValue([]);
    helpFindMany.mockResolvedValue([]);
    helpCount.mockResolvedValue(0);
    studySessionFindMany.mockResolvedValue([]);
    responseFindMany.mockResolvedValue([]);
    releaseForEnrollment.mockResolvedValue(null);
  });

  it("scopes enrollment and help records to the authorized learner", async () => {
    await loadMenteeDashboard({ learnerId: "learner-a", learnerName: "A" });

    expect(enrollmentFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId: "learner-a", status: { not: "DROPPED" } },
    }));
    expect(helpFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { menteeId: "learner-a" },
    }));
    expect(helpCount).toHaveBeenCalledWith({
      where: { menteeId: "learner-a", status: "OPEN" },
    });
  });

  it("uses the enrollment's selected release modules so Continue skips completed chapters", async () => {
    const now = new Date("2026-11-28T05:00:00Z");
    enrollmentFindMany.mockResolvedValue([
      {
        id: "enr-1",
        releaseId: "rel-2",
        variantSlug: null,
        moduleVersions: null,
        lifecycle: "ACTIVE",
        status: "ACTIVE",
        percentComplete: 67,
        chaptersCompleted: 2,
        totalScore: 0,
        maxScore: 0,
        pendingReviews: 0,
        xpTotal: 40,
        lastActiveAt: now,
        startedAt: now,
        completedAt: null,
        createdAt: now,
        course: {
          id: "course-1",
          slug: "database-challenges",
          title: "Database Challenges",
          coverUrl: null,
          familySlug: null,
          sequential: true,
          // Stale raw course rows from an earlier release that do not match the learner's completed release chapter IDs.
          modules: [
            {
              id: "mod-old",
              order: 1,
              title: "Claim a task exactly once",
              chapters: [
                { id: "ch-old-1", slug: "1-1-set-the-scene", title: "Set the scene", order: 1, blocks: [] },
              ],
            },
          ],
        },
        chapterProgress: [
          { chapterId: "ch-old-1", status: "IN_PROGRESS", blocksCompleted: 0, blocksTotal: 2, timeSpentSeconds: 30, startedAt: now, completedAt: null },
          { chapterId: "ch-rel-1", status: "COMPLETED", blocksCompleted: 2, blocksTotal: 2, timeSpentSeconds: 120, startedAt: now, completedAt: now },
          { chapterId: "ch-rel-2", status: "COMPLETED", blocksCompleted: 1, blocksTotal: 1, timeSpentSeconds: 90, startedAt: now, completedAt: now },
        ],
      },
    ]);
    studySessionFindMany.mockResolvedValue([
      {
        id: "sess-1",
        enrollmentId: "enr-1",
        status: "ENDED",
        startedAt: now,
        endedAt: now,
        activeSeconds: 90,
        updatedAt: now,
        chapter: { slug: "1-2-gap--rel2", title: "The gap between read and write" },
        enrollment: { course: { slug: "database-challenges", title: "Database Challenges" } },
      },
    ]);
    const releaseModules = [
      {
        id: "mod-rel",
        key: "m1",
        order: 1,
        title: "Claim a task exactly once",
        chapters: [
          { id: "ch-rel-1", key: "c1", slug: "1-1-set-the-scene--rel2", title: "Set the scene", order: 1, blocks: [] },
          { id: "ch-rel-2", key: "c2", slug: "1-2-gap--rel2", title: "The gap between read and write", order: 2, blocks: [] },
          { id: "ch-rel-3", key: "c3", slug: "1-3-update--rel2", title: "Put the check inside the UPDATE", order: 3, blocks: [] },
        ],
      },
    ];
    releaseForEnrollment.mockResolvedValue({ release: { id: "rel-2" }, variant: "default", modules: releaseModules, allModules: releaseModules });
    releaseModulesWithBlocks.mockResolvedValue(releaseModules);

    const model = await loadMenteeDashboard({ learnerId: "learner-a", learnerName: "A" });

    expect(model.primaryCourse?.chaptersTotal).toBe(3);
    expect(model.primaryCourse?.targetChapter?.title).toBe("Put the check inside the UPDATE");
    expect(model.primaryCourse?.href).toBe("/courses/database-challenges/1-3-update");
    expect(model.primaryCourse?.actionLabel).toBe("Start Put the check inside the UPDATE");
  });
});
