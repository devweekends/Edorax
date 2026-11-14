import { enrollmentLabel } from "@buildment/learning-ui/components/learn/enrollment-badge";
import type { Metadata } from "next";
import { SITE_SHARE_IMAGE } from "@/lib/site";
import type { CatalogCourseSummary } from "@/shared/api/catalog";
import { COURSE_CATEGORIES, type CourseCategory } from "@/shared/domain/enums";
import { getSessionUser } from "@/server/auth/guards";
import { serverApiFetch } from "@/lib/api-server";
import { COURSE_CATEGORY_INFO, categoryFromParam } from "@/lib/course-categories";
import { withoutGuidedTracks } from "@/lib/guided-labs";
import { CatalogCourseCard } from "@/components/learn/catalog-course-card";
import { CatalogCategoryTiles } from "@/components/learn/catalog-category-tiles";
import { Dot } from "@/components/brand/dot";
import { AreaTabs } from "@/components/areas/area-tabs";

function CourseGrid({ courses }: { courses: CatalogCourseSummary[] }) {
  return (
    <ul className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {courses.map((course) => {
        const enrolledLabel = enrollmentLabel(course.enrollmentLifecycle);

        return (
          <li key={course.id}>
            <CatalogCourseCard
              slug={course.slug}
              title={course.title}
              description={course.description}
              coverUrl={course.coverUrl}
              difficulty={course.difficulty}
              estimatedHours={course.estimatedHours}
              pricingType={course.pricingType}
              priceCents={course.priceCents}
              currency={course.currency}
              subcategory={course.subcategory}
              tags={course.tags}
              instructorName={course.instructorName}
              enrolledLabel={enrolledLabel}
              ratingAverage={course.ratingAverage}
              ratingCount={course.ratingCount}
            />
          </li>
        );
      })}
    </ul>
  );
}

export const metadata: Metadata = {
  title: "Explore courses",
  description: "Explore courses in tech, soft skills, and cloud and DevOps: networking, system design, product sense, communication and more.",
  alternates: { canonical: "/catalog" },
  openGraph: { title: "Courses on Edorax", url: "/catalog", images: [SITE_SHARE_IMAGE] },
};

export default async function CatalogPage({ searchParams }: { searchParams: Promise<{ category?: string; subcategory?: string; tag?: string; q?: string }> }) {
  const user = await getSessionUser();
  const catalog = await serverApiFetch<{ courses: CatalogCourseSummary[] }>("/api/v1/catalog");
  // The Dev Weekends tracks are listed under Guided labs, not here.
  const courses = withoutGuidedTracks(catalog.courses);
  const params = await searchParams;
  const active = categoryFromParam(params.category);
  const query = params.q?.trim() ?? "";
  const subcategory = params.subcategory?.trim() ?? "";
  const tag = params.tag?.trim().toLowerCase() ?? "";
  const availableCourses = courses.filter((course) => active === null || course.category === active);
  const subcategories = [...new Set(availableCourses.map((course) => course.subcategory).filter((value): value is string => Boolean(value)))].sort();
  const tags = [...new Set(availableCourses.flatMap((course) => course.tags))].sort();
  const filteredCourses = availableCourses.filter((course) => {
    const text = [course.title, course.description ?? "", course.projectGoal ?? "", course.subcategory ?? "", ...course.tags].join(" ").toLowerCase();
    return (!query || text.includes(query.toLowerCase())) && (!subcategory || course.subcategory === subcategory) && (!tag || course.tags.some((item) => item.toLowerCase() === tag));
  });

  const counts = Object.fromEntries(COURSE_CATEGORIES.map((category) => [category, 0])) as Record<CourseCategory, number>;
  for (const course of courses) counts[course.category] += 1;

  // "All" shows every category as its own section; filters narrow each section.
  const sections = COURSE_CATEGORY_INFO.filter((category) => active === null || category.value === active)
    .map((category) => ({ ...category, courses: filteredCourses.filter((course) => course.category === category.value) }))
    .filter((section) => section.courses.length > 0 || active !== null);

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-7 sm:px-6 sm:py-10 lg:px-8">
      <AreaTabs />
      <header className="mt-8">
        <h1 className="text-[32px] leading-tight tracking-[-0.035em] sm:text-[40px]">Explore courses</h1>
        <p className="mt-2 max-w-2xl text-lg text-muted-foreground">
          {user ? "Explore the catalog and find the next course for your learning goals." : "Look inside any course. You only need an account to enroll."}
        </p>
        {courses.length > 0 ? <CatalogCategoryTiles counts={counts} total={courses.length} active={active} /> : null}
        {courses.length > 0 ? <form action="/catalog" method="get" className="mt-5 grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-2 lg:grid-cols-4" aria-label="Filter courses">
          <input type="hidden" name="category" value={params.category ?? ""} />
          <label className="space-y-1 text-xs font-medium text-muted-foreground">Search topics or courses<input name="q" defaultValue={query} placeholder="AI, AWS, React…" className="h-10 w-full rounded-md border bg-background px-3 text-sm text-foreground" /></label>
          <label className="space-y-1 text-xs font-medium text-muted-foreground">Subcategory<select name="subcategory" defaultValue={subcategory} className="h-10 w-full rounded-md border bg-background px-3 text-sm text-foreground"><option value="">All subcategories</option>{subcategories.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
          <label className="space-y-1 text-xs font-medium text-muted-foreground">Topic tag<select name="tag" defaultValue={tag} className="h-10 w-full rounded-md border bg-background px-3 text-sm text-foreground"><option value="">All topics</option>{tags.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
          <div className="flex items-end gap-2"><button type="submit" className="h-10 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground">Find courses</button><a href={params.category ? `/catalog?category=${encodeURIComponent(params.category)}` : "/catalog"} className="inline-flex h-10 items-center px-3 text-sm font-medium text-muted-foreground">Clear</a></div>
        </form> : null}
      </header>

      {courses.length === 0 ? (
        <div className="mt-10 flex flex-col items-center border border-border bg-card px-6 py-14 text-center">
          <Dot mood="sleep" size={112} />
          <h2 className="mt-4 text-xl tracking-[-0.02em]">No courses yet</h2>
          <p className="mt-2 max-w-sm text-base text-muted-foreground">New courses show up here when they are published.</p>
        </div>
      ) : (
        sections.map((section) => (
          <section key={section.value} aria-labelledby={`catalog-${section.param}`} className="mt-10">
            <h2 id={`catalog-${section.param}`} className="text-2xl tracking-[-0.02em]">
              {section.label}
            </h2>
            <p className="mt-1 text-base text-muted-foreground">{section.description}</p>
            {section.courses.length > 0 ? (
              <CourseGrid courses={section.courses} />
            ) : (
              <p className="mt-5 text-base text-muted-foreground">{query || subcategory || tag ? "No courses match these filters." : "No courses in this category yet."}</p>
            )}
          </section>
        ))
      )}
    </div>
  );
}
