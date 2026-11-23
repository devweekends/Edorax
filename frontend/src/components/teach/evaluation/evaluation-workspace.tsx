"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, CircleAlert } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import type { MenteeEvaluation } from "@/shared/api/teach";
import { cn } from "@/lib/utils";
import { ActivitySummary } from "./activity-summary";
import { CourseProgressMap } from "./course-progress-map";
import { EvaluationSummary } from "./evaluation-summary";
import { FeedbackTimeline } from "./feedback-timeline";
import { LearnerReflections } from "./learner-reflections";
import { NeedsAttentionDrawer } from "./needs-attention";
import { ProjectEvidence } from "./project-evidence";
import { LiveQuizIntegrity } from "./live-quiz-integrity";
import { SubmissionFilters } from "./submission-filters";
import { useRouter } from "next/navigation";

type Section = "progress" | "reviews" | "activity" | "work" | "integrity";

function sectionForHash(hash: string): Section {
  if (hash === "#submissions" || hash === "#timeline" || hash === "#reviews")
    return "reviews";
  if (hash === "#activity") return "activity";
  if (hash === "#reflections" || hash === "#evidence" || hash === "#work")
    return "work";
  if (hash === "#quiz-integrity" || hash === "#integrity") return "integrity";
  return "progress";
}

export function EvaluationWorkspace({
  evaluation,
}: {
  evaluation: MenteeEvaluation;
}) {
  const [section, setSection] = useState<Section>("progress");
  const [selectedAttention, setSelectedAttention] = useState<number | null>(
    null,
  );
  const router = useRouter();

  useEffect(() => {
    if (section !== "integrity") return;
    const timer = window.setInterval(() => router.refresh(), 10000);
    return () => window.clearInterval(timer);
  }, [section, router]);

  useEffect(() => {
    const syncHash = () => setSection(sectionForHash(window.location.hash));
    syncHash();
    window.addEventListener("hashchange", syncHash);
    return () => window.removeEventListener("hashchange", syncHash);
  }, []);

  const selectSection = (next: Section) => {
    setSection(next);
    window.history.replaceState(null, "", `#${next}`);
    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    window.scrollTo({ top: 0, behavior: reduceMotion ? "auto" : "smooth" });
  };

  const tabs: Array<{ id: Section; label: string; count?: number }> = [
    { id: "progress", label: "Progress", count: evaluation.modules.length },
    {
      id: "reviews",
      label: "Submissions",
      count: evaluation.submissions.length,
    },
    {
      id: "activity",
      label: "Questions & activity",
      count: evaluation.enrollment.openHelpCount,
    },
    { id: "work", label: "Work & learning log" },
    {
      id: "integrity",
      label: "Quiz integrity",
      count: evaluation.integrity.length,
    },
  ];

  return (
    <>
      <div className="space-y-5">
        <div className="sticky top-0 z-20 rounded-2xl border bg-background/95 p-2 shadow-sm backdrop-blur-xl sm:p-2.5">
          <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
            <div
              role="tablist"
              aria-label="Learner evaluation sections"
              className="grid grid-cols-2 gap-1 sm:flex sm:min-w-0 sm:flex-wrap"
            >
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  id={`evaluation-tab-${tab.id}`}
                  type="button"
                  role="tab"
                  aria-selected={section === tab.id}
                  aria-controls={`evaluation-panel-${tab.id}`}
                  onClick={() => selectSection(tab.id)}
                  className={cn(
                    "flex min-h-10 items-center justify-center gap-1.5 rounded-xl px-2.5 py-2 text-center text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:min-h-0 sm:shrink-0 sm:justify-start sm:gap-2 sm:px-3 sm:text-sm",
                    tab.id === "integrity" && "col-span-2 sm:col-span-1",
                    section === tab.id
                      ? "bg-foreground text-background"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  {tab.label}
                  {tab.count !== undefined ? (
                    <span
                      className={cn(
                        "rounded-md px-1.5 py-0.5 text-[11px] tabular-nums",
                        section === tab.id ? "bg-background/15" : "bg-muted",
                      )}
                    >
                      {tab.count}
                    </span>
                  ) : null}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() =>
                evaluation.attention.length && setSelectedAttention(0)
              }
              disabled={!evaluation.attention.length}
              className={cn(
                "inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold transition-colors disabled:cursor-default",
                evaluation.attention.length
                  ? "border-amber-500/40 bg-amber-500/10 text-amber-900 hover:bg-amber-500/20 dark:text-amber-100"
                  : "border-border bg-muted/30 text-muted-foreground",
              )}
            >
              <CircleAlert className="size-4" aria-hidden />
              {evaluation.attention.length ? (
                <>
                  Needs attention{" "}
                  <span className="rounded-md bg-amber-500/15 px-1.5 py-0.5 text-xs tabular-nums">
                    {evaluation.attention.length}
                  </span>
                </>
              ) : (
                "Nothing needs attention"
              )}
            </button>
          </div>
        </div>

        <EvaluationSummary evaluation={evaluation} />

        {tabs.map((tab) => (
          <div
            key={tab.id}
            id={`evaluation-panel-${tab.id}`}
            role="tabpanel"
            aria-labelledby={`evaluation-tab-${tab.id}`}
            tabIndex={0}
            hidden={section !== tab.id}
            className="space-y-5 outline-none"
          >
            {section === tab.id && tab.id === "progress" ? (
              <CourseProgressMap
                modules={evaluation.modules}
                integrity={evaluation.integrity}
                currentChapterTitle={evaluation.enrollment.currentChapter}
              />
            ) : null}
            {section === tab.id && tab.id === "reviews" ? (
              <>
                {evaluation.reviewNextHref ? (
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-4">
                    <div>
                      <p className="text-sm font-semibold">
                        A submission is ready for review
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        Open the full review when you are ready to score and
                        respond.
                      </p>
                    </div>
                    <Link
                      href={evaluation.reviewNextHref}
                      className={cn(buttonVariants({ size: "sm" }), "gap-1.5")}
                    >
                      Review next <ArrowRight className="size-4" aria-hidden />
                    </Link>
                  </div>
                ) : null}
                <SubmissionFilters items={evaluation.submissions} />
                <FeedbackTimeline items={evaluation.timeline} />
              </>
            ) : null}
            {section === tab.id && tab.id === "activity" ? (
              <ActivitySummary
                help={evaluation.help}
                sessions={evaluation.sessions}
              />
            ) : null}
            {section === tab.id && tab.id === "work" ? (
              <>
                <ProjectEvidence items={evaluation.evidence} />
                <LearnerReflections items={evaluation.reflections} />
              </>
            ) : null}
            {section === tab.id && tab.id === "integrity" ? (
              <LiveQuizIntegrity
                attempts={evaluation.integrity}
                courseSlug={evaluation.course.slug}
                enrollmentId={evaluation.enrollment.id}
              />
            ) : null}
          </div>
        ))}
      </div>

      <NeedsAttentionDrawer
        evaluation={evaluation}
        selectedIndex={selectedAttention}
        onSelect={setSelectedAttention}
        onClose={() => setSelectedAttention(null)}
        onNavigate={(hash) => {
          setSelectedAttention(null);
          selectSection(sectionForHash(hash));
        }}
      />
    </>
  );
}
