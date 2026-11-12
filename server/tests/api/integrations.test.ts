import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../../src/app.js";
import { createCourseFixture, createOrganizationFixture, completeChapter } from "../helpers/fixtures.js";
import { prisma } from "../../src/db/prisma.js";
import { recomputeEnrollmentRollup } from "../../src/services/progress/compute.js";

const app = createApp();
let fx: Awaited<ReturnType<typeof createCourseFixture>>;
let org: Awaited<ReturnType<typeof createOrganizationFixture>>;

beforeAll(async () => {
  fx = await createCourseFixture();
  org = await createOrganizationFixture(fx.course.id, { maxEnrollments: 1 });
});
afterAll(async () => {
  await org.cleanup();
  await fx.cleanup();
});

describe("/integrations/v1 (public organisation API)", () => {
  it("describes itself without credentials", async () => {
    const res = await request(app).get("/integrations/v1");
    expect(res.body.name).toBe("Buildment Organization API");
    expect(res.body.endpoints).toHaveLength(10);
  });

  it("keeps the { error } shape for authentication failures", async () => {
    const missing = await request(app).get("/integrations/v1/connection");
    expect(missing.status).toBe(401);
    expect(missing.body.error).toBe("Missing integration credentials");

    const wrong = await request(app).get("/integrations/v1/connection").set({ ...org.headers, "x-buildment-secret-key": "bad" });
    expect(wrong.status).toBe(401);
    expect(wrong.body.error).toBe("Invalid integration credentials");
  });

  it("verifies the connection and lists allocated courses", async () => {
    const connection = await request(app).get("/integrations/v1/connection").set(org.headers);
    expect(connection.body).toEqual({ connected: true, organization_slug: org.organization.slug, organization_name: org.organization.name });

    const courses = await request(app).get("/integrations/v1/courses").set(org.headers);
    expect(courses.body.courses).toEqual([
      expect.objectContaining({ course_id: fx.course.id, course_slug: fx.course.slug, available_enrollment_count: 1 }),
    ]);

    const allocations = await request(app).get("/integrations/v1/allocations").set(org.headers);
    expect(allocations.body.allocations[0]).toMatchObject({ course_id: fx.course.id, max_enrollments: 1, current_enrollments: 0 });
  });

  // A catalog that looks complete but is switched off reads as "no courses" to
  // the consumer, which is indistinguishable from "nothing allocated". The
  // allocations endpoint is what tells the two apart.
  it("hides a course from the catalog while it is not allowed, but still reports the allocation", async () => {
    const key = { organizationId_courseId: { organizationId: org.organization.id, courseId: fx.course.id } };
    await prisma.organizationCourse.update({ where: key, data: { isAllowed: false } });
    try {
      const courses = await request(app).get("/integrations/v1/courses").set(org.headers);
      expect(courses.status).toBe(200);
      expect(courses.body.courses).toEqual([]);

      const allocations = await request(app).get("/integrations/v1/allocations").set(org.headers);
      expect(allocations.body.allocations).toHaveLength(1);
      expect(allocations.body.allocations[0]).toMatchObject({
        course_id: fx.course.id,
        is_allowed: false,
        course_status: "PUBLISHED",
      });
    } finally {
      await prisma.organizationCourse.update({ where: key, data: { isAllowed: true } });
    }

    const restored = await request(app).get("/integrations/v1/courses").set(org.headers);
    expect(restored.body.courses).toHaveLength(1);
  });

  it("creates an enrollment once, consumes the slot, then reports it", async () => {
    const payload = { student_email: `new-${fx.tag}@test.local`, course_id: fx.course.id, external_assignment_id: `assign-${fx.tag}` };

    const created = await request(app).post("/integrations/v1/enrollments").set(org.headers).send(payload);
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ created: true, lifecycle: "PENDING_ACCOUNT", external_assignment_id: payload.external_assignment_id });

    const again = await request(app).post("/integrations/v1/enrollments").set(org.headers).send(payload);
    expect(again.status).toBe(200);
    expect(again.body.created).toBe(false);

    const full = await request(app).post("/integrations/v1/enrollments").set(org.headers).send({ ...payload, student_email: `other-${fx.tag}@test.local`, external_assignment_id: `assign2-${fx.tag}` });
    expect(full.status).toBe(403);
    expect(full.body).toEqual({ error: "Organization enrollment limit reached", code: "CAPACITY" });

    const lookup = await request(app).get("/integrations/v1/enrollments").set(org.headers).query({ external_assignment_id: payload.external_assignment_id });
    expect(lookup.body.enrollment).toMatchObject({ enrollment_id: created.body.enrollment_id, learner_email: payload.student_email });

    const progress = await request(app).get("/integrations/v1/progress").set(org.headers).query({ course_id: fx.course.id, learner_email: payload.student_email });
    expect(progress.body).toMatchObject({
      status: "NOT_STARTED",
      total_lessons: 2,
      completed_lessons: 0,
      total_modules: 1,
      modules: [{
        title: "Module 1",
        status: "NOT_STARTED",
        completed_chapters: 0,
        total_chapters: 2,
        chapters: [
          { id: fx.chapterA.id, title: "Chapter A", status: "NOT_STARTED", completed: false, progress_percent: 0 },
          { id: fx.chapterB.id, title: "Chapter B", status: "NOT_STARTED", completed: false, progress_percent: 0 },
        ],
      }],
    });

    await completeChapter(created.body.enrollment_id, fx.chapterA.id);
    await prisma.$transaction((tx) => recomputeEnrollmentRollup(tx, created.body.enrollment_id));
    const updatedProgress = await request(app).get("/integrations/v1/progress").set(org.headers).query({ course_id: fx.course.id, learner_email: payload.student_email });
    expect(updatedProgress.body).toMatchObject({
      status: "IN_PROGRESS",
      overall_progress: 50,
      completed_chapters: 1,
      total_chapters: 2,
      modules: [{
        status: "IN_PROGRESS",
        progress_percent: 50,
        completed_chapters: 1,
        chapters: [
          { id: fx.chapterA.id, status: "COMPLETED", completed: true, progress_percent: 100 },
          { id: fx.chapterB.id, status: "NOT_STARTED", completed: false, progress_percent: 0 },
        ],
      }],
    });

    const cancelled = await request(app)
      .post("/integrations/v1/enrollments/cancel")
      .set(org.headers)
      .send({ org_slug: org.organization.slug, email: payload.student_email, course_id: fx.course.id });
    expect(cancelled.body).toMatchObject({ cancelled: true, already_cancelled: false });
    expect(cancelled.body.enrollment.lifecycle).toBe("CANCELLED");

    const allocations = await request(app).get("/integrations/v1/allocations").set(org.headers);
    expect(allocations.body.allocations[0].current_enrollments).toBe(0);
  });

  it("validates lookup parameters and bodies with the legacy messages", async () => {
    const lookup = await request(app).get("/integrations/v1/enrollments").set(org.headers).query({ course_id: fx.course.id });
    expect(lookup.status).toBe(400);
    expect(lookup.body.error).toMatch(/external_assignment_id or both course_id and learner_email/);

    const body = await request(app).post("/integrations/v1/enrollments").set(org.headers).send({ course_id: fx.course.id });
    expect(body.status).toBe(400);
  });

  it("records course requests and reports an existing allocation as a conflict", async () => {
    const conflict = await request(app).post("/integrations/v1/course-requests").set(org.headers).send({ course_id: fx.course.id });
    expect(conflict.status).toBe(409);
    expect(conflict.body.code).toBe("ALREADY_ALLOCATED");

    const list = await request(app).get("/integrations/v1/course-requests").set(org.headers).query({ status: "PENDING" });
    expect(list.body.requests).toEqual([]);
  });

  it("rejects enrollment when the organization does not have enough credits", async () => {
    const paid = await createCourseFixture();
    const fundedOrg = await createOrganizationFixture(paid.course.id, { maxEnrollments: 5 });
    const sponsoredLearner = await prisma.user.create({
      data: {
        email: `sponsored-${paid.tag}@test.local`,
        name: "Sponsored Learner",
        role: "MENTEE",
        emailVerified: new Date(),
      },
    });
    await prisma.course.update({
      where: { id: paid.course.id },
      data: { pricingType: "PAID", priceCents: 5_000 },
    });
    await prisma.organization.update({
      where: { id: fundedOrg.organization.id },
      data: { creditBalance: 125 },
    });
    await prisma.organizationCouponPool.create({
      data: {
        organizationId: fundedOrg.organization.id,
        courseId: paid.course.id,
        label: "Full seat",
        percentOff: 100,
        maxRedemptions: 10,
      },
    });

    try {
      const res = await request(app)
        .post("/integrations/v1/enrollments")
        .set(fundedOrg.headers)
        .send({
          student_email: sponsoredLearner.email,
          course_id: paid.course.id,
          external_assignment_id: `credits-${paid.tag}`,
        });

      expect(res.status).toBe(402);
      expect(res.body).toEqual({
        error:
          "Organization credit balance is too low to fund this enrollment. Required 5,000 credits ($50.00); available 125 credits ($1.25). Add credits for the organization, then retry.",
        code: "INSUFFICIENT_CREDITS",
      });
    } finally {
      await fundedOrg.cleanup();
      await prisma.user.delete({ where: { id: sponsoredLearner.id } }).catch(() => undefined);
      await paid.cleanup();
    }
  });
});
