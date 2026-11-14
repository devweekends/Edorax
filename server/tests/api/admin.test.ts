import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../../src/app.js";
import { prisma } from "../../src/db/prisma.js";
import { createSession } from "../../src/services/auth/session.js";
import { hashPassword } from "../../src/services/auth/password.js";
import { generateTotpSecret, totpCodeFor } from "../../src/services/auth/totp.js";
import { createCourseFixture, createOrganizationFixture } from "../helpers/fixtures.js";

// Platform administration: tenants and credentials, allocations, course
// requests, accounts and instructor access.

const app = createApp();
let fx: Awaited<ReturnType<typeof createCourseFixture>>;
let org: Awaited<ReturnType<typeof createOrganizationFixture>>;
let adminToken = "";
let adminId = "";
let createdOrgId = "";
let duplicateOrgId = "";
const createdUserIds: string[] = [];

beforeAll(async () => {
  fx = await createCourseFixture();
  org = await createOrganizationFixture(fx.course.id);
  const admin = await prisma.user.create({
    data: { email: `admin-${fx.tag}@test.local`, name: "Test Admin", role: "ADMIN", emailVerified: new Date() },
  });
  adminId = admin.id;
  adminToken = (await createSession(admin.id)).sessionToken;
});

afterAll(async () => {
  for (const id of [createdOrgId, duplicateOrgId]) {
    if (id) await prisma.organization.delete({ where: { id } }).catch(() => undefined);
  }
  await prisma.instructorAccessRequest.deleteMany({ where: { userId: { in: [...createdUserIds, fx.learner.id] } } });
  // Audit rows have no FK (the actor is a snapshot), so remove them explicitly.
  await prisma.adminAuditLog.deleteMany({ where: { actorId: adminId } });
  await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  await org.cleanup();
  await prisma.session.deleteMany({ where: { userId: adminId } });
  await prisma.user.delete({ where: { id: adminId } });
  await fx.cleanup();
});

const admin = () => ({ Authorization: `Bearer ${adminToken}` });
const mentor = async () => ({ Authorization: `Bearer ${(await createSession(fx.mentor.id)).sessionToken}` });

describe("/api/v1/admin access", () => {
  it("is limited to administrators", async () => {
    expect((await request(app).get("/api/v1/admin/overview")).status).toBe(401);
    const res = await request(app).get("/api/v1/admin/overview").set(await mentor());
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("ADMIN_REQUIRED");
  });

  it("serves the overview counts and the course catalog", async () => {
    const overview = await request(app).get("/api/v1/admin/overview").set(admin());
    expect(overview.status).toBe(200);
    expect(overview.body.data.organizations).toBeGreaterThanOrEqual(1);
    expect(overview.body.data.publishedCourses).toBeGreaterThanOrEqual(1);

    const courses = await request(app).get("/api/v1/admin/courses").set(admin());
    const row = courses.body.data.courses.find((c: { id: string }) => c.id === fx.course.id);
    expect(row).toMatchObject({ slug: fx.course.slug, status: "PUBLISHED", instructorLabel: "Test Mentor", enrollmentCount: 1, allocationCount: 1 });
  });
});

describe("organizations", () => {
  it("creates a tenant with a one-time credential and a unique slug", async () => {
    const res = await request(app).post("/api/v1/admin/organizations").set(admin()).send({ name: `Org ${fx.tag}` });
    expect(res.status).toBe(201);
    createdOrgId = res.body.data.organization.id;
    expect(res.body.data.organization.slug).toBe(`org-${fx.tag}`);
    expect(res.body.data.credential.accessKey).toMatch(/^org_live_/);
    expect(res.body.data.credential.secret.length).toBeGreaterThan(20);

    // A requested slug that is already taken gets a numeric suffix.
    const duplicate = await request(app).post("/api/v1/admin/organizations").set(admin()).send({ name: "Duplicate", slug: org.organization.slug });
    expect(duplicate.status).toBe(201);
    duplicateOrgId = duplicate.body.data.organization.id;
    expect(duplicate.body.data.organization.slug).toBe(`${org.organization.slug}-2`);

    const list = await request(app).get("/api/v1/admin/organizations").set(admin());
    const row = list.body.data.organizations.find((o: { id: string }) => o.id === createdOrgId);
    expect(row).toMatchObject({ accessKey: res.body.data.credential.accessKey, allocationCount: 0, enrollmentCount: 0 });

    expect((await request(app).post("/api/v1/admin/organizations").set(admin()).send({ name: "x" })).status).toBe(400);
  });

  it("rotates credentials, deactivating the previous pair", async () => {
    const res = await request(app).post(`/api/v1/admin/organizations/${createdOrgId}/credentials/rotate`).set(admin());
    expect(res.status).toBe(201);
    const detail = await request(app).get(`/api/v1/admin/organizations/${createdOrgId}`).set(admin());
    expect(detail.status).toBe(200);
    expect(detail.body.data.credentials).toHaveLength(2);
    expect(detail.body.data.credentials.map((c: { active: boolean }) => c.active)).toEqual([true, false]);
    expect(detail.body.data.credentials[0].accessKey).toBe(res.body.data.accessKey);
    expect((await request(app).get("/api/v1/admin/organizations/nope").set(admin())).status).toBe(404);
  });

  it("allocates published courses and refuses unpublished ones", async () => {
    const ok = await request(app)
      .put(`/api/v1/admin/organizations/${createdOrgId}/allocations`)
      .set(admin())
      .send({ courses: [{ courseId: fx.course.id, maxEnrollments: 25, expiresAt: "2030-01-31" }] });
    expect(ok.status).toBe(204);

    const detail = await request(app).get(`/api/v1/admin/organizations/${createdOrgId}`).set(admin());
    expect(detail.body.data.allocations).toHaveLength(1);
    expect(detail.body.data.allocations[0]).toMatchObject({ course: { id: fx.course.id }, maxEnrollments: 25, isAllowed: true, currentEnrollments: 0 });
    expect(detail.body.data.allocations[0].expiresAt).toMatch(/^2030-01-31/);
    expect(detail.body.data.publishedCourses.map((c: { id: string }) => c.id)).toContain(fx.course.id);

    const bad = await request(app)
      .put(`/api/v1/admin/organizations/${createdOrgId}/allocations`)
      .set(admin())
      .send({ isAllowed: true, courses: [{ courseId: "nope", maxEnrollments: 1 }] });
    expect(bad.status).toBe(422);
    expect(bad.body.code).toBe("COURSE_NOT_PUBLISHED");
  });

  it("turns integration enrollments off and back on for a single allocation", async () => {
    await request(app)
      .put(`/api/v1/admin/organizations/${createdOrgId}/allocations`)
      .set(admin())
      .send({ isAllowed: true, courses: [{ courseId: fx.course.id, maxEnrollments: 25 }] });

    const url = `/api/v1/admin/organizations/${createdOrgId}/allocations/${fx.course.id}/allowed`;
    const key = { organizationId_courseId: { organizationId: createdOrgId, courseId: fx.course.id } };

    const off = await request(app).patch(url).set(admin()).send({ enabled: false });
    expect(off.status).toBe(204);
    expect(await prisma.organizationCourse.findUnique({ where: key })).toMatchObject({ isAllowed: false, maxEnrollments: 25 });

    // Editing the catalog without specifying assignability must preserve an explicit opt-out.
    const edit = await request(app)
      .put(`/api/v1/admin/organizations/${createdOrgId}/allocations`)
      .set(admin())
      .send({ courses: [{ courseId: fx.course.id, maxEnrollments: 30 }] });
    expect(edit.status).toBe(204);
    expect(await prisma.organizationCourse.findUnique({ where: key })).toMatchObject({ isAllowed: false, maxEnrollments: 30 });

    const on = await request(app).patch(url).set(admin()).send({ enabled: true });
    expect(on.status).toBe(204);
    expect(await prisma.organizationCourse.findUnique({ where: key })).toMatchObject({ isAllowed: true, maxEnrollments: 30 });

    // An allocation that does not exist is a 404, not a silent no-op.
    const missing = await request(app)
      .patch(`/api/v1/admin/organizations/${createdOrgId}/allocations/${org.organization.id}/allowed`)
      .set(admin())
      .send({ enabled: true });
    expect(missing.status).toBe(404);
  });
});

