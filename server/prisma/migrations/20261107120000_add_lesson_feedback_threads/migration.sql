-- CreateEnum
CREATE TYPE "HelpThreadKind" AS ENUM ('QUESTION', 'LESSON_REPORT');

-- CreateEnum
CREATE TYPE "HelpThreadCategory" AS ENUM ('ERROR', 'TYPO', 'CONFUSING', 'BROKEN_LINK', 'SUGGESTION', 'OTHER');

-- AlterTable
ALTER TABLE "HelpThread" ADD COLUMN "kind" "HelpThreadKind" NOT NULL DEFAULT 'QUESTION',
ADD COLUMN "category" "HelpThreadCategory",
ADD COLUMN "blockId" TEXT,
ADD COLUMN "quote" TEXT;

-- CreateIndex
CREATE INDEX "HelpThread_courseId_kind_status_idx" ON "HelpThread"("courseId", "kind", "status");
