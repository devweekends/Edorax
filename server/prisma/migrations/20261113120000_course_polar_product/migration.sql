-- Each paid course gets its own Polar product on its first checkout.
ALTER TABLE "Course" ADD COLUMN "polarProductId" TEXT;

CREATE UNIQUE INDEX "Course_polarProductId_key" ON "Course"("polarProductId");
