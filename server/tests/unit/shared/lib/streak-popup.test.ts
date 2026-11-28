import { describe, expect, it } from "vitest";
import {
  buildStreakWeek,
  shouldShowStreakPopup,
  streakMilestoneToCelebrate,
  streakDaySummary,
  weekdayInitial,
} from "../../../../src/shared/lib/streak-popup.js";
import { computeStreak } from "../../../../src/shared/lib/streak.js";

describe("shouldShowStreakPopup", () => {
  const today = "2026-11-03";

  it("hides after dismiss on the same local day", () => {
    expect(shouldShowStreakPopup({ seenOn: today, today })).toBe(false);
  });

  it("shows again on a new local day", () => {
    expect(shouldShowStreakPopup({ seenOn: "2026-11-02", today })).toBe(true);
  });

  it("shows on the first open once the learner has activity", () => {
    expect(shouldShowStreakPopup({ seenOn: null, today, hasActivity: true, joinedOn: "2026-11-01" })).toBe(true);
  });

  it("stays hidden for brand-new learners with no activity yet", () => {
    expect(shouldShowStreakPopup({ seenOn: null, today, hasActivity: false, joinedOn: "2026-11-01" })).toBe(false);
  });

  it("stays hidden on the learner's registration day even after first activity", () => {
    expect(shouldShowStreakPopup({ seenOn: null, today, hasActivity: true, joinedOn: today })).toBe(false);
  });
});

describe("buildStreakWeek", () => {
  const today = "2026-11-03"; // Monday

  it("returns seven days ending today with weekday initials", () => {
    const week = buildStreakWeek({
      today,
      activeDays: ["2026-11-01", "2026-11-02", "2026-11-03"],
      secondsByDay: { "2026-11-01": 600, "2026-11-02": 120, "2026-11-03": 45 },
    });
    expect(week).toHaveLength(7);
    expect(week.map((d) => d.day)).toEqual([
      "2026-10-28",
      "2026-10-29",
      "2026-10-30",
      "2026-10-31",
      "2026-11-01",
      "2026-11-02",
      "2026-11-03",
    ]);
    expect(week.map((d) => d.weekday)).toEqual(["W", "T", "F", "S", "S", "M", "T"]);
    expect(week.map((d) => d.status)).toEqual([
      "missed",
      "missed",
      "missed",
      "missed",
      "completed",
      "completed",
      "today",
    ]);
    expect(week.at(-1)?.seconds).toBe(45);
  });

  it("marks today as today even without activity", () => {
    const week = buildStreakWeek({ today, activeDays: ["2026-11-02"] });
    expect(week.at(-1)).toMatchObject({ day: today, status: "today", seconds: 0 });
    expect(week[5]).toMatchObject({ day: "2026-11-02", status: "completed" });
  });

  it("marks days before the learner joined as inactive instead of missed", () => {
    const week = buildStreakWeek({
      today,
      activeDays: ["2026-11-02"],
      joinedOn: "2026-11-01",
    });
    expect(week.map((d) => d.status)).toEqual([
      "inactive",
      "inactive",
      "inactive",
      "inactive",
      "missed",
      "completed",
      "today",
    ]);
    expect(streakDaySummary(week[0]!, today)).toContain("before you joined");
  });
});

describe("weekdayInitial", () => {
  it("uses the UTC weekday of the day key", () => {
    expect(weekdayInitial("2026-11-03")).toBe("T"); // Tuesday
    expect(weekdayInitial("2026-11-01")).toBe("S"); // Sunday
  });
});

describe("streakDaySummary", () => {
  it("describes today and past days", () => {
    expect(
      streakDaySummary(
        { day: "2026-11-03", weekday: "T", status: "today", seconds: 120 },
        "2026-11-03"
      )
    ).toContain("Today");
    expect(
      streakDaySummary(
        { day: "2026-11-02", weekday: "M", status: "completed", seconds: 600 },
        "2026-11-03"
      )
    ).toContain("10 minutes");
    expect(
      streakDaySummary(
        { day: "2026-11-01", weekday: "S", status: "missed", seconds: 0 },
        "2026-11-03"
      )
    ).toContain("no study logged");
  });
});

describe("streak calculation for the popup week", () => {
  it("counts consecutive active days the same way as habit streaks", () => {
    const today = "2026-11-03";
    const active = ["2026-10-31", "2026-11-01", "2026-11-02", "2026-11-03"];
    expect(computeStreak(active, today).count).toBe(4);
    expect(shouldShowStreakPopup({ seenOn: null, today })).toBe(true);
  });
});

describe("streakMilestoneToCelebrate", () => {
  it("celebrates the day after the milestone day, when the learner comes back", () => {
    // 7 days done by yesterday, nothing yet today: the count is 7.
    expect(streakMilestoneToCelebrate({ streakCount: 7, todayActive: false, celebrated: [3] })).toBe(7);
  });

  it("does not celebrate on the milestone day itself", () => {
    // Today's activity made the streak 7, so only 6 days were finished before today.
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