describe("course requests", () => {
  let requestId = "";

  it("approves a pending request and creates the allocation", async () => {
    const second = await prisma.course.create({
      data: { slug: `second-${fx.tag}`, title: "Second course", status: "PUBLISHED", mentorId: fx.mentor.id, publishedAt: new Date() },
    });
    try {
      const created = await prisma.organizationCourseRequest.create({ data: { organizationId: org.organization.id, courseId: second.id } });
      requestId = created.id;

      const list = await request(app).get("/api/v1/admin/course-requests").query({ pageSize: 100 }).set(admin());
      expect(list.body.data.pending.find((r: { id: string }) => r.id === requestId)).toMatchObject({
        organization: { id: org.organization.id },
        course: { title: "Second course", status: "PUBLISHED" },
      });

      const approve = await request(app).post(`/api/v1/admin/course-requests/${requestId}/approve`).set(admin()).send({ maxEnrollments: 10, expiresAt: "" });
      expect(approve.status).toBe(204);
      const allocation = await prisma.organizationCourse.findUnique({ where: { organizationId_courseId: { organizationId: org.organization.id, courseId: second.id } } });
      expect(allocation).toMatchObject({ maxEnrollments: 10, isAllowed: true, expiresAt: null });

      const again = await request(app).post(`/api/v1/admin/course-requests/${requestId}/reject`).set(admin());
      expect(again.status).toBe(409);
      expect(again.body.code).toBe("REQUEST_ALREADY_REVIEWED");

      const after = await request(app).get("/api/v1/admin/course-requests").set(admin());
      expect(after.body.data.recent.find((r: { id: string }) => r.id === requestId)).toMatchObject({ status: "APPROVED", reviewerEmail: `admin-${fx.tag}@test.local` });
    } finally {
      await prisma.organizationCourseRequest.deleteMany({ where: { courseId: second.id } });
      await prisma.organizationCourse.deleteMany({ where: { courseId: second.id } });
      await prisma.course.delete({ where: { id: second.id } });
    }
  });
});

describe("users and instructor access", () => {
  it("lists accounts and toggles instructor capability", async () => {
    const list = await request(app).get("/api/v1/admin/users").query({ query: fx.learner.email }).set(admin());
    expect(list.status).toBe(200);
    const learner = list.body.data.users.find((u: { id: string }) => u.id === fx.learner.id);
    expect(learner).toMatchObject({ role: "MENTEE", emailVerified: true, enrollmentCount: 1 });

    const grant = await request(app).patch(`/api/v1/admin/users/${fx.learner.id}/instructor-access`).set(admin()).send({ enabled: true });
    expect(grant.status).toBe(204);
    expect(await prisma.user.findUniqueOrThrow({ where: { id: fx.learner.id } })).toMatchObject({ role: "MENTOR" });

    const revoke = await request(app).patch(`/api/v1/admin/users/${fx.learner.id}/instructor-access`).set(admin()).send({ enabled: false });
    expect(revoke.status).toBe(204);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: fx.learner.id } })).role).toBe("MENTEE");
    expect((await request(app).patch("/api/v1/admin/users/nope/instructor-access").set(admin()).send({ enabled: true })).status).toBe(404);
  });

  it("grants instructor access by email, creating the account when needed", async () => {
    const email = `new-instructor-${fx.tag}@test.local`;
    const res = await request(app).post("/api/v1/admin/instructors").set(admin()).send({ email: email.toUpperCase(), name: "New Instructor" });
    expect(res.status).toBe(204);
    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    createdUserIds.push(user.id);
    expect(user).toMatchObject({ role: "MENTOR", name: "New Instructor" });
    expect(user.emailVerified).not.toBeNull();
  });

  it("adds another platform admin by email", async () => {
    const email = `new-admin-${fx.tag}@test.local`;
    const res = await request(app).post("/api/v1/admin/admins").set(admin()).send({ email: email.toUpperCase(), name: "New Admin" });
    expect(res.status).toBe(204);
    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    createdUserIds.push(user.id);
    expect(user).toMatchObject({ role: "ADMIN", name: "New Admin" });
    expect(user.emailVerified).not.toBeNull();

    const forbidden = await request(app).post("/api/v1/admin/admins").set(await mentor()).send({ email: "mentor-created@test.local" });
    expect(forbidden.status).toBe(403);
    expect(forbidden.body.code).toBe("ADMIN_REQUIRED");
  });

  it("approves and rejects instructor access requests once", async () => {
    // The toggle test left an approved request behind; start from a clean learner.
    await prisma.instructorAccessRequest.deleteMany({ where: { userId: fx.learner.id } });
    await prisma.user.update({ where: { id: fx.learner.id }, data: { role: "MENTEE" } });
    const asked = await request(app).post("/api/v1/learner/instructor-access-requests").set("Authorization", `Bearer ${fx.learnerToken}`).send({ message: "I teach Go." });
    expect([200, 201]).toContain(asked.status);
    const pending = await prisma.instructorAccessRequest.findUniqueOrThrow({ where: { userId: fx.learner.id } });

    const list = await request(app).get("/api/v1/admin/users").set(admin());
    expect(list.body.data.pendingInstructorRequests.find((r: { id: string }) => r.id === pending.id)).toMatchObject({ message: "I teach Go.", user: { id: fx.learner.id } });

    const approve = await request(app).post(`/api/v1/admin/instructor-access-requests/${pending.id}/approve`).set(admin());
    expect(approve.status).toBe(204);
    expect(await prisma.instructorAccessRequest.findUniqueOrThrow({ where: { id: pending.id } })).toMatchObject({ status: "APPROVED", reviewedById: adminId });
    expect((await prisma.user.findUniqueOrThrow({ where: { id: fx.learner.id } })).role).toBe("MENTOR");

    const reject = await request(app).post(`/api/v1/admin/instructor-access-requests/${pending.id}/reject`).set(admin());
    expect(reject.status).toBe(409);
  });
});

