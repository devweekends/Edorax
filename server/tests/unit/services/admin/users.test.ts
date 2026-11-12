import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  user: { findUnique: vi.fn(), findMany: vi.fn(), count: vi.fn(), update: vi.fn() },
  course: { findUnique: vi.fn(), update: vi.fn() },
  enrollment: { findUnique: vi.fn(), delete: vi.fn(), update: vi.fn(), create: vi.fn() },
  payment: { create: vi.fn(), update: vi.fn() },
  couponUsage: { findUnique: vi.fn(), updateMany: vi.fn() },
  organizationCouponPool: { updateMany: vi.fn() },
  response: { findMany: vi.fn(), deleteMany: vi.fn() },
  blockStats: { updateMany: vi.fn() },
  courseRating: { deleteMany: vi.fn(), aggregate: vi.fn() },
  instructorAccessRequest: { findUnique: vi.fn(), findMany: vi.fn(), count: vi.fn(), update: vi.fn(), upsert: vi.fn() },
  adminAuditLog: { create: vi.fn() },
  $transaction: vi.fn(),
  $executeRaw: vi.fn(),
}));
vi.mock("../../../../src/db/prisma.js", () => ({ prisma: db }));
vi.mock("../../../../src/services/notifications/events.js", () => ({
  notifyUserGrantedAdminByAdmin: vi.fn(),
  notifyUserGrantedInstructorByAdmin: vi.fn(),
  notifyUserInstructorAccessDecision: vi.fn(),
}));

import {
  approveInstructorRequest,
  enrollUser,
  getUserDetail,
  listUsers,
  removeUserEnrollment,
  setInstructorAccess,
} from "../../../../src/services/admin/users.js";
import { CONFIRMED_ENROLLMENT_WHERE } from "../../../../src/services/enrollment/lifecycle.js";
import { canAccessTeachSurface } from "../../../../src/services/auth/access-rules.js";

const admin = { id: "admin", email: "admin@test.local" };

beforeEach(() => {
  vi.resetAllMocks();
  db.$transaction.mockImplementation(async (work) =>
    typeof work === "function" ? work(db) : Promise.all(work));
  db.response.findMany.mockResolvedValue([]);
  db.courseRating.deleteMany.mockResolvedValue({ count: 0 });
  db.couponUsage.findUnique.mockResolvedValue(null);
});

describe("mentor role changes", () => {
  it("promotes a mentee when an admin approves a pending request", async () => {
    db.instructorAccessRequest.findUnique.mockResolvedValue({
      id: "request", userId: "learner", status: "PENDING", user: { role: "MENTEE", email: "learner@test.local" },
    });
    await approveInstructorRequest(admin, "request");
    expect(db.user.update).toHaveBeenCalledWith({
      where: { id: "learner" }, data: { role: "MENTOR" },
    });
    expect(db.instructorAccessRequest.update).toHaveBeenCalledWith({
      where: { id: "request" },
      data: { status: "APPROVED", reviewedById: "admin", reviewedAt: expect.any(Date) },
    });
    expect(db.adminAuditLog.create).toHaveBeenCalledOnce();
  });

  it("revokes teaching access by returning a mentor to the mentee role", async () => {
    db.user.findUnique.mockResolvedValue({ role: "MENTOR", email: "mentor@test.local" });
    await setInstructorAccess(admin, "mentor", false);
    const update = db.user.update.mock.calls[0][0];
    expect(update.data).toEqual({ role: "MENTEE" });
    expect(canAccessTeachSurface(update.data)).toBe(false);
  });

  it("preserves an admin's role and access", async () => {
    db.user.findUnique.mockResolvedValue({ role: "ADMIN", email: "admin@test.local" });
    await setInstructorAccess(admin, "admin", false);
    expect(db.user.update).toHaveBeenCalledWith({
      where: { id: "admin" }, data: { role: "ADMIN" },
    });
  });

  it("does not promote a user from a rejected request", async () => {
    db.instructorAccessRequest.findUnique.mockResolvedValue({
      id: "request", userId: "learner", status: "REJECTED", user: { role: "MENTEE", email: "learner@test.local" },
    });
    await expect(approveInstructorRequest(admin, "request")).rejects.toThrow();
    expect(db.user.update).not.toHaveBeenCalled();
  });
});

