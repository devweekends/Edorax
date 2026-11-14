import { describe, expect, it, vi } from "vitest";
import { ensureOwnCourseEnrollment, isCourseInstructor } from "../../../../src/services/enrollment/own-course.js";

function fakeDb(existing: Record<string, unknown> | null) {
  return {
    enrollment: {
      findUnique: vi.fn().mockResolvedValue(existing),
      update: vi.fn().mockImplementation(({ data }) => Promise.resolve({ ...existing, ...data })),
      upsert: vi.fn().mockImplementation(({ create }) => Promise.resolve({ id: "new", ...create })),
    },
    payment: { create: vi.fn() },
  };
}

describe("isCourseInstructor", () => {
  it("matches only the course's own instructor", () => {
    expect(isCourseInstructor("m1", { mentorId: "m1" })).toBe(true);
    expect(isCourseInstructor("m2", { mentorId: "m1" })).toBe(false);
    expect(isCourseInstructor(undefined, { mentorId: "m1" })).toBe(false);
  });
});

describe("ensureOwnCourseEnrollment", () => {
  it("creates an active enrollment with no payment row", async () => {
    const db = fakeDb(null);
    const row = await ensureOwnCourseEnrollment(db as never, { courseId: "c1", userId: "m1" });
    expect(row).toMatchObject({ lifecycle: "ACTIVE", status: "IN_PROGRESS", source: "DIRECT" });
    expect(db.enrollment.upsert.mock.calls[0][0].create).not.toHaveProperty("payment");
    expect(db.payment.create).not.toHaveBeenCalled();
  });

  it("opens an enrollment left awaiting payment", async () => {
    const db = fakeDb({ id: "e1", lifecycle: "PAYMENT_REQUIRED", status: "ASSIGNED", startedAt: null });
    const row = await ensureOwnCourseEnrollment(db as never, { courseId: "c1", userId: "m1" });
    expect(row).toMatchObject({ id: "e1", lifecycle: "ACTIVE", status: "IN_PROGRESS" });
    expect(db.enrollment.upsert).not.toHaveBeenCalled();
  });

  it("leaves an active enrollment alone", async () => {
    const existing = { id: "e1", lifecycle: "COMPLETED", status: "COMPLETED" };
    const db = fakeDb(existing);
    expect(await ensureOwnCourseEnrollment(db as never, { courseId: "c1", userId: "m1" })).toBe(existing);
    expect(db.enrollment.update).not.toHaveBeenCalled();
  });
});