describe("audit trail and admin lifecycle", () => {
  it("records admin actions in the append-only audit log", async () => {
    const res = await request(app).get("/api/v1/admin/audit").set(admin());
    expect(res.status).toBe(200);
    const actions = res.body.data.entries.map((e: { action: string }) => e.action);
    expect(actions).toEqual(
      expect.arrayContaining([
        "organization.create",
        "organization.rotate-credential",
        "organization.allocate",
        "user.set-instructor-access",
        "user.grant-instructor",
        "user.grant-admin",
      ])
    );
    expect(res.body.data.entries[0]).toMatchObject({ actorEmail: `admin-${fx.tag}@test.local` });
  });

  it("revokes platform admin, guarding self-action and non-admin targets", async () => {
    const otherAdmin = await prisma.user.create({
      data: { email: `other-admin-${fx.tag}@test.local`, role: "ADMIN", emailVerified: new Date() },
    });
    createdUserIds.push(otherAdmin.id);

    const self = await request(app).post(`/api/v1/admin/users/${adminId}/revoke-admin`).set(admin());
    expect(self.status).toBe(403);
    expect(self.body.code).toBe("SELF_ACTION");

    // fx.learner is a mentor/mentee at this point, never an admin.
    const notAdmin = await request(app).post(`/api/v1/admin/users/${fx.learner.id}/revoke-admin`).set(admin());
    expect(notAdmin.status).toBe(409);
    expect(notAdmin.body.code).toBe("NOT_ADMIN");

    const ok = await request(app).post(`/api/v1/admin/users/${otherAdmin.id}/revoke-admin`).set(admin());
    expect(ok.status).toBe(204);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: otherAdmin.id } })).role).toBe("MENTEE");

    const entry = await prisma.adminAuditLog.findFirst({
      where: { action: "user.revoke-admin", targetId: otherAdmin.id },
    });
    expect(entry).toMatchObject({ actorId: adminId, actorEmail: `admin-${fx.tag}@test.local` });
    expect(entry?.summary).toContain("other-admin-");
  });

  it("keeps the audit log behind admin auth", async () => {
    expect((await request(app).get("/api/v1/admin/audit")).status).toBe(401);
    expect((await request(app).get("/api/v1/admin/audit").set(await mentor())).status).toBe(403);
  });
});

describe("list filters and paging", () => {
  it("searches and filters the user list", async () => {
    const search = await request(app).get("/api/v1/admin/users").query({ query: `admin-${fx.tag}` }).set(admin());
    expect(search.status).toBe(200);
    const emails: string[] = search.body.data.users.map((u: { email: string }) => u.email);
    expect(emails).toContain(`admin-${fx.tag}@test.local`);
    expect(emails.every((email) => email.includes(fx.tag))).toBe(true);

    const admins = await request(app).get("/api/v1/admin/users").query({ role: "ADMIN" }).set(admin());
    expect(admins.body.data.users.length).toBeGreaterThan(0);
    expect(admins.body.data.users.every((u: { role: string }) => u.role === "ADMIN")).toBe(true);

    // Bad filter values are rejected by the query schema.
    expect((await request(app).get("/api/v1/admin/users").query({ role: "SUPER" }).set(admin())).status).toBe(400);
  });

  it("pages the user list with page numbers", async () => {
    const first = await request(app).get("/api/v1/admin/users").query({ pageSize: 5, page: 1 }).set(admin());
    expect(first.status).toBe(200);
    expect(first.body.data.users).toHaveLength(5);
    expect(first.body.data.page).toMatchObject({ page: 1, pageSize: 5 });
    expect(first.body.data.page.pageCount).toBeGreaterThan(1);
    expect(first.body.data.page.total).toBeGreaterThanOrEqual(first.body.data.page.pageCount);

    const second = await request(app).get("/api/v1/admin/users").query({ pageSize: 5, page: 2 }).set(admin());
    expect(second.body.data.page.page).toBe(2);
    const firstIds = first.body.data.users.map((u: { id: string }) => u.id);
    expect(second.body.data.users.some((u: { id: string }) => firstIds.includes(u.id))).toBe(false);

    // An out-of-range page clamps to the last page rather than returning nothing.
    const beyond = await request(app).get("/api/v1/admin/users").query({ pageSize: 5, page: 9999 }).set(admin());
    expect(beyond.body.data.page.page).toBe(beyond.body.data.page.pageCount);
    expect(beyond.body.data.users.length).toBeGreaterThan(0);
  });

  it("exposes page info on every admin list", async () => {
    const lists: Array<[string, (body: Record<string, unknown>) => unknown]> = [
      ["/api/v1/admin/users", (body) => body.page],
      ["/api/v1/admin/courses", (body) => body.page],
      ["/api/v1/admin/organizations", (body) => body.page],
      ["/api/v1/admin/audit", (body) => body.page],
      ["/api/v1/admin/course-requests", (body) => body.pendingPage],
    ];
    for (const [path, pick] of lists) {
      const res = await request(app).get(path).set(admin());
      expect(res.status).toBe(200);
      expect(pick(res.body.data as Record<string, unknown>)).toMatchObject({
        page: expect.any(Number),
        pageSize: expect.any(Number),
        total: expect.any(Number),
        pageCount: expect.any(Number),
      });
    }
  });

  it("pages the pending and recently-reviewed request lists independently", async () => {
    // Keep this pagination test self-contained: the test database starts empty,
    // and the earlier request test removes the request it creates.
    await prisma.organizationCourseRequest.createMany({
      data: Array.from({ length: 11 }, () => ({
        organizationId: org.organization.id,
        courseId: fx.course.id,
        status: "PENDING" as const,
      })),
    });
    await prisma.organizationCourseRequest.createMany({
      data: Array.from({ length: 11 }, (_, index) => ({
        organizationId: org.organization.id,
        courseId: fx.course.id,
        status: index % 2 === 0 ? "APPROVED" as const : "REJECTED" as const,
        reviewedAt: new Date(Date.now() - index * 1_000),
        reviewedById: adminId,
      })),
    });

    const first = await request(app).get("/api/v1/admin/course-requests").query({ pageSize: 5 }).set(admin());
    expect(first.body.data.pending).toHaveLength(5);
    expect(first.body.data.pendingPage).toMatchObject({ page: 1, pageSize: 5 });
    expect(first.body.data.recentPage.pageSize).toBe(5);

    const reviewed = await request(app)
      .get("/api/v1/admin/course-requests")
      .query({ pageSize: 5, recentPage: 2 })
      .set(admin());
    expect(reviewed.body.data.pendingPage.page).toBe(1);
    expect(reviewed.body.data.recentPage.page).toBe(2);
    expect(reviewed.body.data.recent.length).toBeGreaterThan(0);
  });

  it("filters the course list by status and text", async () => {
    const published = await request(app).get("/api/v1/admin/courses").query({ status: "PUBLISHED" }).set(admin());
    expect(published.status).toBe(200);
    expect(published.body.data.courses.length).toBeGreaterThan(0);
    expect(published.body.data.courses.every((c: { status: string }) => c.status === "PUBLISHED")).toBe(true);

    const bySlug = await request(app).get("/api/v1/admin/courses").query({ query: fx.course.slug }).set(admin());
    expect(bySlug.body.data.courses.map((c: { id: string }) => c.id)).toContain(fx.course.id);
  });

  it("pages the pending instructor requests independently of the account list", async () => {
    for (let index = 0; index < 6; index += 1) {
      const user = await prisma.user.create({
        data: { email: `pending-${fx.tag}-${index}@test.local`, role: "MENTEE", emailVerified: new Date() },
      });
      createdUserIds.push(user.id);
      await prisma.instructorAccessRequest.create({
        data: { userId: user.id, status: "PENDING", message: `request ${index}` },
      });
    }

    const res = await request(app).get("/api/v1/admin/users").query({ pageSize: 5, requestsPage: 2 }).set(admin());
    expect(res.status).toBe(200);
    // The account list stays on page 1 while the requests panel moves to page 2.
    expect(res.body.data.page.page).toBe(1);
    expect(res.body.data.pendingRequestsPage).toMatchObject({ page: 2, pageSize: 5 });
    expect(res.body.data.pendingInstructorRequests.length).toBeGreaterThan(0);
  });

  it("reports whether the organization catalog was capped for the picker", async () => {
    const detail = await request(app).get(`/api/v1/admin/organizations/${org.organization.id}`).set(admin());
    expect(detail.status).toBe(200);
    expect(Array.isArray(detail.body.data.publishedCourses)).toBe(true);
    // The dev catalog is well under the cap, so it is not flagged as truncated.
    expect(detail.body.data.publishedCoursesTruncated).toBe(false);
  });
});

