import type { Metadata } from "next";
import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import type { ChapterReaderView } from "@/shared/api/reader";
import { requireVerifiedUser } from "@/server/auth/guards";
import { ApiError } from "@/lib/api-client";
import { serverApiFetch } from "@/lib/api-server";
import { LearnAccessDenied, forbiddenToLearnReason } from "@/components/learn/learn-access-denied";
import { ChapterMdx } from "@/mdx/compile";
import { QuizChapterWizard } from "@/components/learn/quiz-chapter-wizard";
import { stripInteractiveBlockTags } from "@/lib/strip-interactive-block-tags";
import { extractHeadings } from "@/shared/lib/mdx-headings";
import { ChapterReaderShell } from "@/components/learn/chapter-reader-shell";
import { LockedChapterView } from "@/components/learn/locked-chapter";
import { VariantThemeScope, variantForTrack } from "@/components/learn/variant-theme";
import { signOutAction } from "@/server/auth/actions";
import { loadChapterNarration } from "@/lib/narration";

export const dynamic = "force-dynamic";

// One API call per request, shared by the tab title and the page.
const loadReader = cache((courseSlug: string, chapterSlug: string) =>
  serverApiFetch<ChapterReaderView>(`/api/v1/courses/${encodeURIComponent(courseSlug)}/chapters/${encodeURIComponent(chapterSlug)}`)
);

export async function generateMetadata({ params }: { params: Promise<{ courseSlug: string; chapterSlug: string }> }): Promise<Metadata> {
  const { courseSlug, chapterSlug } = await params;
  try {
    const { course, chapter } = await loadReader(courseSlug, chapterSlug);
    // The tab says which course is open, course first since narrow tabs show only the start
    // ("System Design, Hands On · Set the scene"). Lessons sit behind sign-in, so keep them out of search.
    const courseName = course.title.split(":")[0]!.trim();
    return { title: `${courseName} · ${chapter.title}`, robots: { index: false, follow: false } };
  } catch {
    return { robots: { index: false, follow: false } };
  }
}

export default async function ChapterReaderPage({
  params,
}: {
  params: Promise<{ courseSlug: string; chapterSlug: string }>;
}) {
  const { courseSlug, chapterSlug } = await params;
  const user = await requireVerifiedUser();

  let view: ChapterReaderView;
  try {
    view = await loadReader(courseSlug, chapterSlug);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    if (error instanceof ApiError && error.status === 403) {
      return <LearnAccessDenied courseSlug={courseSlug} reason={forbiddenToLearnReason(error.code)} />;
    }
    throw error;
  }

  const { course, chapter, prev, next, modules } = view;
  // Older links carry the chapter's id after its slug; show the address the course itself uses.
  if (decodeURIComponent(chapterSlug) !== chapter.slug) redirect(`/courses/${course.slug}/${chapter.slug}`);
  const variant = variantForTrack(view.track);

  if (view.locked || !view.content) {
    return (
      <VariantThemeScope variant={variant}>
        <LockedChapterView
          courseSlug={course.slug}
          courseTitle={course.title}
          lessonLabel={chapter.lessonLabel}
          chapterTitle={chapter.title}
          currentChapterSlug={chapter.slug}
          previous={view.previous}
          modules={modules}
          user={user}
          signOutAction={signOutAction}
          checkpointsCompleted={0}
          checkpointsTotal={chapter.blockCount}
          chapterComplete={false}
        />
      </VariantThemeScope>
    );
  }

  const { content } = view;
  const source = chapter.readerMode === "QUIZ" ? stripInteractiveBlockTags(content.source) : content.source;
  // Bad MDX must not blank the reader with "This chapter can't be displayed right now".
  let headings: ReturnType<typeof extractHeadings> = [];
  try {
    headings = extractHeadings(source);
  } catch {
    headings = [];
  }
  // Only unlocked, non-quiz chapters get audio; a missing or unreadable manifest just means no player.
  const narration = chapter.readerMode === "QUIZ" ? null : await loadChapterNarration(course.slug, chapter.slug);

  return (
    <VariantThemeScope variant={variant}>
      <ChapterReaderShell
        courseId={course.id}
        courseSlug={course.slug}
        courseTitle={course.title}
        projectGoal={course.projectGoal}
        variant={variant ? { productName: variant.productName, label: variant.label } : null}
        lessonLabel={chapter.lessonLabel}
        chapterTitle={chapter.title}
        chapterSlug={chapter.slug}
        chapterId={chapter.id}
        estimatedMinutes={chapter.estimatedMinutes}
        readerMode={chapter.readerMode}
        learningLogAnswers={content.learningLogAnswers}
        checklistState={content.checklistState}
        chapterComplete={content.chapterComplete}
        canMarkComplete={content.canMarkComplete}
        checkpointsCompleted={content.checkpointsCompleted}
        checkpointsTotal={content.checkpointsTotal}
        isGateChapter={chapter.isMilestone}
        nextLocked={content.nextLocked}
        reflectionPending={content.reflectionPending}
        recap={content.recap}
        streakMilestone={content.streakMilestone}
        headingNotes={content.headingNotes}
        predictGate={content.predictGate}
        predictRevealed={content.predictRevealed}
        promptCourseRating={Boolean(content.promptCourseRating)}
        helpThread={content.helpThread}
        narration={narration}
        user={user}
        signOutAction={signOutAction}
        modules={modules}
        headings={headings}
        prev={prev ?? undefined}
        next={next ?? undefined}
      >
        {chapter.readerMode === "QUIZ" ? (
          <QuizChapterWizard
            chapterId={chapter.id}
            chapterTitle={chapter.title}
            nextHref={next ? `/courses/${course.slug}/${next.slug}` : undefined}
            nextLocked={content.nextLocked}
            canMarkComplete={content.canMarkComplete}
            chapterComplete={content.chapterComplete}
          />
        ) : (
          <ChapterMdx source={source} courseLabMode />
        )}
      </ChapterReaderShell>
    </VariantThemeScope>
  );
}
