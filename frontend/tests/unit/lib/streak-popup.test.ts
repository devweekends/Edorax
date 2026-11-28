import { describe, expect, it } from "vitest";
import {
  buildStreakWeek,
  shouldShowStreakPopup,
  streakDaySummary,
  streakMilestoneToCelebrate,
} from "@/shared/lib/streak-popup";
import { computeStreak } from "@/shared/lib/streak";

describe("shouldShowStreakPopup (once per local day)", () => {
  const today = "2026-11-03";

  it("does not show again after dismiss in the same window", () => {
    expect(shouldShowStreakPopup({ seenOn: today, today })).toBe(false);
  });

  it("shows on the next local day after a dismiss", () => {
    expect(shouldShowStreakPopup({ seenOn: "2026-11-02", today })).toBe(true);
  });

  it("shows on the first open once the learner has activity on a later day", () => {
    expect(shouldShowStreakPopup({ seenOn: null, today, hasActivity: true, joinedOn: "2026-11-01" })).toBe(true);
  });

  it("stays hidden for brand-new learners with no activity yet or on signup day", () => {
    expect(shouldShowStreakPopup({ seenOn: null, today, hasActivity: false, joinedOn: "2026-11-01" })).toBe(false);
    expect(shouldShowStreakPopup({ seenOn: null, today, hasActivity: true, joinedOn: today })).toBe(false);
  });
});

describe("streak week + calculation", () => {
  it("builds the last seven days with missed, completed, and today states", () => {
    const today = "2026-11-03";
    const week = buildStreakWeek({
      today,
      activeDays: ["2026-11-02", "2026-11-03"],
      secondsByDay: { "2026-11-02": 300, "2026-11-03": 90 },
    });
    expect(week).toHaveLength(7);
    expect(week.at(-1)).toMatchObject({ day: today, status: "today", seconds: 90 });
    expect(week[5]).toMatchObject({ status: "completed" });
    expect(week[0]?.status).toBe("missed");
    expect(streakDaySummary(week[5]!, today)).toContain("5 minutes");
  });

  it("marks days before signup as inactive instead of missed", () => {
    const today = "2026-11-03";
    const week = buildStreakWeek({
      today,
      activeDays: ["2026-11-02"],
      joinedOn: "2026-11-02",
    });
    expect(week.slice(0, 5).every((d) => d.status === "inactive")).toBe(true);
    expect(week[5]?.status).toBe("completed");
    expect(week[6]?.status).toBe("today");
    expect(streakDaySummary(week[0]!, today)).toContain("before you joined");
  });

  it("counts consecutive learning days with computeStreak", () => {
    const today = "2026-11-03";
    const active = ["2026-10-31", "2026-11-01", "2026-11-02", "2026-11-03"];
    expect(computeStreak(active, today).count).toBe(4);
  });
});

describe("streakMilestoneToCelebrate", () => {
  it("celebrates the day after the milestone day, when the learner comes back", () => {
    expect(streakMilestoneToCelebrate({ streakCount: 7, todayActive: false, celebrated: [3] })).toBe(7);
  });
  it("does not celebrate on the milestone day itself", () => {
    expect(streakMilestoneToCelebrate({ streakCount: 7, todayActive: true, celebrated: [3] })).toBeNull();
  });
  it("still celebrates after the learner has studied again today", () => {
    expect(streakMilestoneToCelebrate({ streakCount: 8, todayActive: true, celebrated: [3] })).toBe(7);
  });
  it("never repeats a milestone the learner has seen", () => {
    expect(streakMilestoneToCelebrate({ streakCount: 7, todayActive: false, celebrated: [3, 7] })).toBeNull();
  });
  it("returns the highest new milestone and handles an empty streak", () => {
    expect(streakMilestoneToCelebrate({ streakCount: 30, todayActive: false, celebrated: [3, 7, 14] })).toBe(30);
    expect(streakMilestoneToCelebrate({ streakCount: 0, todayActive: false, celebrated: [] })).toBeNull();
  });
});
