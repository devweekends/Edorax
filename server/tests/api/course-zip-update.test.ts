import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { prisma } from "../../src/db/prisma.js";
import { createApp } from "../../src/app.js";
import { createSession } from "../../src/services/auth/session.js";
import { parseCourseZip, type ImportPlan } from "../../src/services/teach/course-import.js";
import { loadCourseBuilder } from "../../src/services/teach/courses.js";
import { loadCourseGate } from "../../src/services/progress/gate.js";
import { releaseForEnrollment } from "../../src/services/courses/releases.js";
import type { CourseUpdatePreview } from "../../src/shared/api/teach.js";

// Parsing/ZIP boundaries have separate tests; use deterministic plans to exercise actual API/DB updates.
vi.mock("../../src/services/teach/course-import.js", async importOriginal => ({
  ...await importOriginal<typeof import("../../src/services/teach/course-import.js")>(), parseCourseZip: vi.fn(),
}));

const app = createApp();
const paymentText = "Validate checkout inputs before charging the customer. Check the basket total and reject expired payment tokens. Save the transaction safely and send a receipt to the customer.";
const deploymentText = "Deploy the application using production environment variables. Configure the server health check and database connection. Run migrations before accepting requests from users.";
const lesson = (title: string, source: string, blocks: ImportPlan["modules"][number]["lessons"][number]["blocks"] = []) => ({
  title, source, blocks, lessonNum: 1, slugPart: "lesson", summary: null, estimatedMinutes: 10,
  readerMode: "DEFAULT" as const, isMilestone: false,
});
const plan = (modules: ImportPlan["modules"]): ImportPlan => ({ manifest: { title: "Incoming title", description: "Incoming", projectGoal: "Incoming", difficulty: "beginner", estimatedHours: 1 }, modules });
let owner: Awaited<ReturnType<typeof prisma.user.create>>;
let stranger: typeof owner;
let learner: typeof owner;
let course: Awaited<ReturnType<typeof prisma.course.create>>;
let moduleA: Awaited<ReturnType<typeof prisma.module.create>>;
let moduleB: typeof moduleA;
let payments: Awaited<ReturnType<typeof prisma.chapter.create>>;
let deployment: typeof payments;
let enrollment: Awaited<ReturnType<typeof prisma.enrollment.create>>;
let token = "", strangerToken = "", blockId = "", responseId = "";
let currentPlan: ImportPlan;
const headers = () => ({ Authorization: `Bearer ${token}` });
const endpoint = () => `/api/v1/teach/courses/${course.id}/import`;

beforeEach(async () => {
  const tag = randomUUID();
  owner = await prisma.user.create({ data: { email: `zip-owner-${tag}@test.local`, role: "MENTOR", emailVerified: new Date(), zipImportEnabled: true } });
  stranger = await prisma.user.create({ data: { email: `zip-stranger-${tag}@test.local`, role: "MENTOR", emailVerified: new Date(), zipImportEnabled: true } });
  learner = await prisma.user.create({ data: { email: `zip-learner-${tag}@test.local`, role: "MENTEE", emailVerified: new Date() } });
  course = await prisma.course.create({ data: { slug: `zip-update-${tag}`, title: "Original title", mentorId: owner.id, status: "PUBLISHED", publishedAt: new Date() } });
  moduleA = await prisma.module.create({ data: { courseId: course.id, contentKey: "checkout", title: "Checkout", order: 1 } });
  moduleB = await prisma.module.create({ data: { courseId: course.id, contentKey: "operations", title: "Operations", order: 2 } });
  payments = await prisma.chapter.create({ data: { courseId: course.id, moduleId: moduleA.id, contentKey: "payments", title: "Payments", slug: "payments", source: paymentText, compiled: paymentText, order: 1, publishedAt: new Date(), estimatedMinutes: 10 } });
  deployment = await prisma.chapter.create({ data: { courseId: course.id, moduleId: moduleB.id, contentKey: "deployment", title: "Deployment", slug: "deployment", source: deploymentText, compiled: deploymentText, order: 1, publishedAt: new Date(), estimatedMinutes: 10 } });
  enrollment = await prisma.enrollment.create({ data: { courseId: course.id, userId: learner.id, lifecycle: "ACTIVE", status: "COMPLETED", percentComplete: 100, chaptersCompleted: 2, lastActiveAt: new Date("2026-01-01"), completedAt: new Date("2026-01-02") } });
  for (const chapter of [payments, deployment]) await prisma.chapterProgress.create({ data: { enrollmentId: enrollment.id, chapterId: chapter.id, status: "COMPLETED", timeSpentSeconds: 123, startedAt: new Date("2026-01-01"), completedAt: new Date("2026-01-02"), learningLog: { notes: "Keep my notes" } } });
  blockId = `original-${tag}`;
  await prisma.block.create({ data: { id: blockId, chapterId: payments.id, type: "OPEN_QUESTION", order: 1, config: { prompt: "Explain checkout safety" } } });
  responseId = (await prisma.response.create({ data: { blockId, userId: learner.id, enrollmentId: enrollment.id, payload: { answer: "My submission" }, status: "SUBMITTED" } })).id;
  token = (await createSession(owner.id)).sessionToken;
  strangerToken = (await createSession(stranger.id)).sessionToken;
  currentPlan = plan([{ key: "checkout", title: "Checkout", lessons: [{ ...lesson("Payments", paymentText, [{ id: "incoming-activity", type: "OPEN_QUESTION", config: { prompt: "Explain checkout safety" }, required: true }]), key: "payments" }] }, { key: "operations", title: "Operations", lessons: [{ ...lesson("Deployment", deploymentText), key: "deployment" }] }]);
  vi.mocked(parseCourseZip).mockImplementation(async () => ({ slug: course.slug, plan: structuredClone(currentPlan) }));
});