describe("bulk actions and course status", () => {
  it("bulk-suspends and reinstates users, reporting per-target outcomes", async () => {
    const first = await prisma.user.create({
      data: { email: `bulk-a-${fx.tag}@test.local`, role: "MENTEE", emailVerified: new Date() },
    });
    const second = await prisma.user.create({
      data: { email: `bulk-b-${fx.tag}@test.local`, role: "MENTEE", emailVerified: new Date() },
    });
    createdUserIds.push(first.id, second.id);

    const suspend = await request(app)
      .post("/api/v1/admin/users/bulk/suspend")
      .set(admin())
      .send({ ids: [first.id, second.id, "does-not-exist"], note: "bulk test" });
    expect(suspend.status).toBe(200);
    expect(suspend.body.data.updated).toBe(2);
    expect(suspend.body.data.skipped).toHaveLength(1);
    expect(suspend.body.data.skipped[0]).toMatchObject({ id: "does-not-exist" });
    expect((await prisma.user.findUniqueOrThrow({ where: { id: first.id } })).suspendedAt).not.toBeNull();

    // A blocked row (self-action) is skipped rather than failing the whole batch.
    const withSelf = await request(app)
      .post("/api/v1/admin/users/bulk/suspend")
      .set(admin())
      .send({ ids: [adminId, second.id] });
    expect(withSelf.body.data.skipped.some((row: { id: string }) => row.id === adminId)).toBe(true);

    const reinstate = await request(app)
      .post("/api/v1/admin/users/bulk/reinstate")
      .set(admin())
      .send({ ids: [first.id, second.id] });
    expect(reinstate.body.data.updated).toBe(2);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: first.id } })).suspendedAt).toBeNull();

    expect((await request(app).post("/api/v1/admin/users/bulk/suspend").set(admin()).send({ ids: [] })).status).toBe(400);
  });

  it("bulk-approves course requests with one cap", async () => {
    const course = await prisma.course.create({
      data: { slug: `bulk-req-${fx.tag}`, title: "Bulk request course", status: "PUBLISHED", mentorId: fx.mentor.id, publishedAt: new Date() },
    });
    const pending = await prisma.organizationCourseRequest.create({
      data: { organizationId: org.organization.id, courseId: course.id },
    });
    try {
      const approve = await request(app)
        .post("/api/v1/admin/course-requests/bulk/approve")
        .set(admin())
        .send({ ids: [pending.id, "does-not-exist"], maxEnrollments: 7, expiresAt: "" });
      expect(approve.status).toBe(200);
      expect(approve.body.data.updated).toBe(1);
      expect(approve.body.data.skipped).toHaveLength(1);
      expect((await prisma.organizationCourseRequest.findUniqueOrThrow({ where: { id: pending.id } })).status).toBe("APPROVED");

      const allocation = await prisma.organizationCourse.findUnique({
        where: { organizationId_courseId: { organizationId: org.organization.id, courseId: course.id } },
      });
      expect(allocation).toMatchObject({ maxEnrollments: 7, isAllowed: true });
    } finally {
      await prisma.organizationCourseRequest.deleteMany({ where: { courseId: course.id } });
      await prisma.organizationCourse.deleteMany({ where: { courseId: course.id } });
      await prisma.course.delete({ where: { id: course.id } });
    }
  });

  it("publishes and archives a course, auditing each change", async () => {
    const course = await prisma.course.create({
      data: { slug: `status-${fx.tag}`, title: "Status test course", status: "DRAFT", mentorId: fx.mentor.id },
    });
    try {
      const publish = await request(app)
        .post(`/api/v1/admin/courses/${course.id}/status`)
        .set(admin())
        .send({ status: "PUBLISHED" });
      expect(publish.status).toBe(204);
      const after = await prisma.course.findUniqueOrThrow({ where: { id: course.id } });
      expect(after.status).toBe("PUBLISHED");
      expect(after.publishedAt).not.toBeNull();

      // Setting the same status again is a conflict, not a silent no-op.
      const same = await request(app)
        .post(`/api/v1/admin/courses/${course.id}/status`)
        .set(admin())
        .send({ status: "PUBLISHED" });
      expect(same.status).toBe(409);

      expect(
        (await request(app).post(`/api/v1/admin/courses/${course.id}/status`).set(admin()).send({ status: "ARCHIVED" })).status
      ).toBe(204);
      expect((await prisma.course.findUniqueOrThrow({ where: { id: course.id } })).status).toBe("ARCHIVED");

      const audit = await prisma.adminAuditLog.findMany({ where: { targetId: course.id, action: "course.set-status" } });
      expect(audit).toHaveLength(2);
      expect(audit.every((row) => row.actorEmail === `admin-${fx.tag}@test.local`)).toBe(true);

      expect(
        (await request(app).post(`/api/v1/admin/courses/${course.id}/status`).set(admin()).send({ status: "NOPE" })).status
      ).toBe(400);
    } finally {
      await prisma.adminAuditLog.deleteMany({ where: { targetId: course.id } });
      await prisma.course.delete({ where: { id: course.id } });
    }
  });
});