describe("removeUserEnrollment", () => {
  it("removes an enrollment, cleans up responses, and writes an audit log", async () => {
    db.enrollment.findUnique.mockResolvedValue({
      id: "enr-1",
      userId: "user-1",
      courseId: "course-1",
      organizationId: null,
      course: { title: "Building Fullstack Apps" },
      user: { id: "user-1", email: "learner@test.local" },
    });

    await removeUserEnrollment(admin, "enr-1", "user-1");

    expect(db.response.deleteMany).toHaveBeenCalledWith({ where: { enrollmentId: "enr-1" } });
    expect(db.enrollment.delete).toHaveBeenCalledWith({ where: { id: "enr-1" } });
    expect(db.adminAuditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "user.remove-enrollment",
          targetType: "Enrollment",
          targetId: "enr-1",
        }),
      })
    );
  });

  it("releases organization enrollment slot when enrolled through a Pathment integration", async () => {
    db.enrollment.findUnique.mockResolvedValue({
      id: "enr-2",
      userId: "user-2",
      courseId: "course-1",
      organizationId: "org-1",
      source: "PATHMENT",
      lifecycle: "ACTIVE",
      status: "IN_PROGRESS",
      course: { title: "Building Fullstack Apps" },
      user: { id: "user-2", email: "employee@org.local" },
    });

    await removeUserEnrollment(admin, "enr-2");

    expect(db.$executeRaw).toHaveBeenCalled();
    expect(db.enrollment.delete).toHaveBeenCalledWith({ where: { id: "enr-2" } });
  });

  it("does not decrement organization slots for already-cancelled or direct enrollments", async () => {
    db.enrollment.findUnique.mockResolvedValue({
      id: "enr-3",
      userId: "user-3",
      courseId: "course-1",
      organizationId: "org-1",
      source: "PATHMENT",
      lifecycle: "CANCELLED",
      status: "DROPPED",
      course: { title: "Building Fullstack Apps" },
      user: { id: "user-3", email: "employee@org.local" },
    });

    await removeUserEnrollment(admin, "enr-3");

    expect(db.$executeRaw).not.toHaveBeenCalled();
    expect(db.enrollment.delete).toHaveBeenCalledWith({ where: { id: "enr-3" } });
  });

  it("throws NotFoundError if enrollment does not exist", async () => {
    db.enrollment.findUnique.mockResolvedValue(null);
    await expect(removeUserEnrollment(admin, "missing-enr")).rejects.toThrow("Enrollment not found");
  });

  it("throws ConflictError if userId does not match the enrollment", async () => {
    db.enrollment.findUnique.mockResolvedValue({
      id: "enr-1",
      userId: "user-1",
      courseId: "course-1",
      organizationId: null,
      course: { title: "Course" },
      user: { id: "user-1", email: "a@b.com" },
    });
    await expect(removeUserEnrollment(admin, "enr-1", "other-user")).rejects.toThrow(
      "Enrollment does not belong to the specified user."
    );
  });
});

