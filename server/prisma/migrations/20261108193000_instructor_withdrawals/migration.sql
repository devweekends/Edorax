CREATE TYPE "InstructorWithdrawalStatus" AS ENUM ('REQUESTED', 'PAID', 'REJECTED');

CREATE TABLE "InstructorWithdrawal" (
  "id" TEXT NOT NULL,
  "instructorId" TEXT NOT NULL,
  "amountCents" INTEGER NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'USD',
  "status" "InstructorWithdrawalStatus" NOT NULL DEFAULT 'REQUESTED',
  "note" VARCHAR(240) NOT NULL,
  "paymentIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolvedAt" TIMESTAMP(3),
  "resolvedById" TEXT,
  CONSTRAINT "InstructorWithdrawal_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "InstructorWithdrawal_instructorId_status_idx" ON "InstructorWithdrawal"("instructorId", "status");
CREATE INDEX "InstructorWithdrawal_status_requestedAt_idx" ON "InstructorWithdrawal"("status", "requestedAt");

ALTER TABLE "InstructorWithdrawal"
  ADD CONSTRAINT "InstructorWithdrawal_instructorId_fkey"
  FOREIGN KEY ("instructorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Payment" ADD COLUMN "payoutWithdrawalId" TEXT;
CREATE INDEX "Payment_instructorPayoutStatus_status_idx" ON "Payment"("instructorPayoutStatus", "status");
CREATE INDEX "Payment_payoutWithdrawalId_idx" ON "Payment"("payoutWithdrawalId");
ALTER TABLE "Payment"
  ADD CONSTRAINT "Payment_payoutWithdrawalId_fkey"
  FOREIGN KEY ("payoutWithdrawalId") REFERENCES "InstructorWithdrawal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Older payments stored the charged amount but left the snapshot columns at zero.
UPDATE "Payment"
SET
  "originalAmountCents" = CASE WHEN "originalAmountCents" = 0 THEN GREATEST("amountCents", "instructorShareCents") ELSE "originalAmountCents" END,
  "learnerAmountCents" = CASE WHEN "learnerAmountCents" = 0 THEN "amountCents" ELSE "learnerAmountCents" END
WHERE "status" IN ('SUCCEEDED', 'PENDING')
  AND ("originalAmountCents" = 0 OR "learnerAmountCents" = 0)
  AND ("amountCents" > 0 OR "instructorShareCents" > 0);
