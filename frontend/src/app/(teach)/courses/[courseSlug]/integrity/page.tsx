import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import type { IntegrityOverview } from "@/shared/api/integrity";
import { requireTeachSurface } from "@/server/auth/guards";
import { serverApiFetchOrNotFound } from "@/lib/api-server";
import { IntegrityOverviewBoard } from "@/components/teach/integrity/integrity-overview";

export default async function CourseIntegrityPage({ params }: { params: Promise<{ courseSlug: string }> }) {
  const { courseSlug } = await params;
  await requireTeachSurface();
  const overview = await serverApiFetchOrNotFound<IntegrityOverview>(
    `/api/v1/teach/courses/${encodeURIComponent(courseSlug)}/integrity/overview`
  );

  return (
    <div className="space-y-6 pb-12">
      <header>
        <Link href={`/courses/${courseSlug}/mentees`} className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground">
          <ArrowLeft className="size-3.5" /> All mentees
        </Link>
        <p className="mt-3 text-sm font-medium text-muted-foreground">{overview.course.title}</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">Quiz integrity</h1>
        <p className="mt-2 max-w-3xl text-sm text-muted-foreground">Real-time view of quiz sittings, flagged attempts and answer similarity for this course.</p>
      </header>
      <IntegrityOverviewBoard initial={overview} courseSlug={courseSlug} />
    </div>
  );
}