describe("user detail and account actions", () => {
  it("returns a user's detail with enrollments and session count", async () => {
    const res = await request(app).get(`/api/v1/admin/users/${fx.learner.id}`).set(admin());
    expect(res.status).toBe(200);
    expect(res.body.data.user).toMatchObject({ id: fx.learner.id, email: fx.learner.email });
    expect(res.body.data.user.activeSessions).toBeGreaterThanOrEqual(1);
    expect(Array.isArray(res.body.data.enrollments)).toBe(true);
    expect((await request(app).get("/api/v1/admin/users/does-not-exist").set(admin())).status).toBe(404);
  });

  it("forces email verification once and records it", async () => {
    const target = await prisma.user.create({
      data: { email: `force-verify-${fx.tag}@test.local`, role: "MENTEE" },
    });
    createdUserIds.push(target.id);

    const res = await request(app).post(`/api/v1/admin/users/${target.id}/verify-email`).set(admin());
    expect(res.status).toBe(204);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: target.id } })).emailVerified).not.toBeNull();

    const again = await request(app).post(`/api/v1/admin/users/${target.id}/verify-email`).set(admin());
    expect(again.status).toBe(409);
    expect(again.body.code).toBe("ALREADY_VERIFIED");
  });

  it("signs a user out of every device, guarding self-action", async () => {
    const target = await prisma.user.create({
      data: { email: `sessions-${fx.tag}@test.local`, role: "MENTEE", emailVerified: new Date() },
    });
    createdUserIds.push(target.id);
    await createSession(target.id);
    await createSession(target.id);
    expect(await prisma.session.count({ where: { userId: target.id } })).toBe(2);

    const self = await request(app).post(`/api/v1/admin/users/${adminId}/revoke-sessions`).set(admin());
    expect(self.status).toBe(403);
    expect(self.body.code).toBe("SELF_ACTION");

    const ok = await request(app).post(`/api/v1/admin/users/${target.id}/revoke-sessions`).set(admin());
    expect(ok.status).toBe(204);
    expect(await prisma.session.count({ where: { userId: target.id } })).toBe(0);

    // Idempotent: revoking again (e.g. the sessions cleared between render and click) is a no-op.
    const again = await request(app).post(`/api/v1/admin/users/${target.id}/revoke-sessions`).set(admin());
    expect(again.status).toBe(204);
  });

  it("keeps user detail and account actions behind admin auth", async () => {
    expect((await request(app).get(`/api/v1/admin/users/${fx.learner.id}`)).status).toBe(401);
    expect(
      (await request(app).post(`/api/v1/admin/users/${fx.learner.id}/revoke-sessions`).set(await mentor())).status
    ).toBe(403);
  });

  it("excludes pending-payment and rejected enrollments from user lists and detail until payment or admin enrollment succeeds", async () => {
    const paidCourse = await prisma.course.create({
      data: {
        slug: `paid-enr-${fx.tag}`,
        title: "Paid Enrollment Course",
        status: "PUBLISHED",
        pricingType: "PAID",
        priceCents: 2500,
        currency: "USD",
        mentorId: fx.mentor.id,
        publishedAt: new Date(),
      },
    });
    const buyer = await prisma.user.create({
      data: {
        email: `buyer-${fx.tag}@test.local`,
        name: "Pending Buyer",
        role: "MENTEE",
        emailVerified: new Date(),
      },
    });
    createdUserIds.push(buyer.id);

    try {
      const pendingEnrollment = await prisma.enrollment.create({
        data: {
          courseId: paidCourse.id,
          userId: buyer.id,
          source: "SELF",
          lifecycle: "PAYMENT_REQUIRED",
          status: "ASSIGNED",
          payment: {
            create: {
              amountCents: 2500,
              currency: "USD",
              status: "PENDING",
            },
          },
        },
      });

      // 1. Under payment: excluded from user list count, enrolled filter, course count, and user detail.
      const listWhilePending = await request(app)
        .get("/api/v1/admin/users")
        .query({ query: buyer.email })
        .set(admin());
      expect(listWhilePending.body.data.users[0]).toMatchObject({ id: buyer.id, enrollmentCount: 0 });

      const enrolledOnlyWhilePending = await request(app)
        .get("/api/v1/admin/users")
        .query({ query: buyer.email, enrolled: "true" })
        .set(admin());
      expect(enrolledOnlyWhilePending.body.data.users).toHaveLength(0);

      const detailWhilePending = await request(app).get(`/api/v1/admin/users/${buyer.id}`).set(admin());
      expect(detailWhilePending.body.data.user.enrollmentCount).toBe(0);
      expect(detailWhilePending.body.data.enrollments).toEqual([]);

      // 2. Rejected payment: still excluded everywhere.
      const rejectRes = await request(app)
        .post(`/api/v1/admin/manual-access/${pendingEnrollment.id}/reject`)
        .set(admin());
      expect(rejectRes.status).toBe(200);

      const detailAfterReject = await request(app).get(`/api/v1/admin/users/${buyer.id}`).set(admin());
      expect(detailAfterReject.body.data.user.enrollmentCount).toBe(0);
      expect(detailAfterReject.body.data.enrollments).toEqual([]);

      // 3. Admin enrolls the user: upgrades to ACTIVE + SUCCEEDED and now counts as a positive enrollment.
      const enrollRes = await request(app)
        .post(`/api/v1/admin/users/${buyer.id}/enroll`)
        .set(admin())
        .send({ courseId: paidCourse.id });
      expect(enrollRes.status).toBe(201);

      const enrolledOnlyAfterSuccess = await request(app)
        .get("/api/v1/admin/users")
        .query({ query: buyer.email, enrolled: "true" })
        .set(admin());
      expect(enrolledOnlyAfterSuccess.body.data.users).toHaveLength(1);
      expect(enrolledOnlyAfterSuccess.body.data.users[0]).toMatchObject({ id: buyer.id, enrollmentCount: 1 });

      const detailAfterSuccess = await request(app).get(`/api/v1/admin/users/${buyer.id}`).set(admin());
      expect(detailAfterSuccess.body.data.user.enrollmentCount).toBe(1);
      expect(detailAfterSuccess.body.data.enrollments).toHaveLength(1);
      expect(detailAfterSuccess.body.data.enrollments[0]).toMatchObject({
        id: pendingEnrollment.id,
        courseId: paidCourse.id,
        lifecycle: "ACTIVE",
      });

      // Duplicate enroll is rejected with ALREADY_ENROLLED.
      const dupRes = await request(app)
        .post(`/api/v1/admin/users/${buyer.id}/enroll`)
        .set(admin())
        .send({ courseId: paidCourse.id });
      expect(dupRes.status).toBe(409);
      expect(dupRes.body.code).toBe("ALREADY_ENROLLED");

      // 4. Admin removes the enrollment: disappears cleanly.
      const removeRes = await request(app)
        .delete(`/api/v1/admin/users/${buyer.id}/enrollments/${pendingEnrollment.id}`)
        .set(admin());
      expect(removeRes.status).toBe(204);

      const detailAfterRemove = await request(app).get(`/api/v1/admin/users/${buyer.id}`).set(admin());
      expect(detailAfterRemove.body.data.user.enrollmentCount).toBe(0);
      expect(detailAfterRemove.body.data.enrollments).toEqual([]);
    } finally {
      await prisma.enrollment.deleteMany({ where: { courseId: paidCourse.id } });
      await prisma.course.delete({ where: { id: paidCourse.id } });
    }
  });
});

