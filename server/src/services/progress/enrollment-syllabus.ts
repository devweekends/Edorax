import type { ProgressStatus } from "../../generated/prisma/index.js";
import { prisma } from "../../db/prisma.js";
import type { SyllabusChapter, SyllabusModule } from "../../types/syllabus.js";
import { cleanChapterSlug } from "../chapters/chapter-slug.js";
import { decorateSyllabus } from "./syllabus.js";
import { isCompletableBlock } from "./rules.js";
import { releaseForEnrollment, releaseModulesWithBlocks } from "../courses/releases.js";

const courseModulesSelect = {
  sequential: true,
  modules: {
    where: { archivedAt: null },
    orderBy: { order: "asc" as const },
    select: {
      id: true,
      order: true,
      title: true,
      chapters: {
        where: { archivedAt: null, publishedAt: { not: null } },
        orderBy: { order: "asc" as const },
        select: {
          id: true,
          slug: true,
          title: true,
          order: true,
          blocks: {
            where: { archivedAt: null },
            select: { type: true, required: true, archivedAt: true },
          },
        },
      },
    },
  },
};

export function pickContinueTarget<
  TChapter extends Pick<SyllabusChapter, "slug" | "title" | "status" | "locked">,
>(flatChapters: TChapter[]): TChapter | null {
  const inProgress = flatChapters.find((c) => !c.locked && c.status === "IN_PROGRESS");
  if (inProgress) return inProgress;

  const notStarted = flatChapters.find((c) => !c.locked && c.status === "NOT_STARTED");
  if (notStarted) return notStarted;

  const unlocked = flatChapters.find((c) => !c.locked);
  return unlocked ?? null;
}

export function pickDefaultOpenModule(modules: SyllabusModule[]) {
  const withProgress = modules.find((mod) =>
    mod.chapters.some((c) => c.status === "IN_PROGRESS" || c.status === "NOT_STARTED")
  );
  return withProgress?.id ?? modules[0]?.id ?? null;
}

export function resolveContinueChapterPath(
  courseSlug: string,
  flatChapters: Pick<SyllabusChapter, "slug" | "title" | "status" | "locked">[]
) {
  const target = pickContinueTarget(flatChapters);
  return target ? `/courses/${courseSlug}/${cleanChapterSlug(target.slug)}` : null;
}

export async function syllabusForEnrollment(
  course: {
    sequential: boolean;
    modules: Array<{
      id: string;
      order: number;
      title: string;
      chapters: Array<{
        id: string;
        slug: string;
        title: string;
        order: number;
        blocks: Parameters<typeof isCompletableBlock>[0][];
      }>;
    }>;
  },
  enrollmentId: string,
  bypassLocking?: boolean
): Promise<{ modules: SyllabusModule[]; flatChapters: SyllabusChapter[] }> {
  const progress = await prisma.chapterProgress.findMany({
    where: { enrollmentId },
    select: { chapterId: true, status: true, blocksCompleted: true, blocksTotal: true },
  });
  const progressByChapter = new Map<string, ProgressStatus>(
    progress.map((p) => [p.chapterId, p.status])
  );
  const progressCountByChapter = new Map(
    progress.map((p) => [p.chapterId, { completed: p.blocksCompleted, total: p.blocksTotal }])
  );

  const modules = decorateSyllabus({
    sequential: course.sequential,
    bypassLocking,
    progressByChapter,
    modules: course.modules.map((mod) => ({
      id: mod.id,
      order: mod.order,
      title: mod.title,
      chapters: mod.chapters.map((chapter) => {
        const counts = progressCountByChapter.get(chapter.id);
        const blockCount = chapter.blocks.filter((block) => isCompletableBlock(block)).length;
        return {
          id: chapter.id,
          slug: cleanChapterSlug(chapter.slug),
          title: chapter.title,
          order: chapter.order,
          blockCount,
          blocksCompleted: counts?.completed ?? 0,
        };
      }),
    })),
  });

  return { modules, flatChapters: modules.flatMap((mod) => mod.chapters) };
}

export async function loadEnrollmentSyllabus(args: {
  courseId: string;
  enrollmentId: string;
  bypassLocking?: boolean;
}) {
  const course = await prisma.course.findUnique({
    where: { id: args.courseId },
    select: { ...courseModulesSelect, familySlug: true },
  });
  if (!course) return null;
  const enrollment = await prisma.enrollment.findUniqueOrThrow({ where: { id: args.enrollmentId }, select: { releaseId: true, variantSlug: true } });
  const selected = await releaseForEnrollment(args.courseId, enrollment, course.familySlug);
  const modules = selected ? await releaseModulesWithBlocks(selected.modules) : course.modules;
  return syllabusForEnrollment({ ...course, modules }, args.enrollmentId, args.bypassLocking);
}
