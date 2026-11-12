"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ArrowRight, BookOpenText, Check, CheckCheck, ChevronDown, Clock3, MessageCircle, Search, X } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { HelpThreadSummary } from "@/shared/api/help";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { useRealtimeEvent } from "@/lib/realtime";
import { LearnerQuestionDrawer } from "./learner-question-drawer";

type View = "all" | "new" | "waiting" | "resolved";

function questionState(thread: HelpThreadSummary) {
  if (thread.unread) return { label: "New reply", tone: "text-ok bg-ok-soft", icon: MessageCircle };
  if (thread.status === "RESOLVED") return { label: "Resolved", tone: "text-muted-foreground bg-muted", icon: CheckCheck };
  if (thread.preview?.fromMentor) return { label: "Mentor replied", tone: "text-foreground bg-primary/10", icon: MessageCircle };
  return { label: "Waiting for mentor", tone: "text-foreground bg-brand-yellow/15", icon: Clock3 };
}

function when(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export function LearnerQuestionsOverview({
  threads,
  viewerId,
  initialCourse,
  initialChapter,
  initialQuestionId,
}: {
  threads: HelpThreadSummary[];
  viewerId: string;
  initialCourse?: string;
  initialChapter?: string;
  initialQuestionId?: string;
}) {
  const router = useRouter();
  const [view, setView] = useState<View>("all");
  const [readIds, setReadIds] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [course, setCourse] = useState(initialCourse ?? "");
  const [chapter, setChapter] = useState(initialChapter ?? "");
  const [selectedId, setSelectedId] = useState<string | null>(() => threads.some((thread) => thread.id === initialQuestionId) ? initialQuestionId! : null);
  const [drawerIds, setDrawerIds] = useState<string[]>(() => threads.map((thread) => thread.id));
  const rows = useMemo(() => threads.map((thread) => readIds.includes(thread.id) ? { ...thread, unread: false } : thread), [threads, readIds]);
  useRealtimeEvent("help-message", (event) => {
    if (threads.some((thread) => thread.id === event.threadId)) {
      router.refresh();
    }
  });
  const markRead = useCallback((id: string) => {
    setReadIds((current) => current.includes(id) ? current : [...current, id]);
  }, []);
  const courses = useMemo(() => Array.from(new Map(rows.map((thread) => [thread.course.slug, thread.course])).values()), [rows]);
  const newCount = rows.filter((thread) => thread.unread).length;
  const waitingCount = rows.filter((thread) => thread.status === "OPEN" && !thread.preview?.fromMentor).length;
  const resolvedCount = rows.filter((thread) => thread.status === "RESOLVED").length;
  const selectedCourse = courses.find((item) => item.slug === course);
  const normalizedSearch = search.trim().toLocaleLowerCase();
  const visible = rows.filter((thread) => {
    if (course && thread.course.slug !== course) return false;
    if (chapter && thread.chapter?.slug !== chapter) return false;
    if (view === "new" && !thread.unread) return false;
    if (view === "waiting" && (thread.status !== "OPEN" || thread.preview?.fromMentor)) return false;
    if (view === "resolved" && thread.status !== "RESOLVED") return false;
    if (!normalizedSearch) return true;
    return [thread.course.title, thread.chapter?.title, thread.question, thread.preview?.body]
      .some((value) => value?.toLocaleLowerCase().includes(normalizedSearch));
  });

  const tabs: { id: View; label: string; count: number }[] = [
    { id: "all", label: "All questions", count: rows.length },
    { id: "new", label: "New replies", count: newCount },
    { id: "waiting", label: "Waiting", count: waitingCount },
    { id: "resolved", label: "Resolved", count: resolvedCount },
  ];

  function setQuestionUrl(id: string | null) {
    const url = new URL(window.location.href);
    if (id) url.searchParams.set("question", id);
    else url.searchParams.delete("question");
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  }

  function openQuestion(id: string) {
    setDrawerIds(visible.map((thread) => thread.id));
    setSelectedId(id);
    setQuestionUrl(id);
  }

  function selectQuestion(id: string) {
    setSelectedId(id);
    setQuestionUrl(id);
  }

  function closeQuestion() {
    setSelectedId(null);
    setQuestionUrl(null);
  }

  return (
    <>
      <div className="mt-7 grid gap-3 sm:grid-cols-3">
        <button type="button" aria-pressed={view === "new"} onClick={() => setView("new")} className={cn("flex items-center gap-4 rounded-2xl border bg-card p-4 text-left transition-colors hover:border-foreground/30 hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", view === "new" && "border-foreground/40 ring-1 ring-foreground/10")}>
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-ok-soft text-ok"><MessageCircle className="size-5" aria-hidden /></span>
          <span><span className="block text-2xl font-semibold leading-none">{newCount}</span><span className="mt-1 block text-sm text-muted-foreground">New replies</span></span>
        </button>
        <button type="button" aria-pressed={view === "waiting"} onClick={() => setView("waiting")} className={cn("flex items-center gap-4 rounded-2xl border bg-card p-4 text-left transition-colors hover:border-foreground/30 hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", view === "waiting" && "border-foreground/40 ring-1 ring-foreground/10")}>
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-yellow/15 text-foreground"><Clock3 className="size-5" aria-hidden /></span>
          <span><span className="block text-2xl font-semibold leading-none">{waitingCount}</span><span className="mt-1 block text-sm text-muted-foreground">Waiting for mentor</span></span>
        </button>
        <button type="button" aria-pressed={view === "resolved"} onClick={() => setView("resolved")} className={cn("flex items-center gap-4 rounded-2xl border bg-card p-4 text-left transition-colors hover:border-foreground/30 hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", view === "resolved" && "border-foreground/40 ring-1 ring-foreground/10")}>
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground"><CheckCheck className="size-5" aria-hidden /></span>
          <span><span className="block text-2xl font-semibold leading-none">{resolvedCount}</span><span className="mt-1 block text-sm text-muted-foreground">Resolved</span></span>
        </button>
      </div>

      <section aria-labelledby="questions-heading" className="mt-9">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 id="questions-heading" className="text-xl font-semibold tracking-tight">Question history</h2>
            <p className="mt-1 text-sm text-muted-foreground">Pick up a conversation or revisit an answer.</p>
          </div>
          <span className="text-sm text-muted-foreground">{visible.length} {visible.length === 1 ? "question" : "questions"} shown</span>
        </div>

        <div className="mt-5 overflow-hidden rounded-2xl border bg-card">
          <div className="flex flex-col gap-3 border-b p-4 lg:flex-row lg:items-center lg:justify-between lg:gap-4">
            <div aria-label="Filter questions by status" className="flex w-full gap-1 overflow-x-auto rounded-xl bg-muted/60 p-1 lg:w-auto">
              {tabs.map((tab) => (
                <button key={tab.id} type="button" aria-pressed={view === tab.id} onClick={() => setView(tab.id)} className={cn("flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", view === tab.id && "bg-background text-foreground ")}>
                  {tab.label}<span className="text-xs tabular-nums opacity-65">{tab.count}</span>
                </button>
              ))}
            </div>
            <div className="flex flex-col gap-2 sm:flex-row lg:min-w-0">
              <label className="relative block min-w-0 flex-1 lg:w-56">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                <span className="sr-only">Search questions</span>
                <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search questions" className="h-10 w-full rounded-lg border bg-background pl-9 pr-3 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/20" />
              </label>
              <DropdownMenu>
                <DropdownMenuTrigger render={<button type="button" className="flex h-10 min-w-0 items-center gap-2 rounded-lg border bg-background px-3 text-left text-sm outline-none hover:bg-muted/50 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/20 sm:w-52" aria-label="Filter questions by course" />}>
                  <BookOpenText className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                  <span className="min-w-0 flex-1 truncate">{selectedCourse?.title ?? "All courses"}</span>
                  <ChevronDown className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="max-h-80 w-[min(22rem,calc(100vw-2rem))] overflow-y-auto rounded-xl p-1.5">
                  <DropdownMenuItem onClick={() => { setCourse(""); setChapter(""); }} className="min-h-10 gap-2 px-3"><span className="flex-1">All courses</span>{!course && <Check className="size-4 text-primary" aria-hidden />}</DropdownMenuItem>
                  <DropdownMenuSeparator />
                  {courses.map((item) => <DropdownMenuItem key={item.slug} onClick={() => { setCourse(item.slug); setChapter(""); }} className="min-h-10 gap-2 px-3 py-2"><span className="min-w-0 flex-1 whitespace-normal">{item.title}</span>{course === item.slug && <Check className="size-4 shrink-0 text-primary" aria-hidden />}</DropdownMenuItem>)}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
          {chapter && <div className="flex items-center gap-2 border-b bg-muted/20 px-4 py-2.5 text-sm text-muted-foreground">Showing questions from this lesson <button type="button" onClick={() => setChapter("")} className="inline-flex items-center gap-1 rounded-md px-2 py-1 font-medium text-foreground hover:bg-muted"><X className="size-3.5" aria-hidden /> Clear lesson filter</button></div>}

          {visible.length === 0 ? (
            <div className="flex flex-col items-center px-6 py-14 text-center">
              <Search className="size-7 text-muted-foreground" aria-hidden />
              <h3 className="mt-3 font-semibold">No matching questions</h3>
              <p className="mt-1 max-w-sm text-sm text-muted-foreground">Try another status, course, or search term.</p>
              <button type="button" onClick={() => { setView("all"); setSearch(""); setCourse(""); setChapter(""); }} className="mt-4 text-sm font-medium underline underline-offset-4">Clear filters</button>
            </div>
          ) : visible.length > 60 ? (
            <WindowedQuestionHistory key={`${view}:${course}:${chapter}:${search}`} threads={visible} onOpen={openQuestion} />
          ) : (
            <ul className="divide-y">{visible.map((thread) => <QuestionRow key={thread.id} thread={thread} onOpen={openQuestion} />)}</ul>
          )}
        </div>
      </section>
      <LearnerQuestionDrawer selectedId={selectedId} threadIds={drawerIds} viewerId={viewerId} onClose={closeQuestion} onSelect={selectQuestion} onRead={markRead} />
    </>
  );
}

function WindowedQuestionHistory({ threads, onOpen }: { threads: HelpThreadSummary[]; onOpen: (id: string) => void }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  // TanStack Virtual manages scroll measurements inside this leaf component.
  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: threads.length,
    getScrollElement: () => scrollRef.current,
    getItemKey: (index: number) => threads[index]?.id ?? index,
    estimateSize: () => 160,
    overscan: 5,
    useFlushSync: false,
    initialRect: { width: 900, height: 600 },
  });

  return <div ref={scrollRef} className="max-h-[70vh] overflow-y-auto" role="region" aria-label="Question history" tabIndex={0}>
    <ul className="relative" style={{ height: virtualizer.getTotalSize() }}>
      {virtualizer.getVirtualItems().map((item) => <QuestionRow
        key={item.key}
        thread={threads[item.index]}
        onOpen={onOpen}
        dataIndex={item.index}
        position={item.index + 1}
        setSize={threads.length}
        measure={virtualizer.measureElement}
        style={{ position: "absolute", top: 0, left: 0, width: "100%", transform: `translateY(${item.start}px)` }}
      />)}
    </ul>
  </div>;
}

