import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { CatalogCourseSummary } from "@/shared/api/catalog";
import { serverApiFetch } from "@/lib/api-server";
import { withoutGuidedTracks } from "@/lib/guided-labs";
import { Logo } from "@/components/brand/logo";
import { CourseCatalog } from "@/components/marketing/course-catalog";
import { FeaturedProject } from "@/components/marketing/featured-project";
import { MentorNote } from "@/components/marketing/feature-tabs";
import { HeroStats, type HeroStat } from "@/components/marketing/hero-stats";
import { HowItWorks } from "@/components/marketing/how-it-works";
import { LandingHeader } from "@/components/marketing/landing-header";
import { ProductFrame } from "@/components/marketing/product-frame";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import styles from "./landing.module.css";

export default async function MarketingHomePage() {
  const catalog = await serverApiFetch<{ courses: CatalogCourseSummary[] }>(
    "/api/v1/catalog", { token: null },
  );
  // The Dev Weekends tracks are listed under Guided labs, not with the courses.
  const courses = withoutGuidedTracks(catalog.courses);
  const featured = courses.find(course => course.slug === "multi-vendor-marketplace");
  const otherCourses = courses.filter(course => course.id !== featured?.id);
  const communication = courses.find(course => course.slug === "communication");
  const stats: HeroStat[] = [
    { value: courses.length, label: "courses to choose from" },
    { value: courses.reduce((sum, course) => sum + course.chapterCount, 0), label: "chapters to work through" },
    { value: courses.reduce((sum, course) => sum + (course.estimatedHours ?? 0), 0), suffix: "h", label: "estimated study" },
  ].filter(stat => stat.value > 0);

  return (
    <div className={cn(styles.page, "min-h-full bg-background text-foreground")}>
      <a href="#main-content" className="sr-only z-50 bg-background p-4 focus:not-sr-only focus:absolute">Skip to content</a>
      <LandingHeader showCourses={courses.length > 0} />
      <main id="main-content">
        <section aria-labelledby="hero-heading" className="mx-auto grid max-w-7xl gap-12 px-6 pb-16 pt-12 sm:px-8 lg:grid-cols-[1.2fr_1fr] lg:gap-16 lg:px-12 lg:pb-24 lg:pt-16">
          <div className="min-w-0">
            <p className={styles.eyebrow}>The Dev Weekends classroom</p>
            <h1 id="hero-heading" className={cn(styles.display, "mt-7")}>
              Make something<br /><em className={cn(styles.accent, "font-normal")}>you can show.</em>
            </h1>
            <p className="mt-7 max-w-[42ch] text-base leading-8 sm:text-lg">
              A course should leave you with work you can call your own. Build a marketplace or practise a difficult conversation, with a mentor to help you improve.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-6">
              {courses.length > 0 ? (
                <a href="#courses" className={cn(buttonVariants(), styles.cta)}>
                  Find your course <ArrowRight className="ml-2 size-4" aria-hidden="true" />
                </a>
              ) : (
                <Link href="/login" className={cn(buttonVariants(), styles.cta)}>Sign in to buildment</Link>
              )}
              {featured ? <a href="#project" className="inline-flex min-h-11 items-center text-sm underline underline-offset-4">Look inside FreshMarket</a> : null}
            </div>
            <HeroStats stats={stats} />
            {stats.length > 0 ? <p className="mt-3 text-xs text-muted-foreground">Across the published catalog. Work at your own pace.</p> : null}
          </div>
          {featured ? <ProductFrame /> : (
            <p className="self-center border-l border-border pl-8 font-serif text-3xl leading-relaxed">Start with a question. Leave with something you made.</p>
          )}
        </section>

        {featured ? <FeaturedProject course={featured} /> : null}

        <MentorNote course={communication} />

        {courses.length > 0 ? (
          <section id="courses" aria-labelledby="courses-heading" className="mx-auto max-w-7xl scroll-mt-8 px-6 py-16 sm:px-8 lg:px-12 lg:py-24">
            <div className="mb-10 grid items-end gap-6 lg:grid-cols-[1.2fr_1fr] lg:gap-16">
              <div>
                <p className={styles.eyebrow}>The course shelf</p>
                <h2 id="courses-heading" className="mt-5 max-w-[16ch] font-serif text-4xl leading-[1.12] sm:text-5xl">What would you like to work on?</h2>
              </div>
              <div className="max-w-md">
                <p className="text-base leading-7">Practise a skill you can use at work. Each course below ends with something to build, write or present.</p>
                {featured ? (
                  <p className="mt-3 text-sm leading-6 text-muted-foreground">{otherCourses.length} {otherCourses.length === 1 ? "course" : "courses"} below. For the full marketplace build, <a href="#project" className="text-foreground underline underline-offset-4">see FreshMarket above</a>.</p>
                ) : null}
              </div>
            </div>
            <CourseCatalog courses={otherCourses} />
          </section>
        ) : null}

        <div className="border-t border-border"><HowItWorks /></div>

        <section aria-labelledby="cta-heading" className="border-t border-border">
          <div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-8 px-6 py-14 sm:px-8 lg:flex-row lg:items-center lg:px-12 lg:py-20">
            <div>
              <p className={styles.eyebrow}>Bring your curiosity</p>
              <h2 id="cta-heading" className="mt-4 font-serif text-4xl leading-tight sm:text-5xl">Start with the first chapter.</h2>
              <p className="mt-4 max-w-lg text-base leading-7">Sign in to choose a course. If you have already started, your next chapter is waiting.</p>
            </div>
            <Link href="/login" className={cn(buttonVariants(), styles.cta, "shrink-0")}>
              Sign in to buildment <ArrowRight className="ml-2 size-4" aria-hidden="true" />
            </Link>
          </div>
        </section>
      </main>
      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-5 px-6 py-7 sm:px-8 lg:px-12">
          <Logo size="sm" />
          <p className="text-xs text-muted-foreground">Made for learning, by Dev Weekends.</p>
          <p className="text-xs text-muted-foreground">&copy; {new Date().getFullYear()} Dev Weekends</p>
        </div>
      </footer>
    </div>
  );
}
