import { isRegisteredBlockType } from "../../shared/blocks/definitions.js";
import { prisma } from "../../db/prisma.js";
import { ForbiddenError, NotFoundError, NotImplementedError } from "../../utils/errors.js";
import type { SessionUser } from "../../types/auth.js";
import { requireBlockSubmissionAccess } from "../enrollment/api-learn-access.js";
import { shouldBypassProgressGating } from "../auth/seed-access.js";
import { ChapterLockedError, assertChapterUnlocked } from "../progress/gate.js";
import { assertSecureSitting } from "../integrity/secure-session.js";

// The checks every learner write to a block goes through: the block exists, the
// caller is a verified learner enrolled in its course, and its chapter is unlocked.

export async function loadBlockForSubmission(
  blockId: string,
  user: SessionUser | undefined,
  /** Runs after the block is found and before access is checked, for type-specific refusals. */
  beforeAccess?: (block: {
    type: string;
    chapter: { readerMode: string };
  }) => void,
) {
  const block = await prisma.block.findUnique({
    where: { id: blockId },
    include: {
      chapter: {
        select: {
          archivedAt: true,
          id: true,
          courseId: true,
          readerMode: true,
          course: {
            select: {
              familySlug: true,
              variantFamily: true,
              autoGradeOpenQuestions: true,
            },
          },
        },
      },
    },
  });
  if (!block || block.archivedAt || block.chapter.archivedAt)
    throw new NotFoundError("Block not found");
  if (!isRegisteredBlockType(block.type)) {
    throw new NotImplementedError(`Block type ${block.type} has no grader yet`);
  }
  beforeAccess?.(block);

  const enrollment = await requireBlockSubmissionAccess(
    block.chapter.courseId,
    user,
  );
  const learner = user!;

  try {
    await assertChapterUnlocked({
      courseId: block.chapter.courseId,
      enrollmentId: enrollment.id,
      chapterId: block.chapter.id,
      bypassLocking: shouldBypassProgressGating(learner),
    });
  } catch (error) {
    if (error instanceof ChapterLockedError) {
      throw new ForbiddenError(
        "This chapter is locked. Finish the previous chapter first.",
        "CHAPTER_LOCKED",
      );
    }
    throw error;
  }

  // Written, code and prediction answers inside a secure quiz need the desktop sitting too.
  await assertSecureSitting(learner.id, block.chapter.id);

  return { block, enrollment, learner };
}
