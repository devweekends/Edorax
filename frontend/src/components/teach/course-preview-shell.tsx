"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ClipboardCheck,
  Clock3,
  Eye,
  FileEdit,
  Flag,
  LayoutDashboard,
  Layers3,
  Pencil,
  Sparkles,
  Target,
  X,
} from "lucide-react";
import { ChecklistProvider as SharedChecklistProvider } from "@buildment/learning-ui/components/learn/checklist";
import { PredictRevealProvider } from "@buildment/learning-ui/components/learn/predict-reveal";
import { ChapterToc, TocToggle } from "@/components/learn/chapter-toc";
import { SidebarToggle } from "@/components/learn/chapter-sidebar";
import { ReadingProgressBar } from "@/components/learn/chapter-progress-bar";
import { FocusModeToggle, ReaderFocusDock } from "@/components/learn/reader-focus-dock";
import { ThemeToggle } from "@/components/theme-toggle";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Heading } from "@/shared/lib/mdx-headings";
import type { CourseStatus } from "@/shared/domain/enums";

export type PreviewChapterSummary = {
  id: string;
  slug: string;
  title: string;
  lessonNumber: string;
  lessonLabel: string;
  moduleId: string;
  moduleTitle: string;
  moduleOrder: number;
  chapterOrder: number;
  readerMode: "DEFAULT" | "QUIZ";
  publishedAt: string | null;
  hasDraft: boolean;
  estimatedMinutes: number | null;
  isMilestone: boolean;
  summary: string | null;
};

export type PreviewModuleSummary = {
  id: string;
  title: string;
  order: number;
  chapters: PreviewChapterSummary[];
};

export type PreviewCourseMeta = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  projectGoal: string | null;
  coverUrl: string | null;
  status: CourseStatus;
  difficulty: string | null;
  estimatedHours: number | null;
};

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="mx-0.5 inline-flex h-5 min-w-5 items-center justify-center rounded border border-border bg-muted px-1 font-mono text-xs text-foreground">
      {children}
    </kbd>
  );
}

function ChapterDraftStatusBadge({
  hasDraft,
  publishedAt,
  compact = false,
}: {
  hasDraft: boolean;
  publishedAt: string | null;
  compact?: boolean;
}) {
  if (hasDraft && publishedAt) {
    return (
      <span
        className={cn(
          "inline-flex shrink-0 items-center gap-1 rounded-full border border-amber-500/35 bg-amber-500/15 font-medium text-amber-600 dark:text-amber-300",
          compact ? "px-1.5 py-0.5 text-[10px]" : "px-2.5 py-0.5 text-xs"
        )}
      >
        <span className="size-1.5 rounded-full bg-amber-400" aria-hidden />
        {compact ? "Modified" : "Draft update"}
      </span>
    );
  }
  if (hasDraft || !publishedAt) {
    return (
      <span
        className={cn(
          "inline-flex shrink-0 items-center gap-1 rounded-full border border-sky-500/35 bg-sky-500/15 font-medium text-sky-600 dark:text-sky-300",
          compact ? "px-1.5 py-0.5 text-[10px]" : "px-2.5 py-0.5 text-xs"
        )}
      >
        <span className="size-1.5 rounded-full bg-sky-400" aria-hidden />
        Draft
      </span>
    );
  }
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/12 font-medium text-emerald-600 dark:text-emerald-300",
        compact ? "px-1.5 py-0.5 text-[10px]" : "px-2.5 py-0.5 text-xs"
      )}
    >
      <span className="size-1.5 rounded-full bg-emerald-400" aria-hidden />
      {compact ? "Live" : "Published"}
    </span>
  );
}