describe("suspension", () => {
  const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

  it("suspends an account, blocking its sessions, then reinstates it", async () => {
    const target = await prisma.user.create({
      data: { email: `suspend-${fx.tag}@test.local`, role: "MENTEE", emailVerified: new Date() },
    });
    createdUserIds.push(target.id);
    const session = await createSession(target.id);
    expect((await request(app).get("/api/v1/auth/me").set(bearer(session.sessionToken))).status).toBe(200);

    const res = await request(app)
      .post(`/api/v1/admin/users/${target.id}/suspend`)
      .set(admin())
      .send({ note: "abuse report" });
    expect(res.status).toBe(204);
    const after = await prisma.user.findUniqueOrThrow({ where: { id: target.id } });
    expect(after.suspendedAt).not.toBeNull();
    expect(after.suspensionNote).toBe("abuse report");
    // The session is kept as a tombstone, but every request is refused with a distinct code
    // so clients can explain the sign-out.
    expect(await prisma.session.count({ where: { userId: target.id } })).toBe(1);
    const blocked = await request(app).get("/api/v1/auth/me").set(bearer(session.sessionToken));
    expect(blocked.status).toBe(403);
    expect(blocked.body.code).toBe("ACCOUNT_SUSPENDED");

    const again = await request(app).post(`/api/v1/admin/users/${target.id}/suspend`).set(admin()).send({});
    expect(again.status).toBe(409);
    expect(again.body.code).toBe("ALREADY_SUSPENDED");

    expect((await request(app).post(`/api/v1/admin/users/${target.id}/reinstate`).set(admin())).status).toBe(204);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: target.id } })).suspendedAt).toBeNull();
    // Reinstate clears old sessions so a reinstated account starts fresh.
    expect(await prisma.session.count({ where: { userId: target.id } })).toBe(0);
    expect((await request(app).get("/api/v1/auth/me").set(bearer(session.sessionToken))).status).toBe(401);
    const reinstateAgain = await request(app).post(`/api/v1/admin/users/${target.id}/reinstate`).set(admin());
    expect(reinstateAgain.status).toBe(409);
    expect(reinstateAgain.body.code).toBe("NOT_SUSPENDED");

    const actions = await prisma.adminAuditLog.findMany({ where: { targetId: target.id } });
    expect(actions.map((row) => row.action)).toEqual(
      expect.arrayContaining(["user.suspend", "user.reinstate"])
    );
  });

  it("guards self-suspension and requires an administrator", async () => {
    const self = await request(app).post(`/api/v1/admin/users/${adminId}/suspend`).set(admin()).send({});
    expect(self.status).toBe(403);
    expect(self.body.code).toBe("SELF_ACTION");

    expect((await request(app).post(`/api/v1/admin/users/${fx.learner.id}/suspend`)).status).toBe(401);
    expect(
      (await request(app).post(`/api/v1/admin/users/${fx.learner.id}/suspend`).set(await mentor())).status
    ).toBe(403);
  });
});

