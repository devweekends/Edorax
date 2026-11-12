import type { ReactNode } from 'react';
import type { CourseOverview } from '../../shared/api/catalog';
import { CourseCouponBanner } from './course-coupon-banner';
import { CourseCurriculumUpgradeBanner } from './course-curriculum-upgrade-banner';
import { CourseOverviewHero } from './course-overview-hero';
import { CourseSyllabus } from './course-syllabus';
import { CourseProjectShowcase } from './course-project-showcase';
import { VariantBanner, SpecialisationPanel } from './course-track-panels';
import { VariantThemeScope, variantForTrack } from './variant-theme';
import { LearnerBreadcrumb } from './learner-breadcrumb';

/** The enrolled course page, shared by web and desktop. Hosts own access and navigation. */
export function CourseOverviewContent({ overview, onChooseSpecialisation, onUpgradeCurriculum, ratingLink, ratingBanner }: {
  overview: CourseOverview;
  onChooseSpecialisation: (data: FormData) => Promise<void>;
  onUpgradeCurriculum?: () => Promise<void> | void;
  /** Host-provided content under the hero's continue button (e.g. the rating link). */
  ratingLink?: ReactNode;
  /** Host-provided rating bar shown directly beneath the course hero once unlocked. */
  ratingBanner?: ReactNode;
}) {
  const { course, enrollment, syllabus, track } = overview;
  if (!enrollment || !syllabus || overview.access !== 'active') return null;
  const { modules, chapterCount, continueHref, defaultOpenModuleId } = syllabus;
  const continueLabel = enrollment.percentComplete === 0 ? 'Start learning' : enrollment.percentComplete >= 100 ? 'Review course' : 'Continue learning';
  return <VariantThemeScope variant={variantForTrack(track)}>
    <div className="mx-auto max-w-6xl space-y-8 px-5 py-8 sm:px-6 sm:py-10">
      <LearnerBreadcrumb courseSlug={course.slug} courseTitle={course.title} />
      <CourseOverviewHero {...course} {...enrollment} chaptersTotal={chapterCount} continueHref={continueHref} continueLabel={continueLabel} moduleCount={modules.length} chapterCount={chapterCount} ratingLink={ratingLink} />
      {ratingBanner}
      {overview.curriculumUpgradeAvailable ? (
        <CourseCurriculumUpgradeBanner courseSlug={course.slug} onUpgrade={onUpgradeCurriculum} />
      ) : null}
      {overview.coupon ? <CourseCouponBanner coupon={overview.coupon} /> : null}
      {track ? <VariantBanner courseSlug={course.slug} track={track} /> : null}
      {track?.specialisationOpen ? <SpecialisationPanel courseSlug={course.slug} track={track} onChoose={onChooseSpecialisation} /> : null}
      <CourseProjectShowcase courseSlug={course.slug} />
      <CourseSyllabus courseSlug={course.slug} modules={modules} defaultOpenModuleId={defaultOpenModuleId} {...enrollment} chaptersTotal={chapterCount} />
      {track && !track.specialisationOpen ? <SpecialisationPanel courseSlug={course.slug} track={track} onChoose={onChooseSpecialisation} /> : null}
    </div>
  </VariantThemeScope>;
}
