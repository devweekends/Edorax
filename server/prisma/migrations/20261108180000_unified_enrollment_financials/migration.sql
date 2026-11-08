CREATE TYPE "OrganizationCreditTransactionStatus" AS ENUM ('RESERVED', 'COMMITTED', 'RELEASED');

ALTER TABLE "Course"
  ADD COLUMN "instructorPayoutPercent" INTEGER NOT NULL DEFAULT 70;

ALTER TABLE "Organization"
  ADD COLUMN "creditBalance" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "CourseOrganizationAccess" (
  "courseId" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CourseOrganizationAccess_pkey" PRIMARY KEY ("courseId", "organizationId"),
  CONSTRAINT "CourseOrganizationAccess_courseId_fkey"
    FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "CourseOrganizationAccess_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "CourseOrganizationAccess_organizationId_idx"
  ON "CourseOrganizationAccess"("organizationId");

CREATE TABLE "OrganizationCreditTransaction" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "enrollmentId" TEXT NOT NULL,
  "amountCredits" INTEGER NOT NULL,
  "status" "OrganizationCreditTransactionStatus" NOT NULL DEFAULT 'RESERVED',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "committedAt" TIMESTAMP(3),
  "releasedAt" TIMESTAMP(3),
  CONSTRAINT "OrganizationCreditTransaction_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "OrganizationCreditTransaction_enrollmentId_key" UNIQUE ("enrollmentId"),
  CONSTRAINT "OrganizationCreditTransaction_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "OrganizationCreditTransaction_enrollmentId_fkey"
    FOREIGN KEY ("enrollmentId") REFERENCES "Enrollment"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "OrganizationCreditTransaction_organizationId_status_idx"
  ON "OrganizationCreditTransaction"("organizationId", "status");

ALTER TABLE "Payment"
  ADD COLUMN "originalAmountCents" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "discountAmountCents" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "organizationContributionCents" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "learnerAmountCents" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "instructorPayoutPercent" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "platformRevenueCents" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "fundingSource" TEXT;
