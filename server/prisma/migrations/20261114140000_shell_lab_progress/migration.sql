-- Passed steps of each shell lab, per learner. Additive: one new table.
CREATE TABLE "shell_lab_progress" (
    "userId" TEXT NOT NULL,
    "labSlug" TEXT NOT NULL,
    "steps" TEXT[],
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shell_lab_progress_pkey" PRIMARY KEY ("userId","labSlug")
);

ALTER TABLE "shell_lab_progress" ADD CONSTRAINT "shell_lab_progress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
