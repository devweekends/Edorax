import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import type { HelpThreadDetail } from "@/shared/api/help";
import { requireTeachSurface } from "@/server/auth/guards";
import { serverApiFetchOrNotFound } from "@/lib/api-server";
import { HelpThreadDetail as HelpThreadDetailPanel } from "@/components/help/help-thread-detail";
import { helpUiCopy as copy } from "@/shared/lib/help-ui-copy";

export default async function MentorHelpThreadPage({
  params,
}: {
  params: Promise<{ threadId: string }>;
}) {
  const { threadId } = await params;
  const user = await requireTeachSurface();
  // The shared thread endpoint answers 403 unless the caller mentors the course.
  const thread = await serverApiFetchOrNotFound<HelpThreadDetail>(
    `/api/v1/help/threads/${encodeURIComponent(threadId)}`,
  );
  const menteeName = thread.mentee.name ?? thread.mentee.email ?? "Learner";

  return (
    <div className="mx-auto max-w-6xl">
      <Link
        href="/help"
        className="group inline-flex items-center gap-1.5 rounded-full py-1 pr-3 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft
          className="size-4 transition-transform group-hover:-translate-x-0.5"
          aria-hidden
        />
        {copy.mentorNav}
      </Link>

      {thread.kind === "LESSON_REPORT" && (
        <div className="mt-4 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-destructive">
            Lesson report{thread.category ? ` · ${thread.category.toLowerCase().replace("_", " ")}` : ""}
          </p>
          {thread.quote && (
            <p className="mt-1 text-sm italic text-muted-foreground">
              &ldquo;{thread.quote}&rdquo;
            </p>
          )}
        </div>
      )}

      <div className="mt-4">
        <HelpThreadDetailPanel
          variant="mentor"
          layout="page"
          threadId={thread.id}
          status={thread.status}
          messages={thread.messages}
          viewerId={user.id}
          header={{
            menteeName,
            subtitle: `${thread.chapter?.title ?? "Course question"} · ${thread.course.title}`,
          }}
          aside={{
            menteeId: thread.menteeId,
            menteeEmail: thread.mentee.email,
            courseTitle: thread.course.title,
            lessonTitle: thread.chapter?.title ?? null,
          }}
        />
      </div>
    </div>
  );
}