describe("enrollUser", () => {
  it("creates an active enrollment and writes audit log", async () => {
    db.user.findUnique.mockResolvedValue({ id: "user-1", email: "learner@test.local" });
    db.course.findUnique.mockResolvedValue({ id: "course-1", title: "Course 1", status: "PUBLISHED", pricingType: "PAID", priceCents: 1950, currency: "USD" });
    db.enrollment.findUnique.mockResolvedValue(null);
    db.enrollment.create.mockResolvedValue({ id: "new-enr" });

    const result = await enrollUser(admin, "user-1", "course-1");

    expect(result).toEqual({ id: "new-enr" });
    expect(db.enrollment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: "user-1",
        courseId: "course-1",
        lifecycle: "ACTIVE",
        status: "IN_PROGRESS",
      }),
    });
    expect(db.payment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ enrollmentId: "new-enr", currency: "USD", originalAmountCents: 1950, status: "SUCCEEDED", provider: "admin", amountCents: 0 }),
    });
    expect(db.adminAuditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "user.enroll",
          targetType: "Enrollment",
          targetId: "new-enr",
        }),
      })
    );
  });

  it("reactivates an existing non-active enrollment and settles any pending/failed payment", async () => {
    db.user.findUnique.mockResolvedValue({ id: "user-1", email: "learner@test.local" });
    db.course.findUnique.mockResolvedValue({ id: "course-1", title: "Course 1", status: "PUBLISHED" });
    db.enrollment.findUnique.mockResolvedValue({
      id: "existing-enr",
      lifecycle: "PAYMENT_REQUIRED",
      startedAt: null,
      payment: { id: "pay-1", status: "PENDING" },
    });
    db.enrollment.update.mockResolvedValue({ id: "existing-enr" });

    const result = await enrollUser(admin, "user-1", "course-1");

    expect(result).toEqual({ id: "existing-enr" });
    expect(db.enrollment.update).toHaveBeenCalledWith({
      where: { id: "existing-enr" },
      data: expect.objectContaining({ lifecycle: "ACTIVE", status: "IN_PROGRESS" }),
    });
    expect(db.payment.update).toHaveBeenCalledWith({
      where: { enrollmentId: "existing-enr" },
      data: expect.objectContaining({ status: "SUCCEEDED", provider: "admin", amountCents: 0 }),
    });
  });

  it("rejects if user is already actively or completed enrolled", async () => {
    db.user.findUnique.mockResolvedValue({ id: "user-1", email: "learner@test.local" });
    db.course.findUnique.mockResolvedValue({ id: "course-1", title: "Course 1", status: "PUBLISHED" });
    db.enrollment.findUnique.mockResolvedValue({ id: "existing-enr", lifecycle: "ACTIVE", payment: null });

    await expect(enrollUser(admin, "user-1", "course-1")).rejects.toThrow("already enrolled");

    db.enrollment.findUnique.mockResolvedValue({ id: "done-enr", lifecycle: "COMPLETED", payment: null });
    await expect(enrollUser(admin, "user-1", "course-1")).rejects.toThrow("already enrolled");
  });

  it("rejects enrolling into unpublished courses", async () => {
    db.user.findUnique.mockResolvedValue({ id: "user-1", email: "learner@test.local" });
    db.course.findUnique.mockResolvedValue({ id: "course-1", title: "Draft Course", status: "DRAFT" });

    await expect(enrollUser(admin, "user-1", "course-1")).rejects.toThrow("Only published courses can be enrolled.");
  });
});

describe("confirmed-enrollment filtering in user list and detail", () => {
  it("filters user list counts and enrolled filter to confirmed positive enrollments only", async () => {
    db.user.count.mockResolvedValue(1);
    db.instructorAccessRequest.count.mockResolvedValue(0);
    db.instructorAccessRequest.findMany.mockResolvedValue([]);
    db.user.findMany.mockResolvedValue([
      {
        id: "user-1",
        email: "learner@test.local",
        name: "Learner",
        role: "MENTEE",
        emailVerified: new Date(),
        zipImportEnabled: false,
        testerEnabled: false,
        suspendedAt: null,
        createdAt: new Date("2026-11-01T00:00:00Z"),
        _count: { enrollments: 1, coursesOwned: 0 },
      },
    ]);

    await listUsers({ enrolled: "true" });

    expect(db.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          enrollments: { some: CONFIRMED_ENROLLMENT_WHERE },
        }),
        select: expect.objectContaining({
          _count: {
            select: {
              enrollments: { where: CONFIRMED_ENROLLMENT_WHERE },
              coursesOwned: true,
            },
          },
        }),
      })
    );
  });

  it("queries only confirmed positive enrollments in getUserDetail", async () => {
    db.user.findUnique.mockResolvedValue({
      id: "user-1",
      email: "learner@test.local",
      name: "Learner",
      role: "MENTEE",
      emailVerified: new Date(),
      zipImportEnabled: false,
      testerEnabled: false,
      suspendedAt: null,
      suspensionNote: null,
      totpEnabledAt: null,
      createdAt: new Date("2026-11-01T00:00:00Z"),
      _count: { enrollments: 0, coursesOwned: 0, sessions: 1 },
      enrollments: [],
      coursesOwned: [],
    });

    const detail = await getUserDetail("user-1");
    expect(detail.enrollments).toEqual([]);
    expect(detail.user.enrollmentCount).toBe(0);
    expect(db.user.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({
          _count: {
            select: {
              enrollments: { where: CONFIRMED_ENROLLMENT_WHERE },
              coursesOwned: true,
              sessions: true,
            },
          },
          enrollments: expect.objectContaining({
            where: CONFIRMED_ENROLLMENT_WHERE,
          }),
        }),
      })
    );
  });
});
