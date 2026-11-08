import { raw, Router } from "express";
import * as teach from "../../controllers/teach.js";
import * as media from "../../controllers/course-media.js";
import * as integrity from "../../controllers/integrity.js";
import { authenticate } from "../../middlewares/authenticate.js";
import { requireInstructor } from "../../middlewares/require-instructor.js";
import { requireVerified } from "../../middlewares/require-verified.js";
import { requireZipImport } from "../../middlewares/require-zip-import.js";
import { validate, validateBody, validateParams } from "../../middlewares/validate.js";
import {
  assignByEmailsBody,
  approveCourseZipUpdateBody,
  campaignIdParams,
  chapterDraftBody,
  chapterIdParams,
  courseInstructorInviteBody,
  courseInstructorInviteParams,
  courseInstructorMemberParams,
  courseInstructorPendingInviteParams,
  chapterSettingsBody,
  courseIdParams,
  courseCouponParams,
  courseSettingsBody,
  courseSlugParams,
  createInstructorCouponBody,
  instructorCouponActiveBody,
  createChapterBody,
  createCourseBody,
  createModuleBody,
  deleteCourseBody,
  enrollmentIdParams,
  freeOrganizationsBody,
  helpInboxQuery,
  inviteParams,
  menteeParams,
  moduleIdParams,
  moveBody,
  participateCampaignBody,
  renameModuleBody,
  removeChapterBody,
  reportsQuery,
  requestIdParams,
  requestWithdrawalBody,
  responseIdParams,
  reviewOrgCourseRequestBody,
  reviewQueueQuery,
  submitReviewBody,
  unpublishCourseBody,
} from "../../validations/teach.js";
import { attemptParams, courseIntegrityBody } from "../../validations/integrity.js";

// Instructor workspace. Ownership of each course is checked in the services;
// this router only guarantees a verified instructor is calling.
const router = Router();

router.use(authenticate, requireVerified, requireInstructor);

router.get("/workspace", teach.getWorkspace);
router.get("/wallet", teach.getWallet);
router.post("/wallet/withdraw", validateBody(requestWithdrawalBody), teach.requestWithdrawal);
router.get("/campaigns", teach.getCampaigns);
router.post("/campaigns/:campaignId/participate", validate({ params: campaignIdParams, body: participateCampaignBody }), teach.participateCampaign);
router.get("/organizations", teach.getOrganizations);
router.post("/courses/:courseId/free-organizations", validate({ params: courseIdParams, body: freeOrganizationsBody }), teach.setCourseFreeOrganizations);
router.post("/organization-requests/:requestId/review", validate({ params: requestIdParams, body: reviewOrgCourseRequestBody }), teach.reviewOrgRequest);




router.get("/courses", teach.listCourses);
router.post("/courses/import", requireZipImport, raw({ type: "application/zip", limit: "5mb" }), teach.importCourseZip);
router.post("/courses/:courseId/import/preview", requireZipImport, validateParams(courseIdParams), raw({ type: "application/zip", limit: "5mb" }), teach.previewCourseZipUpdate);
router.post("/courses/:courseId/import/approve", requireZipImport, validate({ params: courseIdParams, body: approveCourseZipUpdateBody }), teach.approveCourseZipUpdate);
router.post("/courses", validateBody(createCourseBody), teach.createCourse);
router.get("/courses/:courseSlug/builder", validateParams(courseSlugParams), teach.getCourseBuilder);
router.get("/courses/:courseSlug/settings", validateParams(courseSlugParams), teach.getCourseSettings);
router.get("/courses/:courseSlug/coupons", validateParams(courseSlugParams), teach.listCourseCoupons);
router.post("/courses/:courseId/coupons", validate({ params: courseIdParams, body: createInstructorCouponBody }), teach.createCourseCoupon);
router.patch("/courses/:courseId/coupons/:couponId", validate({ params: courseCouponParams, body: instructorCouponActiveBody }), teach.setCourseCouponActive);
router.get("/courses/:courseSlug/preview", validateParams(courseSlugParams), teach.getCourseDraftPreview);
router.get("/courses/:courseSlug/team", validateParams(courseSlugParams), teach.getCourseTeam);
router.post("/courses/:courseId/media/:purpose", raw({ type: "image/*", limit: "8mb" }), media.upload);
router.post("/courses/:courseId/instructor-invites", validate({ params: courseIdParams, body: courseInstructorInviteBody }), teach.inviteCourseInstructor);
router.post("/instructor-invites/:token/accept", validateParams(courseInstructorInviteParams), teach.acceptCourseInstructorInvite);
router.delete("/courses/:courseId/instructors/:userId", validateParams(courseInstructorMemberParams), teach.removeCourseInstructor);
router.delete("/courses/:courseId/instructor-invites/:inviteId", validateParams(courseInstructorPendingInviteParams), teach.revokeCourseInstructorInvite);
router.patch("/courses/:courseId/settings", validate({ params: courseIdParams, body: courseSettingsBody }), teach.updateCourseSettings);
router.put("/courses/:courseId/integrity", validate({ params: courseIdParams, body: courseIntegrityBody }), integrity.updateCourseSettings);
router.post("/courses/:courseId/chapters/publish", validateParams(courseIdParams), teach.publishCourseChapters);
router.post("/modules/:moduleId/chapters/publish", validateParams(moduleIdParams), teach.publishModuleChapters);
router.post("/courses/:courseId/publish", validateParams(courseIdParams), teach.publishCourse);
router.post("/courses/:courseId/unpublish", validate({ params: courseIdParams, body: unpublishCourseBody }), teach.unpublishCourse);
router.post("/courses/:courseId/restore", validateParams(courseIdParams), teach.restoreCourse);
router.delete("/courses/:courseId", validate({ params: courseIdParams, body: deleteCourseBody }), teach.deleteCourse);

