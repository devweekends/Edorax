import type { Metadata } from "next";
import Link from "next/link";
import type { CatalogCourseDetail } from "@/shared/api/catalog";
import { getSessionUser } from "@/server/auth/guards";
import { cn } from "@/lib/utils";
import { SITE_SHARE_IMAGE, SITE_URL } from "@/lib/site";
import { serverApiFetch, serverApiFetchOrNotFound } from "@/lib/api-server";
import { selfEnrollInCourseAction } from "@/server/actions/enroll";
import { CourseCover } from "@/components/learn/course-cover";
import { formatPriceCents } from "@/lib/format-price";
import { buttonVariants } from "@/components/ui/button";
import { PendingSubmitButton } from "@/components/ui/pending-submit-button";
import { CourseProjectShowcase } from "@/components/learn/course-project-showcase";
import { CourseRoadmap } from "@/components/learn/course-roadmap";
import { CourseReviews, type CourseReviewsView } from "@/components/learn/course-reviews";
import { StarRating } from "@/components/learn/star-rating";

async function loadCourse(courseSlug: string) {
  return serverApiFetchOrNotFound<CatalogCourseDetail>(`/api/v1/catalog/${encodeURIComponent(courseSlug)}`);
}

async function loadReviews(courseSlug: string): Promise<CourseReviewsView | null> {
  try {
    return await serverApiFetch<CourseReviewsView>(
      `/api/v1/catalog/${encodeURIComponent(courseSlug)}/reviews?page=1&pageSize=5`
    );
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: { params: Promise<{ courseSlug: string }> }): Promise<Metadata> {
  const { courseSlug } = await params;
  const course = await loadCourse(courseSlug);
  const description = course.description ? course.description.slice(0, 300) : undefined;
  return {
    title: course.title,
    description,
    alternates: { canonical: `/catalog/${course.slug}` },
    openGraph: { type: "website", title: course.title, description, url: `/catalog/${course.slug}`, images: [course.coverUrl ?? SITE_SHARE_IMAGE] },
  };
}

// Inline JSON must not contain a raw "<" (it could close the script tag); JSON accepts the escaped form.
const LT_ESCAPE = String.fromCharCode(92) + "u003c";

/** Google's Course markup, so search can show the course with its provider and price. */
function courseJsonLd(course: CatalogCourseDetail) {
  return {
    "@context": "https://schema.org",
    "@type": "Course",
    name: course.title,
    description: course.description ?? course.title,
    url: `${SITE_URL}/catalog/${course.slug}`,
    provider: { "@type": "Organization", name: "Edorax", sameAs: SITE_URL },
    offers: {
      "@type": "Offer",
      category: course.pricingType === "PAID" ? "Paid" : "Free",
      price: course.pricingType === "PAID" ? course.priceCents / 100 : 0,
      priceCurrency: course.currency.toUpperCase(),
    },
    hasCourseInstance: { "@type": "CourseInstance", courseMode: "Online", courseWorkload: course.estimatedHours ? `PT${course.estimatedHours}H` : undefined },
  };
}

export default async function CatalogCoursePage({
  params,
}: {
  params: Promise<{ courseSlug: string }>;
}) {
  const { courseSlug } = await params;
  const user = await getSessionUser();
  const course = await loadCourse(courseSlug);
  const reviews = await loadReviews(course.slug);
  const hasAccess = course.access === "active";
  const needsPayment = course.access === "payment_required";
  // Visitors sign up first and land straight in the course (see app/enroll); learners enroll in one
  // click and open the first lesson.
  const enrollPath = course.pricingType === "PAID" ? `/courses/${course.slug}/checkout` : `/enroll/${course.slug}`;
  const enrollLabel = course.pricingType === "PAID" ? "Enroll" : "Enroll for free";

  const enrollActions = (
    <>
      {hasAccess ? (
        <Link href={`/courses/${course.slug}?start=1`} className={buttonVariants({ size: "lg" })}>
          Go to course
        </Link>
      ) : needsPayment ? (
        <Link href={`/courses/${course.slug}/checkout`} className={buttonVariants({ size: "lg" })}>Continue enrollment</Link>
      ) : course.pricingType === "PAID" ? !user ? (
        <Link href={`/signup?redirectTo=${encodeURIComponent(enrollPath)}`} className={buttonVariants({ size: "lg" })}>{enrollLabel}</Link>
      ) : (
        <Link href={enrollPath} className={buttonVariants({ size: "lg" })}>{enrollLabel}</Link>
      ) : !user ? (
        <Link href={`/signup?redirectTo=${encodeURIComponent(enrollPath)}`} className={buttonVariants({ size: "lg" })}>
          {enrollLabel}
        </Link>
      ) : (
        <form action={selfEnrollInCourseAction}>
          <input type="hidden" name="courseId" value={course.id} />
          <input type="hidden" name="courseSlug" value={course.slug} />
          <input type="hidden" name="returnTo" value={`/courses/${course.slug}?start=1`} />
          <PendingSubmitButton size="lg" pendingLabel="Enrolling…" className="h-10 px-4">
            {enrollLabel}
          </PendingSubmitButton>
        </form>
      )}
      {!user ? (
        <p className="w-full text-sm text-muted-foreground">
          Have an account?{" "}
          <Link href={`/login?redirectTo=${encodeURIComponent(enrollPath)}`} className="font-bold text-primary underline underline-offset-4">
            Sign in to enroll
          </Link>
        </p>
      ) : null}
    </>
  );

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-7 sm:px-6 sm:py-10">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(courseJsonLd(course)).replace(/</g, LT_ESCAPE) }} />
      <Link href="/catalog" className="text-sm text-muted-foreground hover:text-foreground">
        ← Catalog
      </Link>

      <div className="mt-6 overflow-hidden rounded-2xl border bg-card ">
        <CourseCover coverUrl={course.coverUrl} title={course.title} aspect="banner" className="rounded-none" />
        <header className="border-b border-border p-6 sm:p-8 lg:p-10">
        <p className="text-sm text-muted-foreground">
          {course.instructorName ? `Instructor · ${course.instructorName}` : "Instructor-led course"}
        </p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">{course.title}</h1>
        {course.ratingCount > 0 && course.ratingAverage != null ? (
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <StarRating value={course.ratingAverage} size={16} />
            <span className="font-medium text-foreground">{course.ratingAverage.toFixed(1)}</span>
            <span>
              ({course.ratingCount} rating{course.ratingCount === 1 ? "" : "s"})
            </span>
          </div>
        ) : null}
        {course.description ? (
          <p className="mt-3 text-sm leading-6 text-muted-foreground">{course.description}</p>
        ) : null}
        <dl className="mt-4 flex flex-wrap gap-4 text-sm text-muted-foreground">
          {course.difficulty ? (
            <div>
              <dt className="sr-only">Difficulty</dt>
              <dd>{course.difficulty}</dd>
            </div>
          ) : null}
          {course.estimatedHours ? (
            <div>
              <dt className="sr-only">Duration</dt>
              <dd>~{course.estimatedHours} hours</dd>
            </div>
          ) : null}
          <div>
            <dt className="sr-only">Price</dt>
            <dd className="font-medium text-foreground">
              {course.pricingType === "PAID"
                ? formatPriceCents(course.priceCents, course.currency)
                : "Free"}
            </dd>
          </div>
        </dl>
        <div className="mt-6 hidden flex-wrap items-center gap-3 sm:flex">{enrollActions}</div>
      </header>
      </div>

      {reviews ? <CourseReviews reviews={reviews} /> : null}

      <div className="mt-6">
        <CourseProjectShowcase courseSlug={course.slug} />
      </div>

      {course.slug === "multi-vendor-marketplace" ? <div className="mt-6"><CourseRoadmap modules={course.modules} /></div> : null}

      {course.slug !== "multi-vendor-marketplace" && course.modules.some((module) => module.chapters.length > 0) ? (
        <section className="mt-6 overflow-hidden rounded-2xl border bg-card">
          <div className="p-5 sm:p-7">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Explore the syllabus</p>
            <h2 className="mt-1 text-xl font-semibold tracking-tight">Course curriculum</h2>
            <p className="mt-1 text-sm text-muted-foreground">{course.moduleCount} modules · {course.chapterCount} lessons. Open a module to see its lesson list.</p>
          </div>
          <div className="border-t">
            {course.modules.map((module) => module.chapters.length === 0 ? null : (
              <details key={module.id} className="group border-b last:border-b-0">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 hover:bg-muted/25 sm:px-7 [&::-webkit-details-marker]:hidden">
                  <span className="flex min-w-0 items-center gap-3"><span className="grid size-8 shrink-0 place-items-center rounded-lg border bg-muted/30 font-mono text-xs text-muted-foreground">{String(module.order).padStart(2, "0")}</span><span className="min-w-0"><span className="block truncate text-sm font-semibold">{module.title}</span><span className="mt-0.5 block text-xs text-muted-foreground">{module.chapters.length} lessons</span></span></span>
                  <span className="text-xs text-muted-foreground group-open:hidden">View lessons</span><span className="hidden text-xs text-muted-foreground group-open:inline">Hide lessons</span>
                </summary>
                <ol className="divide-y border-t bg-muted/10 px-5 sm:px-7">
                  {module.chapters.map((chapter) => <li key={chapter.id} className="flex items-center justify-between gap-3 py-3 text-sm"><span className="min-w-0"><span className="mr-2 font-mono text-xs text-muted-foreground">{String(module.order).padStart(2, "0")}.{String(chapter.order).padStart(2, "0")}</span>{chapter.title}</span>{chapter.estimatedMinutes ? <span className="shrink-0 text-xs text-muted-foreground">{chapter.estimatedMinutes} min</span> : null}</li>)}
                </ol>
              </details>
            ))}
          </div>
        </section>
      ) : null}

      {course.projectGoal ? (
        <section className="mt-6 rounded-xl border bg-muted/20 p-4 text-sm">
          <p className="font-medium text-foreground">What you&apos;ll build</p>
          <p className="mt-1 text-muted-foreground">{course.projectGoal}</p>
        </section>
      ) : null}

      {/* On phones the enroll bar stays in reach; signed-in learners have the tab bar (4rem plus the safe area) under it. */}
      <div
        className={cn(
          "sticky z-10 mt-8 flex flex-wrap items-center gap-3 rounded-xl border bg-card p-3 shadow-sm sm:hidden",
          user ? "bottom-[calc(4.75rem+env(safe-area-inset-bottom))]" : "bottom-[calc(0.75rem+env(safe-area-inset-bottom))]"
        )}
      >
        {enrollActions}
      </div>
    </div>
  );
}
