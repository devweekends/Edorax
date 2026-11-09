import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../../src/app.js";
import { prisma } from "../../src/db/prisma.js";
import { createCourseFixture } from "../helpers/fixtures.js";
import { createSession } from "../../src/services/auth/session.js";
import { ensureBaselineRelease, type ReleaseContent } from "../../src/services/courses/releases.js";
import { createReleaseChapter } from "../../src/services/teach/publish-course-release.js";

const app = createApp();
let fx: Awaited<ReturnType<typeof createCourseFixture>>;
let paidCourseId = "";
let paidSlug = "";

beforeAll(async () => {
  fx = await createCourseFixture();
  const paid = await prisma.course.create({
    data: {
      slug: `paid-course-${fx.tag}`,
      title: "Paid course",
      status: "PUBLISHED",
      pricingType: "PAID",
      priceCents: 4900,
      currency: "USD",
      mentorId: fx.mentor.id,
      publishedAt: new Date(),
    },
  });
  paidCourseId = paid.id;
  paidSlug = paid.slug;
});
afterAll(async () => {
  const enrollments = await prisma.enrollment.findMany({ where: { courseId: paidCourseId }, select: { id: true } });
  await prisma.payment.deleteMany({ where: { enrollmentId: { in: enrollments.map((e) => e.id) } } });
  await prisma.enrollment.deleteMany({ where: { courseId: paidCourseId } });
  await prisma.course.delete({ where: { id: paidCourseId } });
  await fx.cleanup();
});

const auth = () => ({ Authorization: `Bearer ${fx.learnerToken}` });

describe("catalog", () => {
  it("lists published courses with the caller's enrollment state", async () => {
    const res = await request(app).get("/api/v1/catalog").set(auth());
    expect(res.status).toBe(200);
    const mine = res.body.data.courses.find((c: { slug: string }) => c.slug === fx.course.slug);
    expect(mine).toMatchObject({ instructorName: "Test Mentor", enrollmentLifecycle: "ACTIVE", pricingType: "FREE" });
    const paid = res.body.data.courses.find((c: { slug: string }) => c.slug === paidSlug);
    expect(paid).toMatchObject({ priceCents: 4900, enrollmentLifecycle: null });
    expect(mine).toMatchObject({ moduleCount: 1, chapterCount: 2 });
    // Courses without a chosen category are listed under Tech.
    expect(mine.category).toBe("TECH");
  });

  it("lists the catalog for anonymous visitors without enrollment state", async () => {
    const res = await request(app).get("/api/v1/catalog");
    expect(res.status).toBe(200);
    const mine = res.body.data.courses.find((c: { slug: string }) => c.slug === fx.course.slug);
    expect(mine).toMatchObject({ enrollmentLifecycle: null, chapterCount: 2 });
    const detail = await request(app).get(`/api/v1/catalog/${fx.course.slug}`);
    expect(detail.status).toBe(200);
    expect(detail.body.data).toMatchObject({ signedIn: false, access: "none", enrollmentLifecycle: null });
    expect(detail.body.data.modules[0].chapters.map((c: { title: string }) => c.title)).toEqual(["Chapter A", "Chapter B"]);
    expect(Object.keys(detail.body.data.modules[0].chapters[0]).sort()).toEqual(["estimatedMinutes", "id", "order", "title"]);
    expect((await request(app).post("/api/v1/enrollments").send({ courseId: fx.course.id })).status).toBe(401);
    expect((await request(app).get(`/api/v1/courses/${fx.course.slug}/chapters/chapter-a`)).status).toBe(401);
  });

  it("describes one course with curriculum and access", async () => {
    const res = await request(app).get(`/api/v1/catalog/${fx.course.slug}`).set(auth());
    expect(res.status).toBe(200);
    expect(res.body.data.access).toBe("active");
    expect(res.body.data.modules[0].chapters.map((c: { title: string }) => c.title)).toEqual(["Chapter A", "Chapter B"]);
    expect((await request(app).get("/api/v1/catalog/nope").set(auth())).status).toBe(404);
  });
});

describe("course overview", () => {
  it("returns the syllabus for an active enrollment", async () => {
    const res = await request(app).get(`/api/v1/courses/${fx.course.slug}/overview`).set(auth());
    expect(res.status).toBe(200);
    expect(res.body.data.access).toBe("active");
    expect(res.body.data.syllabus.chapterCount).toBe(2);
    expect(res.body.data.syllabus.continueHref).toBe(`/courses/${fx.course.slug}/chapter-a`);
    expect(res.body.data.syllabus.modules[0].chapters[1].locked).toBe(true);
  });

  it("reports no access without an enrollment", async () => {
    const res = await request(app).get(`/api/v1/courses/${paidSlug}/overview`).set(auth());
    expect(res.body.data).toMatchObject({ access: "none", enrollment: null, syllabus: null });
  });
});