export function CoursePreviewShell({
  course,
  modules,
  activeChapter,
  headings,
  prevChapter,
  nextChapter,
  initialView = "reader",
  children,
}: {
  course: PreviewCourseMeta;
  modules: PreviewModuleSummary[];
  activeChapter: PreviewChapterSummary | null;
  headings: Heading[];
  prevChapter: PreviewChapterSummary | null;
  nextChapter: PreviewChapterSummary | null;
  initialView?: "reader" | "overview";
  children?: React.ReactNode;
}) {
  const router = useRouter();
  const scrollRef = useRef<HTMLElement>(null);
  const [view, setView] = useState<"reader" | "overview">(
    activeChapter ? initialView : "overview"
  );
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);
  const [focusMode, setFocusMode] = useState(false);
  const [sidebarFilter, setSidebarFilter] = useState<"all" | "drafts">("all");
  const [openModuleIds, setOpenModuleIds] = useState<Set<string>>(() => {
    const initial = new Set<string>();
    if (activeChapter) {
      initial.add(activeChapter.moduleId);
    } else if (modules[0]) {
      initial.add(modules[0].id);
    }
    return initial;
  });

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- resets the view when the active chapter changes
    setView(activeChapter ? initialView : "overview");
  }, [activeChapter, initialView]);

  useEffect(() => {
    if (activeChapter) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- opens the module that contains the active chapter
      setOpenModuleIds((prev) => {
        if (prev.has(activeChapter.moduleId)) return prev;
        const next = new Set(prev);
        next.add(activeChapter.moduleId);
        return next;
      });
    }
    scrollRef.current?.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
  }, [activeChapter]);

  const totalChapters = useMemo(
    () => modules.reduce((acc, m) => acc + m.chapters.length, 0),
    [modules]
  );
  const draftChaptersCount = useMemo(
    () =>
      modules.reduce(
        (acc, m) => acc + m.chapters.filter((ch) => ch.hasDraft || !ch.publishedAt).length,
        0
      ),
    [modules]
  );
  const currentChapterIndex = useMemo(() => {
    if (!activeChapter) return 0;
    const flat = modules.flatMap((m) => m.chapters);
    return flat.findIndex((c) => c.id === activeChapter.id) + 1;
  }, [modules, activeChapter]);

  const toggleModule = useCallback((id: string) => {
    setOpenModuleIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const prevHref = prevChapter
    ? `/courses/${course.slug}/preview?chapter=${encodeURIComponent(prevChapter.slug)}`
    : null;
  const nextHref = nextChapter
    ? `/courses/${course.slug}/preview?chapter=${encodeURIComponent(nextChapter.slug)}`
    : null;

  useEffect(() => {
    if (view !== "reader") return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
      const target = event.target as HTMLElement | null;
      if (
        target?.closest(
          "input, textarea, select, [contenteditable=''], [contenteditable='true'], dialog[open]"
        )
      ) {
        return;
      }
      if (event.key === "]" && nextHref) router.push(nextHref);
      else if (event.key === "[" && prevHref) router.push(prevHref);
      else if (event.key === "Escape" && focusMode) setFocusMode(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [view, router, prevHref, nextHref, focusMode]);

  const filteredModules = useMemo(() => {
    if (sidebarFilter === "all") return modules;
    return modules
      .map((m) => ({
        ...m,
        chapters: m.chapters.filter((ch) => ch.hasDraft || !ch.publishedAt),
      }))
      .filter((m) => m.chapters.length > 0);
  }, [modules, sidebarFilter]);

  return (
    <div className="fixed inset-0 z-40 flex h-[100dvh] flex-col overflow-hidden bg-background text-foreground">
      {/* Top Instructor Review Banner */}
      {!focusMode && (
        <div className="shrink-0 border-b border-primary/25 bg-gradient-to-r from-primary/12 via-card to-primary/8 px-3 py-2 sm:px-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            {/* Left: Review Mode identity & course status */}
            <div className="flex min-w-0 flex-wrap items-center gap-2 sm:gap-3">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/40 bg-primary/15 px-2.5 py-1 text-xs font-bold uppercase tracking-wider text-primary">
                <Eye className="size-3.5" aria-hidden />
                Instructor Review Mode
              </span>
              <div className="hidden items-center gap-2 md:flex">
                <Badge variant={course.status === "PUBLISHED" ? "default" : "secondary"}>
                  {course.status === "PUBLISHED"
                    ? "Published Course"
                    : course.status === "ARCHIVED"
                      ? "Archived"
                      : "Draft Course"}
                </Badge>
                {draftChaptersCount > 0 ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/35 bg-amber-500/15 px-2.5 py-0.5 text-xs font-medium text-amber-600 dark:text-amber-300">
                    <Sparkles className="size-3" aria-hidden />
                    {draftChaptersCount} chapter{draftChaptersCount === 1 ? "" : "s"} with draft changes
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/12 px-2.5 py-0.5 text-xs font-medium text-emerald-600 dark:text-emerald-300">
                    <CheckCircle2 className="size-3" aria-hidden />
                    All {totalChapters} chapters published
                  </span>
                )}
                <span className="hidden text-xs text-muted-foreground xl:inline">
                  · Learner view preview (submissions & progress are not recorded)
                </span>
              </div>
            </div>

            {/* Right: View Switcher & Quick Editor Links */}
            <div className="flex flex-wrap items-center gap-2">
              {totalChapters > 0 && (
                <div
                  role="tablist"
                  aria-label="Preview mode"
                  className="inline-flex items-center rounded-lg border border-border bg-muted/60 p-0.5"
                >
                  <button
                    type="button"
                    role="tab"
                    aria-selected={view === "reader"}
                    onClick={() => {
                      setView("reader");
                      if (activeChapter) {
                        router.replace(
                          `/courses/${course.slug}/preview?chapter=${encodeURIComponent(activeChapter.slug)}`,
                          { scroll: false }
                        );
                      }
                    }}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold transition-colors",
                      view === "reader"
                        ? "bg-background text-foreground shadow-xs"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <BookOpen className="size-3.5" aria-hidden />
                    Lesson Reader
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={view === "overview"}
                    onClick={() => {
                      setView("overview");
                      router.replace(`/courses/${course.slug}/preview?view=overview`, {
                        scroll: false,
                      });
                    }}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold transition-colors",
                      view === "overview"
                        ? "bg-background text-foreground shadow-xs"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <LayoutDashboard className="size-3.5" aria-hidden />
                    Course Overview
                  </button>
                </div>
              )}

              {view === "reader" && activeChapter ? (
                <Link
                  href={`/courses/${course.slug}/chapters/${activeChapter.id}/edit`}
                  className={cn(buttonVariants({ variant: "outline", size: "sm" }), "h-8 gap-1.5 text-xs")}
                >
                  <Pencil className="size-3.5" aria-hidden />
                  <span>Edit Chapter</span>
                </Link>
              ) : null}

              <Link
                href={`/courses/${course.slug}/edit`}
                className={cn(buttonVariants({ variant: "default", size: "sm" }), "h-8 gap-1.5 text-xs")}
              >
                <ArrowLeft className="size-3.5" aria-hidden />
                <span>Course Editor</span>
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* VIEW 1: COURSE OVERVIEW (LEARNER LANDING PREVIEW) */}
      {view === "overview" || !activeChapter ? (
        <div className="flex-1 overflow-y-auto custom-scrollbar">
          <div className="mx-auto max-w-6xl space-y-8 px-5 py-8 sm:px-8 sm:py-10">
            {/* Hero Section matching Learner Course Overview */}
            <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-xs">
              <div className="grid gap-6 p-6 sm:p-8 lg:grid-cols-[minmax(0,1fr)_280px] lg:items-center">
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center gap-2">
                    {course.difficulty ? (
                      <Badge variant="secondary">{course.difficulty}</Badge>
                    ) : null}
                    <span className="text-xs font-medium text-muted-foreground">
                      {modules.length} module{modules.length === 1 ? "" : "s"} · {totalChapters}{" "}
                      chapter{totalChapters === 1 ? "" : "s"}
                      {course.estimatedHours ? ` · ~${course.estimatedHours}h` : ""}
                    </span>
                  </div>

                  <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl lg:text-4xl">
                    {course.title}
                  </h1>

                  {course.description ? (
                    <p className="max-w-3xl text-base leading-relaxed text-muted-foreground">
                      {course.description}
                    </p>
                  ) : (
                    <p className="text-sm italic text-muted-foreground">
                      No course description added yet. Add one in Course Settings so learners know what to expect.
                    </p>
                  )}

                  <div className="flex flex-wrap items-center gap-3 pt-2">
                    {modules[0]?.chapters[0] ? (
                      <Link
                        href={`/courses/${course.slug}/preview?chapter=${encodeURIComponent(modules[0].chapters[0].slug)}`}
                        onClick={() => setView("reader")}
                        className={cn(buttonVariants({ size: "lg" }), "gap-2")}
                      >
                        <BookOpen className="size-4" aria-hidden />
                        Start Reviewing Lessons
                      </Link>
                    ) : null}
                    <Link
                      href={`/courses/${course.slug}/settings`}
                      className={cn(buttonVariants({ variant: "outline", size: "lg" }), "gap-2")}
                    >
                      <FileEdit className="size-4" aria-hidden />
                      Course Settings
                    </Link>
                  </div>
                </div>

                {/* Right stats card / cover preview */}
                <div className="flex flex-col justify-between gap-4 rounded-xl border border-border bg-muted/35 p-5">
                  {course.coverUrl ? (
                    <img
                      src={course.coverUrl}
                      alt=""
                      className="h-36 w-full rounded-lg object-cover"
                    />
                  ) : null}
                  <div className="space-y-2.5">
                    <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Review Summary
                    </div>
                    <div className="grid grid-cols-2 gap-2.5 text-sm">
                      <div className="rounded-lg border border-border bg-card p-3">
                        <div className="text-xs text-muted-foreground">Published</div>
                        <div className="mt-0.5 text-lg font-bold text-foreground">
                          {totalChapters - draftChaptersCount}/{totalChapters}
                        </div>
                      </div>
                      <div className="rounded-lg border border-border bg-card p-3">
                        <div className="text-xs text-muted-foreground">Drafts</div>
                        <div className="mt-0.5 text-lg font-bold text-amber-500">
                          {draftChaptersCount}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {course.projectGoal ? (
                <div className="border-t border-border bg-secondary/50 px-6 py-4 sm:px-8">
                  <div className="flex items-start gap-3">
                    <Target className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
                    <div className="text-sm leading-relaxed">
                      <span className="font-semibold text-foreground">Course Project Goal: </span>
                      <span className="text-muted-foreground">{course.projectGoal}</span>
                    </div>
                  </div>
                </div>
              ) : null}
            </section>

            {/* Full Interactive Syllabus */}
            <section className="space-y-4">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h2 className="text-xl font-bold tracking-tight text-foreground">
                    Course Curriculum ({totalChapters} lessons)
                  </h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Click any chapter below to open it in the interactive learner reader.
                  </p>
                </div>
              </div>

              {totalChapters === 0 ? (
                <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card p-12 text-center">
                  <Layers3 className="size-10 text-muted-foreground/50" aria-hidden />
                  <p className="mt-3 text-base font-semibold text-foreground">
                    No chapters available to preview yet
                  </p>
                  <p className="mt-1 max-w-md text-sm text-muted-foreground">
                    Return to the course editor to create modules and chapters, then preview how learners will experience them here.
                  </p>
                  <Link
                    href={`/courses/${course.slug}/edit`}
                    className={cn(buttonVariants(), "mt-5")}
                  >
                    Back to Course Editor
                  </Link>
                </div>
              ) : (
                <div className="space-y-3">
                  {modules.map((mod) => {
                    const modDrafts = mod.chapters.filter(
                      (c) => c.hasDraft || !c.publishedAt
                    ).length;
                    return (
                      <div
                        key={mod.id}
                        className="overflow-hidden rounded-xl border border-border bg-card shadow-2xs"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-muted/30 px-5 py-3.5">
                          <div className="flex items-center gap-3">
                            <span className="flex size-7 items-center justify-center rounded-md bg-primary/15 font-mono text-xs font-bold text-primary">
                              {String(mod.order).padStart(2, "0")}
                            </span>
                            <div>
                              <h3 className="text-base font-semibold text-foreground">
                                {mod.title}
                              </h3>
                              <p className="text-xs text-muted-foreground">
                                {mod.chapters.length} lesson{mod.chapters.length === 1 ? "" : "s"}
                                {modDrafts > 0 ? ` · ${modDrafts} with draft changes` : ""}
                              </p>
                            </div>
                          </div>
                        </div>

                        <ul className="divide-y divide-border/70">
                          {mod.chapters.map((ch) => (
                            <li
                              key={ch.id}
                              className="flex flex-col gap-3 px-5 py-3.5 transition-colors hover:bg-muted/30 sm:flex-row sm:items-center sm:justify-between"
                            >
                              <div className="flex min-w-0 flex-1 items-start gap-3">
                                <span className="mt-0.5 w-9 shrink-0 font-mono text-xs font-semibold tabular-nums text-muted-foreground">
                                  {ch.lessonNumber}
                                </span>
                                <div className="min-w-0 flex-1">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <Link
                                      href={`/courses/${course.slug}/preview?chapter=${encodeURIComponent(ch.slug)}`}
                                      onClick={() => setView("reader")}
                                      className="font-medium text-foreground hover:text-primary hover:underline"
                                    >
                                      {ch.title}
                                    </Link>
                                    <ChapterDraftStatusBadge
                                      hasDraft={ch.hasDraft}
                                      publishedAt={ch.publishedAt}
                                      compact
                                    />
                                    {ch.readerMode === "QUIZ" ? (
                                      <Badge variant="outline" className="gap-1 text-[10px]">
                                        <ClipboardCheck className="size-3" /> Quiz
                                      </Badge>
                                    ) : null}
                                    {ch.isMilestone ? (
                                      <Badge variant="outline" className="gap-1 text-[10px]">
                                        <Flag className="size-3" /> Milestone
                                      </Badge>
                                    ) : null}
                                    {ch.estimatedMinutes ? (
                                      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                                        <Clock3 className="size-3" />
                                        {ch.estimatedMinutes} min
                                      </span>
                                    ) : null}
                                  </div>
                                  {ch.summary ? (
                                    <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">
                                      {ch.summary}
                                    </p>
                                  ) : null}
                                </div>
                              </div>

                              <div className="flex shrink-0 items-center gap-2 pl-12 sm:pl-0">
                                <Link
                                  href={`/courses/${course.slug}/chapters/${ch.id}/edit`}
                                  className={cn(
                                    buttonVariants({ variant: "ghost", size: "sm" }),
                                    "h-8 gap-1 text-xs text-muted-foreground hover:text-foreground"
                                  )}
                                >
                                  <Pencil className="size-3" />
                                  Edit
                                </Link>
                                <Link
                                  href={`/courses/${course.slug}/preview?chapter=${encodeURIComponent(ch.slug)}`}
                                  onClick={() => setView("reader")}
                                  className={cn(
                                    buttonVariants({ variant: "outline", size: "sm" }),
                                    "h-8 gap-1 text-xs"
                                  )}
                                >
                                  Review lesson
                                  <ArrowRight className="size-3" />
                                </Link>
                              </div>
                            </li>
                          ))}
                        </ul>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          </div>
        </div>
      ) : (
        /* VIEW 2: LEARNER CHAPTER READER EXPERIENCE */
        <>
          {!focusMode && (
            <header className="shrink-0 border-b border-border bg-card">
              <div className="flex min-h-14 items-center gap-1.5 px-2 py-1 sm:gap-2.5 sm:px-4">
                <button
                  type="button"
                  onClick={() => {
                    setView("overview");
                    router.replace(`/courses/${course.slug}/preview?view=overview`, {
                      scroll: false,
                    });
                  }}
                  title="Course Overview"
                  aria-label="Back to Course Overview"
                  className="grid size-10 place-items-center rounded-md text-foreground outline-none transition-colors hover:bg-muted"
                >
                  <ArrowLeft className="size-5" aria-hidden />
                </button>

                <div className="min-w-0 flex-1 px-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-[12.5px] text-muted-foreground">
                      {activeChapter.lessonLabel}
                    </p>
                    <ChapterDraftStatusBadge
                      hasDraft={activeChapter.hasDraft}
                      publishedAt={activeChapter.publishedAt}
                      compact
                    />
                    {activeChapter.readerMode === "QUIZ" ? (
                      <span className="rounded bg-primary/15 px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase text-primary">
                        Quiz
                      </span>
                    ) : null}
                  </div>
                  <p className="truncate text-[15px] font-bold leading-tight text-foreground">
                    {activeChapter.title}
                  </p>
                </div>

                <div className="hidden items-center gap-2 font-mono text-xs tabular-nums text-muted-foreground md:flex">
                  <span>
                    Lesson {currentChapterIndex} of {totalChapters}
                  </span>
                  {activeChapter.estimatedMinutes ? (
                    <span className="rounded-md bg-muted px-2 py-0.5 text-xs">
                      {activeChapter.estimatedMinutes}m
                    </span>
                  ) : null}
                </div>

                <div className="flex shrink-0 items-center gap-1 sm:gap-1.5">
                  <SidebarToggle
                    collapsed={leftCollapsed}
                    onClick={() => setLeftCollapsed(!leftCollapsed)}
                  />
                  <div className="hidden items-center gap-1.5 sm:flex">
                    <ThemeToggle />
                    <FocusModeToggle
                      active={focusMode}
                      onClick={() => setFocusMode(!focusMode)}
                    />
                  </div>
                  <div className="hidden md:block">
                    <TocToggle
                      collapsed={rightCollapsed}
                      onClick={() => setRightCollapsed(!rightCollapsed)}
                    />
                  </div>
                </div>
              </div>
              <ReadingProgressBar scrollRef={scrollRef} />
            </header>
          )}

          {/* 3-Column Learner Reader Body */}
          <div className="flex min-h-0 flex-1">
            {/* Left Curriculum Sidebar */}
            {!leftCollapsed && !focusMode && (
              <aside className="flex h-full w-80 shrink-0 flex-col border-r border-border bg-card">
                <div className="flex items-center justify-between border-b border-border px-4 py-3">
                  <button
                    type="button"
                    onClick={() => {
                      setView("overview");
                      router.replace(`/courses/${course.slug}/preview?view=overview`, {
                        scroll: false,
                      });
                    }}
                    className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground hover:text-foreground"
                  >
                    <LayoutDashboard className="size-3.5" />
                    Curriculum
                  </button>
                  <button
                    type="button"
                    onClick={() => setLeftCollapsed(true)}
                    className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    aria-label="Close sidebar"
                  >
                    <X className="size-4" />
                  </button>
                </div>

                {draftChaptersCount > 0 && (
                  <div className="flex items-center gap-1 border-b border-border bg-muted/30 px-3 py-2">
                    <button
                      type="button"
                      onClick={() => setSidebarFilter("all")}
                      className={cn(
                        "flex-1 rounded-md px-2 py-1 text-xs font-medium transition-colors",
                        sidebarFilter === "all"
                          ? "bg-background text-foreground shadow-2xs"
                          : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      All ({totalChapters})
                    </button>
                    <button
                      type="button"
                      onClick={() => setSidebarFilter("drafts")}
                      className={cn(
                        "flex-1 rounded-md px-2 py-1 text-xs font-medium transition-colors",
                        sidebarFilter === "drafts"
                          ? "bg-amber-500/20 text-amber-600 dark:text-amber-300 shadow-2xs"
                          : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      Drafts ({draftChaptersCount})
                    </button>
                  </div>
                )}

                <nav
                  className="flex-1 overflow-y-auto py-2 custom-scrollbar"
                  aria-label="Course chapters"
                >
                  {filteredModules.map((mod) => {
                    const isOpen = openModuleIds.has(mod.id) || sidebarFilter === "drafts";
                    const moduleHasActive = mod.chapters.some(
                      (ch) => ch.id === activeChapter.id
                    );

                    return (
                      <div key={mod.id} className="mb-1">
                        <button
                          type="button"
                          onClick={() => toggleModule(mod.id)}
                          className={cn(
                            "flex w-full items-center gap-2 px-4 py-2 text-left text-sm transition-colors hover:bg-muted/40",
                            moduleHasActive && "bg-muted/60"
                          )}
                        >
                          <span
                            className={cn(
                              "flex size-6 shrink-0 items-center justify-center rounded-md font-mono text-xs font-bold tabular-nums",
                              moduleHasActive
                                ? "bg-foreground text-background"
                                : "bg-muted text-muted-foreground"
                            )}
                          >
                            {String(mod.order).padStart(2, "0")}
                          </span>
                          <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground/90">
                            {mod.title}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {mod.chapters.length}
                          </span>
                          {isOpen ? (
                            <ChevronDown className="size-3.5 text-muted-foreground" />
                          ) : (
                            <ChevronRight className="size-3.5 text-muted-foreground" />
                          )}
                        </button>

                        {isOpen && (
                          <ul className="border-t border-border/60 py-1">
                            {mod.chapters.map((ch) => {
                              const isCurrent = ch.id === activeChapter.id;
                              return (
                                <li key={ch.id}>
                                  <Link
                                    href={`/courses/${course.slug}/preview?chapter=${encodeURIComponent(ch.slug)}`}
                                    className={cn(
                                      "flex items-start gap-2.5 px-4 py-2 text-xs transition-colors",
                                      isCurrent
                                        ? "bg-primary/12 font-semibold text-primary border-l-2 border-primary"
                                        : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                                    )}
                                  >
                                    <span className="mt-0.5 shrink-0 font-mono text-[11px] tabular-nums opacity-75">
                                      {ch.lessonNumber}
                                    </span>
                                    <span className="min-w-0 flex-1 leading-snug">
                                      {ch.title}
                                    </span>
                                    <ChapterDraftStatusBadge
                                      hasDraft={ch.hasDraft}
                                      publishedAt={ch.publishedAt}
                                      compact
                                    />
                                  </Link>
                                </li>
                              );
                            })}
                          </ul>
                        )}
                      </div>
                    );
                  })}
                </nav>
              </aside>
            )}

            {/* Center Reading Column + Right TOC */}
            <div className="flex min-w-0 flex-1 overflow-hidden">
              <main
                ref={scrollRef}
                className={cn(
                  "flex-1 overflow-y-auto custom-scrollbar",
                  focusMode
                    ? "px-4 pt-10 pb-24 sm:px-8 lg:px-16"
                    : "px-4 pt-8 pb-24 sm:px-6 lg:px-10"
                )}
                style={{ "--reader-pt": focusMode ? "2.5rem" : "2rem" } as CSSProperties}
              >
                <div className="mx-auto max-w-[40rem]">
                  <header className="mb-10">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-mono text-xs tabular-nums text-muted-foreground">
                        {activeChapter.lessonLabel}
                      </p>
                      <div className="flex flex-wrap items-center gap-2">
                        <ChapterDraftStatusBadge
                          hasDraft={activeChapter.hasDraft}
                          publishedAt={activeChapter.publishedAt}
                        />
                        <Link
                          href={`/courses/${course.slug}/chapters/${activeChapter.id}/edit`}
                          className="inline-flex items-center gap-1 rounded-full border border-border bg-card px-2.5 py-0.5 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
                        >
                          <Pencil className="size-3" aria-hidden />
                          Edit lesson
                        </Link>
                      </div>
                    </div>

                    <h1 className="mt-2.5 text-[1.75rem] font-bold leading-tight tracking-tight text-foreground text-balance sm:text-[2.125rem]">
                      {activeChapter.title}
                    </h1>

                    {activeChapter.summary ? (
                      <p className="mt-3 text-base leading-relaxed text-muted-foreground">
                        {activeChapter.summary}
                      </p>
                    ) : null}

                    {course.projectGoal ? (
                      <p className="mt-4 rounded-lg border border-border bg-card px-4 py-3 text-base leading-6 text-muted-foreground">
                        <span className="font-medium text-foreground">The project: </span>
                        {course.projectGoal.trim().replace(/\.+$/, "")}.
                      </p>
                    ) : null}

                    {activeChapter.isMilestone ? (
                      <p className="mt-3 inline-flex items-center gap-2 rounded-lg border border-border bg-secondary px-3 py-2 text-sm text-foreground">
                        <span className="text-xs font-semibold uppercase tracking-widest text-primary">
                          Module gate
                        </span>
                        <span className="text-muted-foreground">
                          Learners must complete every checkpoint and learning log in this milestone chapter to unlock the next module.
                        </span>
                      </p>
                    ) : null}
                  </header>

                  <SharedChecklistProvider initialChecks={{}}>
                    <PredictRevealProvider gate={false} revealed={true}>
                      <article
                        className={cn(
                          "prose prose-neutral max-w-none",
                          "prose-headings:scroll-mt-20 prose-headings:font-semibold prose-headings:tracking-tight prose-headings:text-foreground prose-headings:text-balance",
                          "prose-h2:mt-14 prose-h2:mb-5 prose-h2:border-b prose-h2:border-border prose-h2:pb-2.5 prose-h2:text-[1.5rem] prose-h2:leading-snug prose-h2:first:mt-0",
                          "prose-h3:mt-10 prose-h3:mb-3 prose-h3:text-[1.25rem] prose-h3:leading-snug",
                          "prose-p:my-5 prose-p:text-[1.0625rem] prose-p:leading-[1.8] sm:prose-p:text-[1.125rem] sm:prose-p:leading-[1.75]",
                          "prose-li:my-1.5 prose-li:text-[1.0625rem] prose-li:leading-[1.75] sm:prose-li:text-[1.125rem]",
                          "prose-a:font-medium prose-a:underline-offset-4 prose-a:decoration-foreground/30 hover:prose-a:decoration-foreground",
                          "prose-strong:font-semibold prose-strong:text-foreground",
                          "prose-code:rounded prose-code:bg-muted prose-code:px-1.5 prose-code:py-0.5 prose-code:text-[0.85em] prose-code:font-normal prose-code:before:content-none prose-code:after:content-none",
                          "prose-pre:max-w-none prose-pre:p-0 prose-pre:bg-transparent prose-pre:border-0",
                          "prose-figure:my-6",
                          "prose-blockquote:rounded-lg prose-blockquote:border-0 prose-blockquote:bg-secondary prose-blockquote:px-4 prose-blockquote:py-3 prose-blockquote:not-italic",
                          "prose-hr:border-border",
                          "prose-img:rounded-xl prose-img:border prose-img:border-border",
                          "prose-figure:my-8 prose-figcaption:text-center prose-figcaption:text-sm prose-figcaption:text-muted-foreground",
                          "prose-table:block prose-table:max-w-full prose-table:overflow-x-auto prose-th:whitespace-nowrap prose-td:align-top prose-td:text-sm"
                        )}
                      >
                        {children}
                      </article>
                    </PredictRevealProvider>
                  </SharedChecklistProvider>

                  {/* Bottom Chapter Navigation */}
                  <nav
                    aria-label="Chapter navigation"
                    className="mt-14 border-t border-border pt-8"
                  >
                    <div className="grid gap-3 sm:grid-cols-2">
                      {prevChapter ? (
                        <Link
                          href={`/courses/${course.slug}/preview?chapter=${encodeURIComponent(prevChapter.slug)}`}
                          className="group flex flex-col justify-between rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/40 hover:bg-muted/40"
                        >
                          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground group-hover:text-foreground">
                            <ArrowLeft className="size-3.5 transition-transform group-hover:-translate-x-0.5" />
                            Previous ({prevChapter.lessonNumber})
                          </span>
                          <span className="mt-1.5 line-clamp-1 text-sm font-semibold text-foreground">
                            {prevChapter.title}
                          </span>
                        </Link>
                      ) : (
                        <div />
                      )}

                      {nextChapter ? (
                        <Link
                          href={`/courses/${course.slug}/preview?chapter=${encodeURIComponent(nextChapter.slug)}`}
                          className="group flex flex-col items-end justify-between rounded-xl border border-border bg-card p-4 text-right transition-colors hover:border-primary/40 hover:bg-muted/40"
                        >
                          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground group-hover:text-foreground">
                            Next ({nextChapter.lessonNumber})
                            <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
                          </span>
                          <span className="mt-1.5 line-clamp-1 text-sm font-semibold text-foreground">
                            {nextChapter.title}
                          </span>
                        </Link>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setView("overview");
                            router.replace(`/courses/${course.slug}/preview?view=overview`, {
                              scroll: false,
                            });
                          }}
                          className="group flex flex-col items-end justify-between rounded-xl border border-primary/30 bg-primary/10 p-4 text-right transition-colors hover:bg-primary/15"
                        >
                          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary">
                            End of Course
                            <CheckCircle2 className="size-3.5" />
                          </span>
                          <span className="mt-1.5 text-sm font-semibold text-foreground">
                            Return to Course Overview
                          </span>
                        </button>
                      )}
                    </div>

                    {prevHref || nextHref ? (
                      <p className="mt-4 hidden text-center text-xs text-muted-foreground md:block">
                        Tip: press{" "}
                        {prevHref ? (
                          <>
                            <Kbd>[</Kbd> for previous chapter
                          </>
                        ) : null}
                        {prevHref && nextHref ? " and " : null}
                        {nextHref ? (
                          <>
                            <Kbd>]</Kbd> for next chapter
                          </>
                        ) : null}
                        .
                      </p>
                    ) : null}
                  </nav>
                </div>
              </main>

              {!focusMode && (
                <ChapterToc
                  headings={headings}
                  collapsed={rightCollapsed}
                  onToggle={() => setRightCollapsed(!rightCollapsed)}
                  mobileSheet={false}
                />
              )}
            </div>
          </div>

          {focusMode && <ReaderFocusDock onExitFocus={() => setFocusMode(false)} />}
        </>
      )}
    </div>
  );
}