function QuestionRow({ thread, onOpen, dataIndex, position, setSize, measure, style }: {
  thread: HelpThreadSummary;
  onOpen: (id: string) => void;
  dataIndex?: number;
  position?: number;
  setSize?: number;
  measure?: (element: HTMLLIElement | null) => void;
  style?: React.CSSProperties;
}) {
  const state = questionState(thread);
  const Icon = state.icon;
  return <li data-index={dataIndex} aria-posinset={position} aria-setsize={setSize} ref={measure} style={style} className="border-b last:border-b-0">
    <button type="button" onClick={() => onOpen(thread.id)} className="group flex w-full flex-col gap-3 px-4 py-4 text-left transition-colors hover:bg-muted/35 focus-visible:bg-muted/35 focus-visible:outline-none sm:flex-row sm:items-start sm:justify-between sm:gap-6 sm:px-5">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          <span className="font-medium text-foreground/80">{thread.course.title}</span>
          {thread.kind === "LESSON_REPORT" && (
            <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-destructive">
              Report{thread.category ? ` · ${thread.category.toLowerCase().replace("_", " ")}` : ""}
            </span>
          )}
          <span aria-hidden>·</span><span>Asked <time dateTime={thread.createdAt}>{when(thread.createdAt)}</time></span>
        </div>
        <h3 className="mt-1.5 line-clamp-1 text-base font-semibold tracking-tight group-hover:underline group-hover:underline-offset-2">{thread.chapter?.title ?? "Course question"}</h3>
        <p className="mt-1 line-clamp-2 text-sm leading-6 text-muted-foreground">{thread.question ?? "Open the conversation to read this question."}</p>
        {thread.preview && thread.preview.body !== thread.question && <p className="mt-2 line-clamp-1 text-xs text-muted-foreground"><span className="font-semibold text-foreground/80">{thread.preview.fromMentor ? "Mentor" : "You"}:</span> {thread.preview.body} <span aria-hidden>·</span> <time dateTime={thread.preview.createdAt}>{when(thread.preview.createdAt)}</time></p>}
      </div>
      <div className="flex shrink-0 items-center justify-between gap-3 sm:min-w-36 sm:flex-col sm:items-end sm:justify-start">
        <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold", state.tone)}><Icon className="size-3.5" aria-hidden />{state.label}</span>
        <span className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground group-hover:text-foreground">Open conversation <ArrowRight className="size-3.5" aria-hidden /></span>
      </div>
    </button>
  </li>;
}