describe("admin MFA", () => {
  const password = "correct horse battery staple";

  async function makeAdminWithPassword() {
    const user = await prisma.user.create({
      data: {
        email: `mfa-${fx.tag}-${createdUserIds.length}@test.local`,
        role: "ADMIN",
        emailVerified: new Date(),
        passwordHash: hashPassword(password),
      },
    });
    createdUserIds.push(user.id);
    const session = await createSession(user.id);
    return { user, token: session.sessionToken };
  }

  const login = (email: string, extra: Record<string, unknown> = {}) =>
    request(app).post("/api/v1/auth/login").send({ email, password, ...extra });

  it("enrolls, activates, enforces the code at sign-in, then disables", async () => {
    const { user, token } = await makeAdminWithPassword();
    const bearer = { Authorization: `Bearer ${token}` };

    const enroll = await request(app).post("/api/v1/admin/mfa/enroll").set(bearer);
    expect(enroll.status).toBe(201);
    const secret: string = enroll.body.data.secret;
    expect(secret).toMatch(/^[A-Z2-7]{32}$/);
    expect(enroll.body.data.otpauthUri).toContain(`secret=${secret}`);
    // The scannable QR is generated server-side as a PNG data URL.
    expect(enroll.body.data.qrDataUrl).toMatch(/^data:image\/png;base64,/);
    expect(await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).toMatchObject({
      totpSecret: secret,
      totpEnabledAt: null,
    });

    // Wrong code cannot activate; the correct one can.
    const badActivate = await request(app).post("/api/v1/admin/mfa/activate").set(bearer).send({ code: "000000" });
    expect(badActivate.status).toBe(401);
    expect(badActivate.body.code).toBe("MFA_INVALID");

    const activate = await request(app).post("/api/v1/admin/mfa/activate").set(bearer).send({ code: totpCodeFor(secret) });
    expect(activate.status).toBe(200);
    expect(activate.body.data.recoveryCodes).toHaveLength(8);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).totpEnabledAt).not.toBeNull();
    const status = await request(app).get("/api/v1/admin/mfa").set(bearer);
    expect(status.body.data).toEqual({ enabled: true, recoveryCodesRemaining: 8 });
    const enrollAgain = await request(app).post("/api/v1/admin/mfa/enroll").set(bearer);
    expect(enrollAgain.status).toBe(409);

    // Sign-in now demands the code.
    const noCode = await login(user.email);
    expect(noCode.status).toBe(403);
    expect(noCode.body.code).toBe("MFA_REQUIRED");

    const wrongCode = await login(user.email, { code: "123456" });
    expect(wrongCode.status).toBe(401);
    expect(wrongCode.body.code).toBe("MFA_INVALID");

    const signedIn = await login(user.email, { code: totpCodeFor(secret) });
    expect(signedIn.status).toBe(200);

    // Disable requires the code, then sign-in works without one again.
    expect((await request(app).post("/api/v1/admin/mfa/disable").set(bearer).send({ code: "999999" })).status).toBe(401);
    expect((await request(app).post("/api/v1/admin/mfa/disable").set(bearer).send({ code: totpCodeFor(secret) })).status).toBe(204);
    const afterDisable = await login(user.email);
    expect(afterDisable.status).toBe(200);

    const actions = await prisma.adminAuditLog.findMany({ where: { targetId: user.id } });
    expect(actions.map((row) => row.action)).toEqual(expect.arrayContaining(["mfa.enable", "mfa.disable"]));
  });

  it("signs in with a backup code once, then regenerates the set", async () => {
    const { user, token } = await makeAdminWithPassword();
    const bearer = { Authorization: `Bearer ${token}` };
    const enroll = await request(app).post("/api/v1/admin/mfa/enroll").set(bearer);
    const secret: string = enroll.body.data.secret;
    const activate = await request(app)
      .post("/api/v1/admin/mfa/activate")
      .set(bearer)
      .send({ code: totpCodeFor(secret) });
    const codes: string[] = activate.body.data.recoveryCodes;
    expect(codes).toHaveLength(8);
    expect(codes[0]).toMatch(/^[A-Z2-7]{4}-[A-Z2-7]{4}-[A-Z2-7]{4}-[A-Z2-7]{4}$/);

    // A backup code signs in once and is then consumed.
    expect((await login(user.email, { code: codes[0] })).status).toBe(200);
    const status = await request(app).get("/api/v1/admin/mfa").set(bearer);
    expect(status.body.data.recoveryCodesRemaining).toBe(7);
    const reuse = await login(user.email, { code: codes[0] });
    expect(reuse.status).toBe(401);
    expect(reuse.body.code).toBe("MFA_INVALID");

    // Regenerating needs a current code, invalidates the old set, and returns new codes.
    expect(
      (await request(app).post("/api/v1/admin/mfa/recovery-codes").set(bearer).send({ code: "000000" })).status
    ).toBe(401);
    const regen = await request(app)
      .post("/api/v1/admin/mfa/recovery-codes")
      .set(bearer)
      .send({ code: totpCodeFor(secret) });
    expect(regen.status).toBe(200);
    expect(regen.body.data.recoveryCodes).toHaveLength(8);
    expect(regen.body.data.recoveryCodes).not.toEqual(codes);
    expect((await login(user.email, { code: codes[1] })).status).toBe(401);
    expect((await login(user.email, { code: regen.body.data.recoveryCodes[0] })).status).toBe(200);
  });

  it("lets another admin reset a lost device's MFA", async () => {
    const { user, token } = await makeAdminWithPassword();
    const secret = generateTotpSecret();
    await prisma.user.update({ where: { id: user.id }, data: { totpSecret: secret, totpEnabledAt: new Date() } });
    expect(token).toBeTruthy();

    expect((await login(user.email)).status).toBe(403);

    const reset = await request(app).post(`/api/v1/admin/users/${user.id}/reset-mfa`).set(admin());
    expect(reset.status).toBe(204);
    expect(await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).toMatchObject({
      totpSecret: null,
      totpEnabledAt: null,
    });
    expect((await login(user.email)).status).toBe(200);

    const again = await request(app).post(`/api/v1/admin/users/${user.id}/reset-mfa`).set(admin());
    expect(again.status).toBe(409);
    expect(again.body.code).toBe("MFA_NOT_ENABLED");
  });
});

describe("CSV exports", () => {
  it("exports the filtered user list as a downloadable CSV", async () => {
    const res = await request(app).get("/api/v1/admin/users/export").query({ role: "ADMIN" }).set(admin());
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("text/csv");
    expect(res.headers["content-disposition"]).toContain("attachment");

    const lines = res.text.trim().split("\n");
    expect(lines[0]).toBe("id,email,name,role,verified,suspended,mfa,zipImport,tester,enrollments,courses,createdAt");
    expect(lines.length).toBeGreaterThan(1);
    // The export honours the same filters as the list.
    expect(lines.slice(1).every((line) => line.split(",")[3] === "ADMIN")).toBe(true);
  });

  it("exports the course catalog and the audit trail", async () => {
    const courses = await request(app).get("/api/v1/admin/courses/export").set(admin());
    expect(courses.status).toBe(200);
    expect(courses.text.split("\n")[0]).toBe(
      "id,slug,title,status,pricingType,priceCents,currency,instructor,enrollments,allocations,updatedAt"
    );

    const audit = await request(app).get("/api/v1/admin/audit/export").set(admin());
    expect(audit.status).toBe(200);
    expect(audit.text.split("\n")[0]).toBe("createdAt,action,actorEmail,targetType,targetId,summary");
    expect(audit.text).toContain("organization.create");
  });

  it("requires an administrator for exports", async () => {
    expect((await request(app).get("/api/v1/admin/users/export")).status).toBe(401);
    expect((await request(app).get("/api/v1/admin/courses/export").set(await mentor())).status).toBe(403);
  });
});

describe("metrics", () => {
  it("returns a continuous daily series with totals", async () => {
    // A brand-new account must show up in today's signups.
    const target = await prisma.user.create({
      data: { email: `metric-${fx.tag}@test.local`, role: "MENTEE", emailVerified: new Date() },
    });
    createdUserIds.push(target.id);

    const res = await request(app).get("/api/v1/admin/metrics").query({ range: "7" }).set(admin());
    expect(res.status).toBe(200);
    expect(res.body.data.rangeDays).toBe(7);
    expect(res.body.data.series).toHaveLength(7);

    const dates: string[] = res.body.data.series.map((point: { date: string }) => point.date);
    expect([...dates].sort()).toEqual(dates); // oldest → newest
    const today = new Date().toISOString().slice(0, 10);
    expect(dates[dates.length - 1]).toBe(today);
    expect(res.body.data.series[res.body.data.series.length - 1].signups).toBeGreaterThanOrEqual(1);
    expect(res.body.data.totals).toMatchObject({
      newUsers: expect.any(Number),
      newEnrollments: expect.any(Number),
      activeLearners: expect.any(Number),
      studySeconds: expect.any(Number),
    });
    expect(res.body.data.totals.newUsers).toBeGreaterThanOrEqual(1);

    // Defaults to 30 days; unknown windows are rejected by the query schema.
    expect((await request(app).get("/api/v1/admin/metrics").set(admin())).body.data.rangeDays).toBe(30);
    expect((await request(app).get("/api/v1/admin/metrics").query({ range: "365" }).set(admin())).status).toBe(400);
  });

  it("requires an administrator", async () => {
    expect((await request(app).get("/api/v1/admin/metrics")).status).toBe(401);
    expect((await request(app).get("/api/v1/admin/metrics").set(await mentor())).status).toBe(403);
  });
});

