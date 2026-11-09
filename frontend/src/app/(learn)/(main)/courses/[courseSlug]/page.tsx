import type { Metadata } from "next";
import { cache } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, Lock } from "lucide-react";
import type { CourseOverview } from "@/shared/api/catalog";
import { requireLearnSurface } from "@/server/auth/guards";
import { serverApiFetchOrNotFound } from "@/lib/api-server";
import { CourseOverviewContent } from "@buildment/learning-ui/components/learn/course-overview-content";
import { WebCourseNavigation } from "@/components/learn/course-navigation";
import { chooseCourseSpecialisationAction, upgradeCourseCurriculumAction } from "@/server/actions/course-track";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { CourseRatingCard } from "@/components/learn/course-rating-card";
import { CourseRatingLink } from "@/components/learn/course-rating-link";

const loadOverview = cache((courseSlug: string) =>
  serverApiFetchOrNotFound<CourseOverview>(`/api/v1/courses/${encodeURIComponent(courseSlug)}/overview`)
);

export async function generateMetadata({ params }: { params: Promise<{ courseSlug: string }> }): Promise<Metadata> {
  const { courseSlug } = await params;
  try {
    const { course } = await loadOverview(courseSlug);
    return { title: course.title, robots: { index: false, follow: false } };
  } catch {
    return { robots: { index: false, follow: false } };
  }
}

export default async function CourseOverviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ courseSlug: string }>;
  searchParams: Promise<{ start?: string }>;
}) {
  const { courseSlug } = await params;
  const { start } = await searchParams;

  await requireLearnSurface();
  const overview = await loadOverview(courseSlug);
  const { course, enrollment, syllabus } = overview;

  if (overview.access === "none" || !enrollment) {
    return (
      <div className="mx-auto max-w-4xl px-6 py-10">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Back to dashboard
        </Link>
        <div className="mt-16 flex flex-col items-center text-center">
          <Lock className="size-8 text-muted-foreground/50" aria-hidden />
          <p className="mt-3 text-sm font-medium text-foreground">
            You don&apos;t have access to this course
          </p>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
            Enroll from the catalog, use a mentor invite, or ask to be assigned.
          </p>
          {course.status === "PUBLISHED" ? (
            <Link href={`/catalog/${course.slug}`} className={cn(buttonVariants(), "mt-6")}>
              View in catalog
            </Link>
          ) : null}
        </div>
      </div>
    );
  }

  if (overview.access === "payment_required" || !syllabus) {
    return (
      <div className="mx-auto max-w-4xl px-6 py-10">
        <Link
          href="/my-courses"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          My learning
        </Link>
        <div className="mt-16 flex flex-col items-center text-center">
          <Lock className="size-8 text-muted-foreground/50" aria-hidden />
          <p className="mt-3 text-sm font-medium text-foreground">Payment required</p>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
            Complete purchase to unlock chapters and submissions for {course.title}.
          </p>
          <Link
            href={`/courses/${course.slug}/checkout`}
            className={cn(buttonVariants(), "mt-6")}
          >
            Purchase
          </Link>
        </div>
      </div>
    );
  }

  const { continueHref } = syllabus;
  const { track } = overview;

  // A course in a family starts with the variant choice, whichever way the learner enrolled.
  // The picker sends finished learners back here, so they are never sent to it.
  if (track && !track.variantChosen && !track.variantLocked && enrollment.chaptersCompleted === 0) {
    redirect(`/courses/${course.slug}/variant`);
  }
  // Enroll, sign-up and the variant picker send ?start=1: open the lesson to read next, like a player.
  if (start === "1" && continueHref) redirect(continueHref);

  const canRateCourse =
    enrollment.status === "COMPLETED" ||
    enrollment.percentComplete > 50 ||
    (syllabus.chapterCount > 0 && enrollment.chaptersCompleted * 2 > syllabus.chapterCount);

  return (
    <WebCourseNavigation>
      <CourseOverviewContent
        overview={overview}
        onChooseSpecialisation={chooseCourseSpecialisationAction}
        onUpgradeCurriculum={async () => {
          "use server";
          await upgradeCourseCurriculumAction(course.slug);
        }}
        ratingLink={
          canRateCourse && !overview.rating && overview.ratingDismissed ? (
            <CourseRatingLink courseSlug={course.slug} courseTitle={course.title} />
          ) : null
        }
        ratingBanner={
          canRateCourse && (overview.rating || !overview.ratingDismissed) ? (
            <CourseRatingCard
              courseSlug={course.slug}
              courseTitle={course.title}
              initialRating={overview.rating}
              initialDismissed={overview.ratingDismissed}
            />
          ) : null
        }
      />
    </WebCourseNavigation>
  );
}
