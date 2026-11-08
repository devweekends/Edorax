-- CreateTable
CREATE TABLE "CourseOrganizationAccess" (
    "courseId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CourseOrganizationAccess_pkey" PRIMARY KEY ("courseId","organizationId")
);

-- CreateIndex
CREATE INDEX "CourseOrganizationAccess_organizationId_idx" ON "CourseOrganizationAccess"("organizationId");

-- AddForeignKey
ALTER TABLE "CourseOrganizationAccess" ADD CONSTRAINT "CourseOrganizationAccess_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseOrganizationAccess" ADD CONSTRAINT "CourseOrganizationAccess_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
