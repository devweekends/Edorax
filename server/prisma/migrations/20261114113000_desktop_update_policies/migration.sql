-- Forced desktop update policy, one row per platform, managed by admins. Additive only.
-- CreateEnum
CREATE TYPE "DesktopPlatform" AS ENUM ('DARWIN', 'WIN32', 'LINUX');

-- CreateTable
CREATE TABLE "desktop_update_policies" (
    "id" TEXT NOT NULL,
    "platform" "DesktopPlatform" NOT NULL,
    "minimumVersion" TEXT NOT NULL,
    "latestVersion" TEXT NOT NULL,
    "downloadUrl" TEXT NOT NULL,
    "message" TEXT NOT NULL DEFAULT '',
    "blockedVersions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT,

    CONSTRAINT "desktop_update_policies_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "desktop_update_policies_platform_key" ON "desktop_update_policies"("platform");

-- AddForeignKey
ALTER TABLE "desktop_update_policies" ADD CONSTRAINT "desktop_update_policies_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