describe("self-enrolment and checkout", () => {
  it("refuses a duplicate enrolment with a stable code", async () => {
    const res = await request(app).post("/api/v1/enrollments").set(auth()).send({ courseId: fx.course.id });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("ALREADY_ENROLLED");
  });

  it("keeps a paid enrollment locked and does not expose the payment stub", async () => {
    const before = await request(app).get(`/api/v1/courses/${paidSlug}/checkout`).set(auth());
    expect(before.body.data.state).toBe("no_enrollment");

    const enrol = await request(app).post("/api/v1/enrollments").set(auth()).send({ courseId: paidCourseId });
    expect(enrol.status).toBe(201);
    expect(enrol.body.data).toMatchObject({ courseSlug: paidSlug, lifecycle: "PAYMENT_REQUIRED", created: true });

    const again = await request(app).post("/api/v1/enrollments").set(auth()).send({ courseId: paidCourseId });
    expect(again.body.code).toBe("PAYMENT_PENDING");

    const pending = await request(app).get(`/api/v1/courses/${paidSlug}/checkout`).set(auth());
    expect(pending.body.data.state).toBe("payment_required");
    const overview = await request(app).get(`/api/v1/courses/${paidSlug}/overview`).set(auth());
    expect(overview.body.data.access).toBe("payment_required");

    const pay = await request(app).post(`/api/v1/enrollments/${enrol.body.data.enrollmentId}/payment-stub`).set(auth());
    expect(pay.status).toBe(404);
    const payment = await prisma.payment.findUnique({ where: { enrollmentId: enrol.body.data.enrollmentId } });
    expect(payment?.status).toBe("PENDING");
    const approve = await request(app).post(`/api/v1/admin/manual-access/${enrol.body.data.enrollmentId}/approve`).set(auth());
    expect(approve.status).toBe(403);

    const admin = await prisma.user.create({ data: { email: `manual-admin-${fx.tag}@test.local`, role: "ADMIN", emailVerified: new Date() } });
    try {
      const adminToken = (await createSession(admin.id)).sessionToken;
      const headers = { Authorization: `Bearer ${adminToken}` };
      const url = `/api/v1/admin/manual-access/${enrol.body.data.enrollmentId}/approve`;
      expect((await request(app).post(url).set(headers)).status).toBe(200);
      const after = await prisma.enrollment.findUniqueOrThrow({ where: { id: enrol.body.data.enrollmentId }, include: { payment: true } });
      expect(after.lifecycle).toBe("ACTIVE");
      expect(after.payment).toMatchObject({ status: "SUCCEEDED", provider: "manual" });
      expect(await prisma.adminAuditLog.count({ where: { actorId: admin.id, targetId: after.id, action: "manual-access.approve" } })).toBe(1);
      expect((await request(app).post(url).set(headers)).status).toBe(409);
    } finally {
      await prisma.adminAuditLog.deleteMany({ where: { actorId: admin.id } });
      await prisma.session.deleteMany({ where: { userId: admin.id } });
      await prisma.user.delete({ where: { id: admin.id } });
    }
  });

  it("does not expose the old payment stub", async () => {
    const res = await request(app).post(`/api/v1/enrollments/${fx.enrollment.id}/payment-stub`).set(auth());
    expect(res.status).toBe(404);
  });
});

describe("catalog after a course is republished", () => {
  let rx: Awaited<ReturnType<typeof createCourseFixture>>;

  beforeAll(async () => {
    rx = await createCourseFixture();
    await prisma.$transaction((tx) => ensureBaselineRelease(tx, rx.course.id));
    // Republish the way the publisher does: a changed lesson gets a new chapter row and the
    // old row stays live, because learners pinned to release 1 still read it.
    const moduleRow = await prisma.module.findFirstOrThrow({ where: { courseId: rx.course.id } });
    const replacement = await prisma.$transaction((tx) => createReleaseChapter(tx, rx.course.id, moduleRow.id, "chapter-a", {
      title: "Chapter A", summary: null, source: "# A, revised", blocks: [], lessonNum: 1, estimatedMinutes: null,
      readerMode: "DEFAULT", quizPassingScore: 70, isMilestone: false, key: null,
    } as never));
    const first = await prisma.courseRelease.findFirstOrThrow({ where: { courseId: rx.course.id }, orderBy: { number: "desc" } });
    const content = structuredClone(first.content as unknown as ReleaseContent);
    content.variants.default[0].chapters = content.variants.default[0].chapters.map((chapter) =>
      chapter.id === rx.chapterA.id ? { ...chapter, id: replacement.id } : chapter);
    const release = await prisma.courseRelease.create({ data: { courseId: rx.course.id, number: first.number + 1, content: content as unknown as object } });
    await prisma.course.update({ where: { id: rx.course.id }, data: { activeReleaseId: release.id } });
  });
  afterAll(async () => {
    await prisma.course.update({ where: { id: rx.course.id }, data: { activeReleaseId: null } });
    await prisma.courseRelease.deleteMany({ where: { courseId: rx.course.id } });
    await rx.cleanup();
  });

  it("keeps both chapter rows, since learners on release 1 still need the old one", async () => {
    expect(await prisma.chapter.count({ where: { courseId: rx.course.id, archivedAt: null } })).toBe(3);
  });

  it("counts and lists each chapter once, from the active release", async () => {
    const list = await request(app).get("/api/v1/catalog");
    const summary = list.body.data.courses.find((c: { slug: string }) => c.slug === rx.course.slug);
    expect(summary).toMatchObject({ moduleCount: 1, chapterCount: 2 });
    const detail = await request(app).get(`/api/v1/catalog/${rx.course.slug}`);
    expect(detail.body.data).toMatchObject({ moduleCount: 1, chapterCount: 2 });
    expect(detail.body.data.modules[0].chapters.map((c: { title: string }) => c.title)).toEqual(["Chapter A", "Chapter B"]);
    expect(detail.body.data.modules[0].chapters.map((c: { id: string }) => c.id)).not.toContain(rx.chapterA.id);
  });
});
