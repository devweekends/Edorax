import type { Metadata } from "next";
import type { CatalogCourseSummary } from "@/shared/api/catalog";
import type { MenteeDashboardViewModel } from "@/shared/api/learner";
import { MenteeDashboard } from "@/components/learn/dashboard/mentee-dashboard";
import { requireLearnSurface } from "@/server/auth/guards";
import { serverApiFetch } from "@/lib/api-server";
import { withoutGuidedTracks } from "@/lib/guided-labs";

export const metadata: Metadata = { title: "Home" };

export default async function MenteeDashboardPage() {
  await requireLearnSurface();
  const model = await serverApiFetch<MenteeDashboardViewModel>("/api/v1/learner/dashboard");

  // Only load starter catalog courses when the learner has no active courses yet.
  const hasActiveCourse = model.courses.some((course) => course.state !== "DROPPED");
  const starterCourses = hasActiveCourse
    ? []
    : await serverApiFetch<{ courses: CatalogCourseSummary[] }>("/api/v1/catalog")
        .then((catalog) => withoutGuidedTracks(catalog.courses))
        .catch(() => [] as CatalogCourseSummary[]);

  return <MenteeDashboard model={model} starterCourses={starterCourses} />;
}
