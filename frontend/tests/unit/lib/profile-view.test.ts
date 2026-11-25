import { describe, expect, it } from "vitest";
import type { AchievementView } from "../../../src/shared/api/public-profile";
import { careerNodeState, careerRequirementLine, featuredAchievements, monthYear, nextStepCopy } from "../../../src/lib/profile-view";

function achievement(id: string, progress: number, tier: number, nextTarget: number | null): AchievementView {
  return {
    id,
    title: id,
    description: "",
    category: "courses",
    icon: "book",
    value: 1,
    tier,
    nextTarget,
    progress,
    tiers: [{ label: "Bronze", target: 1 }],
    earnedCredits: 0,
    nextReward: null,
  };
}

describe("careerNodeState", () => {
  it("marks tiers before, at, right after and beyond the current one", () => {
    expect([0, 1, 2, 3].map((index) => careerNodeState(index, 1))).toEqual(["done", "current", "next", "locked"]);
  });
});

describe("careerRequirementLine", () => {
  it("describes the starting tier and a gated tier", () => {
    expect(careerRequirementLine({ courses: 0, minScore: 0 })).toBe("Where every learner starts.");
    expect(careerRequirementLine({ courses: 5, minScore: 72 })).toBe("5 courses · 72% average");
  });
});

describe("nextStepCopy", () => {
  const mid = { courses: 5, minScore: 72 };

  it("states the rule without the learner's numbers", () => {
    expect(nextStepCopy("MID", mid, null)).toBe("Mid needs 5 completed courses and a 72% average quiz score.");
  });

  it("names the remaining courses and the score gap", () => {
    expect(nextStepCopy("MID", mid, { completedCourses: 2, avgScore: 65 })).toBe(
      "Complete 3 more courses and raise your average quiz score from 65% to 72%.",
    );
  });

  it("asks to keep the score when only courses are missing", () => {
    expect(nextStepCopy("MID", mid, { completedCourses: 4, avgScore: 80 })).toBe(
      "Complete 1 more course and keep your average quiz score at 72% or higher.",
    );
  });

  it("says the requirements are met when nothing is missing", () => {
    expect(nextStepCopy("MID", mid, { completedCourses: 5, avgScore: 80 })).toMatch(/^You meet the Mid requirements/);
  });
});

describe("featuredAchievements", () => {
  it("picks the two closest to their next tier and skips maxed ones", () => {
    const list = [achievement("a", 0.2, 0, 10), achievement("maxed", 1, 0, null), achievement("b", 0.75, 1, 5), achievement("c", 0.5, -1, 3)];
    expect(featuredAchievements(list).map((a) => a.id)).toEqual(["b", "c"]);
  });

  it("puts achievements with credits to claim first, even when maxed", () => {
    const list = [achievement("a", 0.2, 0, 10), achievement("maxed", 1, 0, null), achievement("b", 0.75, 1, 5)];
    expect(featuredAchievements(list, 2, new Set(["maxed", "a"])).map((x) => x.id)).toEqual(["maxed", "a"]);
  });
});

describe("monthYear", () => {
  it("formats in UTC and tolerates bad input", () => {
    expect(monthYear("2026-10-01T00:30:00.000Z")).toBe("Oct 2026");
    expect(monthYear("not a date")).toBe("");
  });
});
