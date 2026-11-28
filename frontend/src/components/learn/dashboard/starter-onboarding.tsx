"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, BookOpen } from "lucide-react";
import type { CatalogCourseSummary } from "@/shared/api/catalog";
import type { CourseCategory } from "@/shared/domain/enums";
import { COURSE_CATEGORY_INFO } from "@/lib/course-categories";
import { selectStarterCourses } from "@/lib/learner-onboarding";
import { formatPriceCents } from "@/lib/format-price";
import { CourseCover } from "@/components/learn/course-cover";
import { Dot } from "@/components/brand/dot";
import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { helpUiCopy } from "@/shared/lib/help-ui-copy";

export function StarterOnboarding({
  name,
  courses,
}: {
  name: string;
  courses: CatalogCourseSummary[];
}) {
  const [selectedCategory, setSelectedCategory] = useState<CourseCategory | null>(null);

  const availableCategories = useMemo(
    () =>
      COURSE_CATEGORY_INFO.filter((info) =>
        courses.some((course) => course.category === info.value)
      ),
    [courses]
  );

  const starterCourses = useMemo(
    () => selectStarterCourses(courses, selectedCategory, 6),
    [courses, selectedCategory]
  );

  const activeCategoryInfo = availableCategories.find((info) => info.value === selectedCategory) ?? null;

  if (courses.length === 0) {
    return (
      <section className="rounded-2xl border bg-card px-6 py-12 text-center sm:py-16">
        <div className="mx-auto inline-flex">
          <Dot mood="wave" size={88} />
        </div>
        <h2 className="mt-4 text-xl font-semibold tracking-tight">Your learning starts here</h2>
        <p className="mx-auto mt-2 max-w-md text-base leading-6 text-muted-foreground">
          {name}, pick a course from the catalog when it is ready. If your mentor sent an invite link, open it to join your course.
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <Link href="/catalog" className={cn(buttonVariants({ size: "lg" }), "min-h-11")}>
            Browse catalog
          </Link>
          <Link href="/my-questions" className={cn(buttonVariants({ variant: "outline", size: "lg" }), "min-h-11")}>
            {helpUiCopy.learnerNav}
          </Link>
        </div>
      </section>
    );
  }

  return (
    <div className="space-y-8">
      <section
        aria-labelledby="starter-picker-heading"
        className="rounded-2xl border bg-card p-5 sm:p-7"
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <div className="shrink-0">
            <Dot mood="wave" size={64} />
          </div>
          <div className="min-w-0">
            <h2 id="starter-picker-heading" className="text-xl font-semibold tracking-tight sm:text-2xl">
              What would you like to learn first?
            </h2>
            <p className="mt-1 text-base leading-6 text-muted-foreground">
              Pick a topic below and jump straight into lesson 1. You can switch anytime.
            </p>
          </div>
        </div>

        {availableCategories.length > 1 ? (
          <div
            role="group"
            aria-label="Choose a topic"
            className="mt-5 flex flex-wrap gap-2"
          >
            <button
              type="button"
              onClick={() => setSelectedCategory(null)}
              aria-pressed={selectedCategory === null}
              className={cn(
                "min-h-11 rounded-full border px-4 py-2 text-sm font-semibold transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
                selectedCategory === null
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-background text-foreground hover:border-primary/60 hover:bg-muted/50"
              )}
            >
              All topics
            </button>
            {availableCategories.map((category) => {
              const active = selectedCategory === category.value;
              return (
                <button
                  key={category.value}
                  type="button"
                  onClick={() => setSelectedCategory(category.value)}
                  aria-pressed={active}
                  className={cn(
                    "min-h-11 rounded-full border px-4 py-2 text-sm font-semibold transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    active
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-background text-foreground hover:border-primary/60 hover:bg-muted/50"
                  )}
                >
                  {category.label}
                </button>
              );
            })}
          </div>
        ) : null}

        {activeCategoryInfo ? (
          <p className="mt-3 text-sm text-muted-foreground">{activeCategoryInfo.description}</p>
        ) : null}
      </section>

      <section aria-labelledby="starter-courses-heading">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="starter-courses-heading" className="text-lg font-semibold tracking-tight">
              {activeCategoryInfo ? `Good places to start in ${activeCategoryInfo.label}` : "Good places to start"}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Free courses open lesson 1 right away.
            </p>
          </div>
          <Link
            href={activeCategoryInfo ? `/catalog?category=${activeCategoryInfo.param}` : "/catalog"}
            className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-primary hover:underline"
          >
            Browse all courses
            <ArrowRight className="size-4" aria-hidden />
          </Link>
        </div>

        <ul className="mt-4 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {starterCourses.map((course) => {
            const isFree = course.pricingType === "FREE";
            const meta = [
              course.difficulty ? course.difficulty.toLowerCase() : null,
              course.estimatedHours ? `${course.estimatedHours} hours` : null,
            ]
              .filter(Boolean)
              .join(" · ");
            const startHref = isFree ? `/enroll/${course.slug}` : `/catalog/${course.slug}`;

            return (
              <li key={course.id}>
                <article className="flex h-full flex-col overflow-hidden rounded-2xl border bg-card">
                  <CourseCover coverUrl={course.coverUrl} title={course.title} aspect="video" className="rounded-none" />
                  <div className="flex flex-1 flex-col p-5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      {meta ? (
                        <span className="text-sm capitalize text-muted-foreground">{meta}</span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-sm text-muted-foreground">
                          <BookOpen className="size-3.5" aria-hidden /> Course
                        </span>
                      )}
                      <Badge variant={isFree ? "secondary" : "outline"}>
                        {isFree ? "Free" : formatPriceCents(course.priceCents, course.currency)}
                      </Badge>
                    </div>
                    <h3 className="mt-2.5 text-lg font-semibold leading-snug tracking-[-0.02em]">
                      {course.title}
                    </h3>
                    {course.description ? (
                      <p className="mt-2 line-clamp-2 flex-1 text-sm leading-6 text-muted-foreground">
                        {course.description}
                      </p>
                    ) : (
                      <div className="flex-1" />
                    )}
                    <div className="mt-5 flex items-center gap-2">
                      <Link
                        href={startHref}
                        className={cn(buttonVariants({ size: "lg" }), "min-h-11 flex-1 justify-center")}
                      >
                        {isFree ? "Start lesson 1" : "See course"}
                        <ArrowRight className="size-4" aria-hidden />
                      </Link>
                      {isFree ? (
                        <Link
                          href={`/catalog/${course.slug}`}
                          className={cn(buttonVariants({ variant: "ghost", size: "lg" }), "min-h-11 px-3")}
                        >
                          Details
                        </Link>
                      ) : null}
                    </div>
                  </div>
                </article>
              </li>
            );
          })}
        </ul>
      </section>

      <p className="text-sm text-muted-foreground">
        Have a class code or invite link from your mentor? Open that link anytime to join your course directly.
      </p>
    </div>
  );
}