afterEach(async () => {
  if (course) await prisma.course.delete({ where: { id: course.id } });
  if (owner) await prisma.user.deleteMany({ where: { id: { in: [owner.id, stranger.id, learner.id] } } });
});

async function preview() {
  const result = await request(app).post(`${endpoint()}/preview`).set(headers()).set("Content-Type", "application/zip").send(Buffer.from("test package"));
  expect(result.status, JSON.stringify(result.body)).toBe(200);
  return result.body.data as CourseUpdatePreview;
}
async function approve(previewId: string) {
  return request(app).post(`${endpoint()}/approve`).set(headers()).send({ previewId, confirm: true });
}

describe("ZIP update preview and approval", () => {
  it("rejects a declared creation package on the update path", async () => {
    currentPlan.manifest.publication = "create";
    const wrongUpdate = await request(app).post(`${endpoint()}/preview`).set(headers())
      .set("Content-Type", "application/zip").send(Buffer.from("test package"));
    expect(wrongUpdate.status).toBe(400);
    expect(await prisma.course.count({ where: { slug: course.slug } })).toBe(1);
  });

  it("adopts stable keys on a legacy chapter without replacing unchanged learner work", async () => {
    await prisma.module.update({ where: { id: moduleB.id }, data: { contentKey: null } });
    await prisma.chapter.update({ where: { id: deployment.id }, data: { contentKey: null } });
    currentPlan.modules = [currentPlan.modules[1]];
    const diff = await preview();
    expect(diff.modules[0].chapters[0].action).toBe("unchanged");
    expect((await approve(diff.previewId)).status).toBe(200);
    const active = await prisma.course.findUniqueOrThrow({ where: { id: course.id }, select: { activeReleaseId: true } });
    const release = await prisma.courseRelease.findUniqueOrThrow({ where: { id: active.activeReleaseId! } });
    const adopted = (release.content as any).variants.default.find((module: any) => module.key === "operations");
    expect(adopted.id).toBe(moduleB.id);
    expect(adopted.chapters[0]).toMatchObject({ id: deployment.id, key: "deployment" });
    expect(await prisma.chapterProgress.count({ where: { enrollmentId: enrollment.id } })).toBe(2);
  });

  it("repairs legacy numeric quiz labels during an update while retaining activity responses", async () => {
    const options = [1, 2, 20, 21].map((label, i) => ({ id: `opt-${i}`, label }));
    const config = { quizType: "single", prompt: "How many queries?", options, correctOptionIds: ["opt-3"], allowRetry: true };
    await prisma.block.update({ where: { id: blockId }, data: { type: "QUIZ", config } });
    await prisma.chapter.update({ where: { id: payments.id }, data: { readerMode: "QUIZ", source: `<Quiz id="${blockId}" />`, compiled: `<Quiz id="${blockId}" />` } });
    const incoming = currentPlan.modules[0].lessons[0];
    incoming.readerMode = "QUIZ";
    incoming.source = '<Quiz id="incoming-activity" />';
    incoming.blocks = [{ id: "incoming-activity", type: "QUIZ", required: true, config: { ...config, options: options.map(option => ({ ...option, label: String(option.label) })) } }];
    const diff = await preview();
    expect(diff.modules[0].chapters[0].action).toBe("unchanged");
    expect((await approve(diff.previewId)).status).toBe(200);
    expect(await prisma.block.findUniqueOrThrow({ where: { id: blockId } })).toMatchObject({ archivedAt: null, chapterId: payments.id, config });
    const active = await prisma.course.findUniqueOrThrow({ where: { id: course.id }, select: { activeReleaseId: true } });
    const release = await prisma.courseRelease.findUniqueOrThrow({ where: { id: active.activeReleaseId! } });
    const newChapterId = (release.content as any).variants.default[0].chapters[0].id as string;
    expect(newChapterId).not.toBe(payments.id);
    expect((await prisma.block.findFirstOrThrow({ where: { chapterId: newChapterId } })).config).toMatchObject({ options: options.map(option => ({ ...option, label: String(option.label) })) });
    expect(await prisma.block.count({ where: { chapterId: payments.id, archivedAt: null } })).toBe(1);
    expect(await prisma.response.findUnique({ where: { id: responseId } })).not.toBeNull();
  });

  it("previews a cross-module move without mutation, then retains chapter, block and learner identities", async () => {
    const paymentLesson = currentPlan.modules[0].lessons[0];
    currentPlan.modules[0].lessons = [currentPlan.modules[1].lessons[0]];
    currentPlan.modules[1].lessons = [paymentLesson];
    const diff = await preview();
    expect(diff.modules[1].chapters[0]).toMatchObject({ title: "Payments", action: "moved", previousModule: "Checkout" });
    expect((await prisma.chapter.findUniqueOrThrow({ where: { id: payments.id } })).moduleId).toBe(moduleA.id);
    const before = await prisma.chapterProgress.findMany({ where: { enrollmentId: enrollment.id }, orderBy: { id: "asc" } });
    expect((await approve(diff.previewId)).status).toBe(200);
    expect(await prisma.chapter.findUniqueOrThrow({ where: { id: payments.id } })).toMatchObject({ moduleId: moduleA.id, slug: "payments", archivedAt: null });
    const latest = await prisma.course.findUniqueOrThrow({ where: { id: course.id }, select: { activeReleaseId: true } });
    const release = await prisma.courseRelease.findUniqueOrThrow({ where: { id: latest.activeReleaseId! } });
    expect((release.content as any).variants.default.find((module: any) => module.id === moduleB.id).chapters.some((chapter: any) => chapter.id === payments.id)).toBe(true);
    expect(await prisma.chapterProgress.findMany({ where: { enrollmentId: enrollment.id }, orderBy: { id: "asc" } })).toEqual(before);
    expect(await prisma.block.findUniqueOrThrow({ where: { id: blockId } })).toMatchObject({ chapterId: payments.id, archivedAt: null });
    expect(await prisma.response.findUnique({ where: { id: responseId } })).not.toBeNull();
    expect(await prisma.course.findUniqueOrThrow({ where: { id: course.id } })).toMatchObject({ mentorId: owner.id, title: "Original title", status: "PUBLISHED" });
    expect(await prisma.enrollment.findUniqueOrThrow({ where: { id: enrollment.id } })).toMatchObject({ percentComplete: 100, lastActiveAt: enrollment.lastActiveAt });
    expect((await approve(diff.previewId)).status).toBe(409);
  });

  it("keeps omitted modules and chapters, and removes them only when explicitly listed", async () => {
    const original = structuredClone(currentPlan);
    currentPlan.modules = [currentPlan.modules[0]];
    const diff = await preview();
    expect(diff.modules.find(m => m.title === "Operations")).toBeUndefined();
    expect((await approve(diff.previewId)).status).toBe(200);
    expect((await prisma.chapter.findUniqueOrThrow({ where: { id: deployment.id } })).archivedAt).toBeNull();
    expect((await loadCourseGate(course.id, enrollment.id))?.orderedIds).toEqual([payments.id, deployment.id]);
    expect(await prisma.chapterProgress.count({ where: { enrollmentId: enrollment.id } })).toBe(2);
    currentPlan = { ...original, remove: { moduleKeys: [], lessonKeys: ["deployment"] } };
    const removal = await preview();
    expect(removal.modules.some(module => module.action === "removed")).toBe(true);
    expect((await approve(removal.previewId)).status).toBe(200);
    const latest = await prisma.course.findUniqueOrThrow({ where: { id: course.id }, select: { activeReleaseId: true } });
    const release = await prisma.courseRelease.findUniqueOrThrow({ where: { id: latest.activeReleaseId! } });
    expect((release.content as any).variants.default.flatMap((module: any) => module.chapters).some((chapter: any) => chapter.key === "deployment")).toBe(false);
    expect(await prisma.chapterProgress.findUniqueOrThrow({ where: { enrollmentId_chapterId: { enrollmentId: enrollment.id, chapterId: deployment.id } } })).toMatchObject({ status: "COMPLETED", timeSpentSeconds: 123 });
  });

  it("rejects stale, expired, unconfirmed and another instructor's approvals", async () => {
    const diff = await preview();
    expect((await request(app).post(`${endpoint()}/approve`).set(headers()).send({ previewId: diff.previewId })).status).toBe(400);
    expect((await request(app).post(`${endpoint()}/approve`).set({ Authorization: `Bearer ${strangerToken}` }).send({ previewId: diff.previewId, confirm: true })).status).toBe(403);
    await prisma.chapter.update({ where: { id: payments.id }, data: { source: "A concurrent edit" } });
    expect((await approve(diff.previewId)).status).toBe(409);
    const latest = await preview();
    await prisma.courseImportPreview.update({ where: { id: latest.previewId }, data: { expiresAt: new Date(0) } });
    expect((await approve(latest.previewId)).status).toBe(409);
  });

  it("does not create another release for an unchanged package", async () => {
    const first = await preview();
    expect((await approve(first.previewId)).status).toBe(200);
    const count = await prisma.courseRelease.count({ where: { courseId: course.id } });
    const second = await preview();
    expect((await approve(second.previewId)).status).toBe(200);
    expect(await prisma.courseRelease.count({ where: { courseId: course.id } })).toBe(count);
  });

  it("can restore an explicitly removed module without a new course", async () => {
    currentPlan.modules = [currentPlan.modules[0]];
    currentPlan.remove = { moduleKeys: ["operations"], lessonKeys: [] };
    expect((await approve((await preview()).previewId)).status).toBe(200);
    currentPlan = plan([{ key: "operations", title: "Operations", lessons: [{ ...lesson("Deployment", deploymentText), key: "deployment" }] }]);
    expect((await approve((await preview()).previewId)).status).toBe(200);
    expect(await prisma.course.count({ where: { slug: course.slug } })).toBe(1);
    const active = await prisma.course.findUniqueOrThrow({ where: { id: course.id }, select: { activeReleaseId: true } });
    const release = await prisma.courseRelease.findUniqueOrThrow({ where: { id: active.activeReleaseId! } });
    expect((release.content as any).variants.default.some((module: any) => module.key === "operations")).toBe(true);
  });

  it("creates new chapters and changed activities without overwriting old responses", async () => {
    currentPlan.modules[0].lessons[0].blocks[0].config = { prompt: "Explain checkout safety and validate the receipt" };
    currentPlan.modules[1].lessons.push({ ...lesson("Caching", "Cache product listings with a short expiry and invalidate entries after inventory updates."), lessonNum: 2, key: "caching" });
    const diff = await preview();
    expect((await approve(diff.previewId)).status).toBe(200);
    expect((await prisma.block.findUniqueOrThrow({ where: { id: blockId } })).archivedAt).toBeNull();
    expect(await prisma.response.findUnique({ where: { id: responseId } })).not.toBeNull();
    const added = await prisma.chapter.findFirstOrThrow({ where: { courseId: course.id, title: "Caching" } });
    expect(added.publishedAt).not.toBeNull();
    expect(added.compiled).toBe(added.source);
    expect((await prisma.enrollment.findUniqueOrThrow({ where: { id: enrollment.id } })).percentComplete).toBe(100);
    const pinned = await prisma.enrollment.findUniqueOrThrow({ where: { id: enrollment.id } });
    const oldRelease = await releaseForEnrollment(course.id, pinned, null);
    expect(oldRelease?.modules[0].chapters[0].id).toBe(payments.id);
    const builder = await loadCourseBuilder(owner, course.slug);
    expect(builder.course.modules.flatMap(module => module.chapters).filter(chapter => chapter.title === "Payments")).toHaveLength(1);
  });

  it("materializes shared and variant chapters while old learners keep their original release", async () => {
    await prisma.course.update({ where: { id: course.id }, data: { familySlug: "multi-vendor-marketplace" } });
    await prisma.enrollment.update({ where: { id: enrollment.id }, data: { variantSlug: "books", variantLockedAt: new Date() } });
    currentPlan.modules[0].lessons[0].source = "Shared checkout rules now include chargeback checks.";
    currentPlan.variants = [{ slug: "books", overrides: [{ lessonKey: "payments", lesson: {
      ...currentPlan.modules[0].lessons[0], source: "Books checkout uses edition and copy IDs.",
    } }] }];
    const diff = await preview();
    expect(diff.variants?.find(variant => variant.slug === "books")?.affectedLessons).toContain("payments");
    expect((await approve(diff.previewId)).status).toBe(200);
    const old = await prisma.enrollment.findUniqueOrThrow({ where: { id: enrollment.id } });
    const oldRelease = await releaseForEnrollment(course.id, old, "multi-vendor-marketplace");
    expect(oldRelease?.modules[0].chapters[0].id).toBe(payments.id);
    const newcomer = await prisma.user.create({ data: { email: `zip-new-${randomUUID()}@test.local`, role: "MENTEE", emailVerified: new Date() } });
    try {
      const next = await prisma.enrollment.create({ data: { courseId: course.id, userId: newcomer.id, variantSlug: "books", lifecycle: "ACTIVE" } });
      const books = await releaseForEnrollment(course.id, next, "multi-vendor-marketplace");
      expect(books?.modules[0].chapters[0].id).not.toBe(payments.id);
      const grocery = await releaseForEnrollment(course.id, { releaseId: null, variantSlug: "grocery" }, "multi-vendor-marketplace");
      expect(grocery?.modules[0].chapters[0].id).not.toBe(books?.modules[0].chapters[0].id);
      const token = (await createSession(newcomer.id)).sessionToken;
      const reader = await request(app).get(`/api/v1/courses/${course.slug}/chapters/payments`).set({ Authorization: `Bearer ${token}` });
      expect(reader.status, JSON.stringify(reader.body)).toBe(200);
      expect(reader.body.data.content.source).toContain("Books checkout uses edition and copy IDs.");
      expect((await prisma.enrollment.findUniqueOrThrow({ where: { id: next.id } })).releaseId).toBe(books?.release.id);
    } finally {
      await prisma.user.delete({ where: { id: newcomer.id } });
    }
    expect((await prisma.chapterProgress.findUniqueOrThrow({ where: { enrollmentId_chapterId: { enrollmentId: enrollment.id, chapterId: payments.id } } })).status).toBe("COMPLETED");
  });

  it("locks a legacy learner's default variant when pinning their existing work", async () => {
    await prisma.course.update({ where: { id: course.id }, data: { familySlug: "multi-vendor-marketplace" } });
    expect((await approve((await preview()).previewId)).status).toBe(200);
    const old = await prisma.enrollment.findUniqueOrThrow({ where: { id: enrollment.id } });
    expect(old.releaseId).not.toBeNull();
    expect(old.variantSlug).toBe("grocery");
    expect(old.variantLockedAt).not.toBeNull();
  });

  it("enforces ZIP capability and course scope before parsing; rejects a mismatched slug", async () => {
    vi.mocked(parseCourseZip).mockClear();
    expect((await request(app).post(`${endpoint()}/preview`).set({ Authorization: `Bearer ${strangerToken}` }).set("Content-Type", "application/zip").send(Buffer.from("zip"))).status).toBe(403);
    expect(parseCourseZip).not.toHaveBeenCalled();
    vi.mocked(parseCourseZip).mockResolvedValueOnce({ slug: "another-course", plan: currentPlan });
    expect((await request(app).post(`${endpoint()}/preview`).set(headers()).set("Content-Type", "application/zip").send(Buffer.from("zip"))).status).toBe(400);
    await prisma.user.update({ where: { id: owner.id }, data: { zipImportEnabled: false } });
    expect((await request(app).post(`${endpoint()}/preview`).set(headers()).set("Content-Type", "application/zip").send(Buffer.from("zip"))).status).toBe(403);
  });

  it("rejects a ZIP that drops stable keys from an already keyed course", async () => {
    const result = await request(app).post(`${endpoint()}/preview`).set(headers()).set("Content-Type", "application/zip").send(Buffer.from("test package"));
    expect(result.status).toBe(200);
    currentPlan.modules[0].lessons[0].key = undefined;
    const rejected = await request(app).post(`${endpoint()}/preview`).set(headers()).set("Content-Type", "application/zip").send(Buffer.from("test package"));
    expect(rejected.status).toBe(400);
    expect(JSON.stringify(rejected.body)).toContain("Include a key for every supplied module and lesson");
  });
});

