-- Secure exams, mentor review of flagged attempts, and the new integrity signals.

-- AlterEnum
ALTER TYPE "IntegrityEventType" ADD VALUE 'BLOCKED_APP';
ALTER TYPE "IntegrityEventType" ADD VALUE 'VIRTUAL_MACHINE';
ALTER TYPE "IntegrityEventType" ADD VALUE 'HEARTBEAT_GAP';
ALTER TYPE "IntegrityEventType" ADD VALUE 'TYPING_BURST';
ALTER TYPE "IntegrityEventType" ADD VALUE 'FACE_MISSING';
ALTER TYPE "IntegrityEventType" ADD VALUE 'FACE_MULTIPLE';

-- CreateEnum
CREATE TYPE "IntegrityMode" AS ENUM ('STANDARD', 'SECURE');

-- CreateEnum
CREATE TYPE "IntegrityReviewDecision" AS ENUM ('CLEARED', 'NEEDS_FOLLOWUP', 'CONFIRMED_VIOLATION');

-- AlterTable
ALTER TABLE "Course" ADD COLUMN     "integrityMode" "IntegrityMode" NOT NULL DEFAULT 'STANDARD';

-- AlterTable
ALTER TABLE "IntegrityAttempt" ADD COLUMN     "mode" "IntegrityMode" NOT NULL DEFAULT 'STANDARD';

-- CreateTable
CREATE TABLE "SecureExamSession" (
    "id" TEXT NOT NULL,
    "attemptId" TEXT NOT NULL,
    "consentedAt" TIMESTAMP(3) NOT NULL,
    "platform" VARCHAR(16) NOT NULL,
    "appVersion" VARCHAR(32) NOT NULL,
    "precheck" JSONB NOT NULL,
    "heartbeatCount" INTEGER NOT NULL DEFAULT 0,
    "lastHeartbeatAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "SecureExamSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntegrityReview" (
    "id" TEXT NOT NULL,
    "attemptId" TEXT NOT NULL,
    "decision" "IntegrityReviewDecision" NOT NULL,
    "note" VARCHAR(1000),
    "reviewerId" TEXT NOT NULL,
    "reviewerName" VARCHAR(120) NOT NULL,
    "reviewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IntegrityReview_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SecureExamSession_attemptId_key" ON "SecureExamSession"("attemptId");

-- CreateIndex
CREATE UNIQUE INDEX "IntegrityReview_attemptId_key" ON "IntegrityReview"("attemptId");

-- AddForeignKey
ALTER TABLE "SecureExamSession" ADD CONSTRAINT "SecureExamSession_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "IntegrityAttempt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegrityReview" ADD CONSTRAINT "IntegrityReview_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "IntegrityAttempt"("id") ON DELETE CASCADE ON UPDATE CASCADE;