router.post("/courses/:courseId/modules", validate({ params: courseIdParams, body: createModuleBody }), teach.createModule);
router.patch("/modules/:moduleId", validate({ params: moduleIdParams, body: renameModuleBody }), teach.renameModule);
router.post("/modules/:moduleId/move", validate({ params: moduleIdParams, body: moveBody }), teach.moveModule);

router.post("/courses/:courseId/chapters", validate({ params: courseIdParams, body: createChapterBody }), teach.createChapter);
router.post("/chapters/:chapterId/move", validate({ params: chapterIdParams, body: moveBody }), teach.moveChapter);
router.get("/chapters/:chapterId/editor", validateParams(chapterIdParams), teach.getChapterEditor);
router.patch("/chapters/:chapterId/settings", validate({ params: chapterIdParams, body: chapterSettingsBody }), teach.updateChapterSettings);
router.put("/chapters/:chapterId/draft", validate({ params: chapterIdParams, body: chapterDraftBody }), teach.saveChapterDraft);
router.post("/chapters/:chapterId/publish", validateParams(chapterIdParams), teach.publishChapter);
router.delete("/chapters/:chapterId", validate({ params: chapterIdParams, body: removeChapterBody }), teach.removeChapter);

router.get("/courses/:courseSlug/mentees", validateParams(courseSlugParams), teach.listMentees);
router.get("/courses/:courseSlug/mentees/:enrollmentId", validateParams(menteeParams), teach.getMenteeEvaluation);
router.post("/courses/:courseId/invites/assign", validate({ params: courseIdParams, body: assignByEmailsBody }), teach.assignByEmails);
router.post("/courses/:courseId/invites/link", validateParams(courseIdParams), teach.createInviteLink);
router.delete("/courses/:courseId/invites/:inviteId", validateParams(inviteParams), teach.revokeInvite);
router.post("/enrollments/:enrollmentId/nudge", validateParams(enrollmentIdParams), teach.nudgeMentee);
router.post("/enrollments/:enrollmentId/repair-progress", validateParams(enrollmentIdParams), teach.repairProgress);

router.get("/courses/:courseSlug/reports", validate({ params: courseSlugParams, query: reportsQuery }), teach.getCourseReport);
router.get("/courses/:courseSlug/reports/export", validateParams(courseSlugParams), teach.exportCourseReport);
router.get("/courses/:courseSlug/activity", validateParams(courseSlugParams), teach.getCourseActivity);

router.get("/review", validate({ query: reviewQueueQuery }), teach.getReviewQueue);
router.get("/review/:responseId", validateParams(responseIdParams), teach.getReviewDetail);
router.post("/review/:responseId", validate({ params: responseIdParams, body: submitReviewBody }), teach.submitReview);
router.post("/review/:responseId/ai-draft", validateParams(responseIdParams), teach.generateAiReviewDraft);

router.get("/integrity/attempts/:attemptId", validateParams(attemptParams), integrity.attemptDetail);

router.get("/help/threads", validate({ query: helpInboxQuery }), teach.getHelpInbox);

export default router;