describe("a rewritten lesson in a course without stable keys", () => {
  const rewritten = "Refunds follow a different path from charges. Look up the original order, confirm the amount with the bank, write the reversal in the ledger and email the buyer a note.";
  // The course is addressed by file position, the way a repository course without keys is.
  const unkeyed = async () => {
    await prisma.module.updateMany({ where: { courseId: course.id }, data: { contentKey: null } });
    await prisma.chapter.update({ where: { id: payments.id }, data: { contentKey: null, slug: "1-1-lesson" } });
    await prisma.chapter.update({ where: { id: deployment.id }, data: { contentKey: null, slug: "2-1-lesson" } });
    currentPlan = plan([{ title: "Checkout", lessons: [lesson("Payments", rewritten)] }, { title: "Operations", lessons: [lesson("Deployment", deploymentText)] }]);
  };
  const sharedChapters = async () => {
    const selected = await releaseForEnrollment(course.id, { releaseId: null, variantSlug: null }, null);
    return selected!.modules.flatMap(module => module.chapters);
  };

  it("replaces the chapter at the same address instead of listing the lesson twice", async () => {
    await unkeyed();
    const previewed = await preview();
    // Too different to match by content, so the preview calls it new.
    expect(previewed.modules[0].chapters[0].action).toBe("added");
    expect((await approve(previewed.previewId)).status).toBe(200);

    const chapters = await sharedChapters();
    expect(chapters.map(chapter => chapter.slug)).toEqual(["1-1-lesson", "2-1-lesson"]);
    expect(chapters[0].id).not.toBe(payments.id);
    expect((await prisma.chapter.findUniqueOrThrow({ where: { id: chapters[0].id } })).source).toBe(rewritten);
    // The earlier row stays for learners pinned to the first release.
    expect(await prisma.chapter.count({ where: { id: payments.id, archivedAt: null } })).toBe(1);
  });

  it("reads a stored release that holds two chapters at one address as the later one only", async () => {
    await unkeyed();
    const previewed = await preview();
    expect((await approve(previewed.previewId)).status).toBe(200);
    // Put the pair back the way a publish before this fix stored it.
    const active = await prisma.course.findUniqueOrThrow({ where: { id: course.id }, select: { activeReleaseId: true } });
    const release = await prisma.courseRelease.findUniqueOrThrow({ where: { id: active.activeReleaseId! } });
    const content = structuredClone(release.content) as { variants: Record<string, { chapters: { id: string; slug: string; title: string; order: number }[] }[]> };
    const replacement = content.variants.default[0].chapters[0];
    content.variants.default[0].chapters = [{ ...replacement, id: payments.id }, replacement];
    await prisma.courseRelease.update({ where: { id: release.id }, data: { content } });

    const chapters = await sharedChapters();
    expect(chapters.map(chapter => chapter.id)).toEqual([replacement.id, chapters[1].id]);

    // A new learner's reader lists the lesson once and opens the current version.
    const fresh = await prisma.user.create({ data: { email: `zip-fresh-${randomUUID()}@test.local`, role: "MENTEE", emailVerified: new Date() } });
    try {
      await prisma.enrollment.create({ data: { courseId: course.id, userId: fresh.id, lifecycle: "ACTIVE" } });
      const session = await createSession(fresh.id);
      const reader = await request(app).get(`/api/v1/courses/${course.slug}/chapters/1-1-lesson`).set({ Authorization: `Bearer ${session.sessionToken}` });
      expect(reader.status, JSON.stringify(reader.body)).toBe(200);
      expect(reader.body.data.chapter.id).toBe(replacement.id);
      expect(reader.body.data.modules.flatMap((module: { chapters: { title: string }[] }) => module.chapters.map(chapter => chapter.title))).toEqual(["Payments", "Deployment"]);
    } finally {
      await prisma.user.delete({ where: { id: fresh.id } });
    }
  });
});
