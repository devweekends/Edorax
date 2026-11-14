-- Shell labs served to the desktop app. Additive: one new table.
CREATE TABLE "shell_labs" (
    "slug" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "minutes" INTEGER NOT NULL,
    "position" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "contentHash" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shell_labs_pkey" PRIMARY KEY ("slug")
);

-- CreateIndex
CREATE INDEX "shell_labs_active_position_idx" ON "shell_labs"("active", "position");
