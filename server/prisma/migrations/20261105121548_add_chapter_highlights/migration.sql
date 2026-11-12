-- CreateEnum
CREATE TYPE "HighlightColor" AS ENUM ('YELLOW', 'GREEN', 'BLUE', 'PINK');

-- CreateTable
CREATE TABLE "ChapterHighlight" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "enrollmentId" TEXT NOT NULL,
    "chapterId" TEXT NOT NULL,
    "color" "HighlightColor" NOT NULL DEFAULT 'YELLOW',
    "quote" TEXT NOT NULL,
    "prefix" TEXT,
    "suffix" TEXT,
    "occurrence" INTEGER NOT NULL DEFAULT 0,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChapterHighlight_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ChapterHighlight_userId_createdAt_idx" ON "ChapterHighlight"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "ChapterHighlight_enrollmentId_chapterId_idx" ON "ChapterHighlight"("enrollmentId", "chapterId");

-- CreateIndex
CREATE INDEX "ChapterHighlight_chapterId_idx" ON "ChapterHighlight"("chapterId");

-- AddForeignKey
ALTER TABLE "ChapterHighlight" ADD CONSTRAINT "ChapterHighlight_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChapterHighlight" ADD CONSTRAINT "ChapterHighlight_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "Enrollment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChapterHighlight" ADD CONSTRAINT "ChapterHighlight_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "Chapter"("id") ON DELETE CASCADE ON UPDATE CASCADE;