describe("enrollments and what was paid", () => {
  it("lists enrollments with their payment and shows one in full", async () => {
    await prisma.payment.create({
      data: {
        enrollmentId: fx.enrollment.id,
        amountCents: 4500,
        currency: "USD",
        status: "SUCCEEDED",
        provider: "polar",
        providerRef: `order-${fx.tag}`,
        originalAmountCents: 5000,
        discountAmountCents: 500,
        learnerAmountCents: 4500,
        platformRevenueCents: 1350,
        instructorShareCents: 3150,
        instructorPayoutPercent: 70,
        paidAt: new Date(),
      },
    });
    try {
      const list = await request(app).get(`/api/v1/admin/enrollments?query=${fx.tag}&payment=SUCCEEDED`).set(admin());
      expect(list.status).toBe(200);
      const row = list.body.data.enrollments.find((r: { id: string }) => r.id === fx.enrollment.id);
      expect(row.learner.email).toBe(fx.learner.email);
      expect(row.payment).toMatchObject({ status: "SUCCEEDED", amountCents: 4500, originalAmountCents: 5000 });
      expect(row.discounts).toEqual([]);
      expect(list.body.data.page.total).toBeGreaterThanOrEqual(1);

      const none = await request(app).get(`/api/v1/admin/enrollments?query=${fx.tag}&payment=NONE`).set(admin());
      expect(none.body.data.enrollments.some((r: { id: string }) => r.id === fx.enrollment.id)).toBe(false);

      const detail = await request(app).get(`/api/v1/admin/enrollments/${fx.enrollment.id}`).set(admin());
      expect(detail.status).toBe(200);
      expect(detail.body.data.instructor.id).toBe(fx.mentor.id);
      expect(detail.body.data.payment).toMatchObject({ amountCents: 4500, discountAmountCents: 500, refund: null });

      expect((await request(app).get("/api/v1/admin/enrollments/missing-enrollment").set(admin())).status).toBe(404);
      expect((await request(app).get("/api/v1/admin/enrollments").set(await mentor())).status).toBe(403);
    } finally {
      await prisma.payment.deleteMany({ where: { enrollmentId: fx.enrollment.id } });
    }
  });

  it("edits an enrollment's access and payment, then deletes it completely", async () => {
    const enrollment = await prisma.enrollment.create({
      data: { courseId: fx.course.id, userId: fx.unverified.id, lifecycle: "PAYMENT_REQUIRED", source: "SELF" },
    });

    const noPayment = await request(app).patch(`/api/v1/admin/enrollments/${enrollment.id}`).set(admin()).send({ paymentStatus: "SUCCEEDED" });
    expect(noPayment.status).toBe(409);
    await prisma.payment.create({ data: { enrollmentId: enrollment.id, amountCents: 1999, status: "PENDING" } });
    const amounts = await request(app).patch(`/api/v1/admin/enrollments/${enrollment.id}`).set(admin()).send({ amountCents: 1 });
    expect(amounts.status).toBe(400);

    const coupon = await prisma.instructorCoupon.create({
      data: { courseId: fx.course.id, createdById: fx.mentor.id, label: "Launch week", code: `LAUNCH${fx.tag}`, percentOff: 20, maxRedemptions: 10 },
    });
    await prisma.instructorCouponRedemption.create({
      data: { couponId: coupon.id, enrollmentId: enrollment.id, userId: fx.unverified.id, percentOff: 20 },
    });
    const discounted = await request(app).get(`/api/v1/admin/enrollments?query=${fx.tag}&discount=true`).set(admin());
    const discountedRow = discounted.body.data.enrollments.find((r: { id: string }) => r.id === enrollment.id);
    expect(discountedRow.discounts).toMatchObject([{ kind: "instructor_coupon", label: "Launch week", code: `LAUNCH${fx.tag}`, percentOff: 20 }]);
    const fullPrice = await request(app).get(`/api/v1/admin/enrollments?query=${fx.tag}&discount=false`).set(admin());
    expect(fullPrice.body.data.enrollments.some((r: { id: string }) => r.id === enrollment.id)).toBe(false);

    const edited = await request(app)
      .patch(`/api/v1/admin/enrollments/${enrollment.id}`)
      .set(admin())
      .send({ lifecycle: "ACTIVE", paymentStatus: "SUCCEEDED" });
    expect(edited.status).toBe(200);
    expect(edited.body.data.lifecycle).toBe("ACTIVE");
    expect(edited.body.data.payment).toMatchObject({ status: "SUCCEEDED", amountCents: 1999 });
    expect(edited.body.data.payment.paidAt).not.toBeNull();

    const audit = await prisma.adminAuditLog.findFirst({ where: { targetId: enrollment.id, action: "enrollment.update" } });
    expect(audit?.actorId).toBe(adminId);

    const empty = await request(app).patch(`/api/v1/admin/enrollments/${enrollment.id}`).set(admin()).send({});
    expect(empty.status).toBe(400);
    const bad = await request(app).patch(`/api/v1/admin/enrollments/${enrollment.id}`).set(admin()).send({ lifecycle: "OPEN" });
    expect(bad.status).toBe(400);

    const removed = await request(app).delete(`/api/v1/admin/enrollments/${enrollment.id}`).set(admin());
    expect(removed.status).toBe(204);
    expect(await prisma.enrollment.findUnique({ where: { id: enrollment.id } })).toBeNull();
    expect(await prisma.payment.findUnique({ where: { enrollmentId: enrollment.id } })).toBeNull();
  });

  it("labels an admin enrollment as its discount and filters by it", async () => {
    const enrolled = await request(app).post(`/api/v1/admin/users/${fx.unverified.id}/enroll`).set(admin()).send({ courseId: fx.course.id });
    expect(enrolled.status).toBeLessThan(300);
    const enrollment = await prisma.enrollment.findFirstOrThrow({ where: { userId: fx.unverified.id, courseId: fx.course.id } });
    try {
      const list = await request(app).get(`/api/v1/admin/enrollments?query=${fx.tag}&discount=admin`).set(admin());
      const row = list.body.data.enrollments.find((r: { id: string }) => r.id === enrollment.id);
      expect(row.payment.provider).toBe("admin");
      expect(row.discounts).toMatchObject([{ kind: "admin_enrollment", label: "Admin enrollment" }]);
      const fullPrice = await request(app).get(`/api/v1/admin/enrollments?query=${fx.tag}&discount=false`).set(admin());
      expect(fullPrice.body.data.enrollments.some((r: { id: string }) => r.id === enrollment.id)).toBe(false);
      const detail = await request(app).get(`/api/v1/admin/enrollments/${enrollment.id}`).set(admin());
      expect(detail.body.data.discounts[0].kind).toBe("admin_enrollment");
    } finally {
      await prisma.enrollment.delete({ where: { id: enrollment.id } });
    }
  });
});
