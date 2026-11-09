"use client";

import { Fragment, useActionState, useEffect, useMemo, useRef, useState } from "react";
import { Check, ListFilter, Search, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/app-toast";
import { bulkUpsertOrganizationCourseAllocationsAction } from "@/server/actions/admin/organizations";
import { cn } from "@/lib/utils";

type Course = {
  id: string;
  title: string;
  slug: string;
  allocated: boolean;
  pendingRequest: boolean;
  maxEnrollments: number;
  expiresAt: string;
};

type Draft = { maxEnrollments: string; expiresAt: string };
type View = "all" | "assigned" | "available";
const initialState = { ok: false, message: "" };

export function OrganizationCourseDrawer({ organizationId, courses }: { organizationId: string; courses: Course[] }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [view, setView] = useState<View>("all");
  const [selected, setSelected] = useState<Set<string>>(() => new Set(courses.filter((course) => course.allocated).map((course) => course.id)));
  const [drafts, setDrafts] = useState<Record<string, Draft>>(() =>
    Object.fromEntries(courses.map((course) => [course.id, { maxEnrollments: String(course.maxEnrollments), expiresAt: course.expiresAt }]))
  );
  const [state, formAction] = useActionState(bulkUpsertOrganizationCourseAllocationsAction, initialState);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  // While the drawer is open, the page behind it should not scroll.
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  useEffect(() => {
    if (state.message) {
      toast(state.message, state.ok ? "success" : "error");
    }
  }, [state]);

  // Search narrows the list first; the segment view then splits it into assigned and available.
  const searched = useMemo(() => {
    const query = search.trim().toLowerCase();
    return query
      ? courses.filter((course) => course.title.toLowerCase().includes(query) || course.slug.toLowerCase().includes(query))
      : courses;
  }, [courses, search]);

  const assignedVisible = searched.filter((course) => selected.has(course.id));
  const availableVisible = searched.filter((course) => !selected.has(course.id));
  const shown = view === "assigned" ? assignedVisible : view === "available" ? availableVisible : searched;

  const assignedCount = courses.filter((course) => selected.has(course.id)).length;
  const availableCount = courses.length - assignedCount;
  const changedCount = courses.filter((course) => selected.has(course.id) !== course.allocated).length;

  function toggle(courseId: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(courseId)) next.delete(courseId);
      else next.add(courseId);
      return next;
    });
  }

  function updateDraft(courseId: string, patch: Partial<Draft>) {
    setDrafts((current) => ({ ...current, [courseId]: { ...current[courseId], ...patch } }));
  }

  function assignShown() {
    setSelected((current) => new Set([...current, ...shown.map((course) => course.id)]));
  }

  function removeShown() {
    setSelected((current) => {
      const next = new Set(current);
      shown.forEach((course) => next.delete(course.id));
      return next;
    });
  }

  function openManager() {
    setSelected(new Set(courses.filter((course) => course.allocated).map((course) => course.id)));
    setDrafts(Object.fromEntries(courses.map((course) => [course.id, { maxEnrollments: String(course.maxEnrollments), expiresAt: course.expiresAt }])));
    setSearch("");
    setView("all");
    setOpen(true);
  }

  const segments: { value: View; label: string; count: number }[] = [
    { value: "all", label: "All", count: courses.length },
    { value: "assigned", label: "Assigned", count: assignedCount },
    { value: "available", label: "Available", count: availableCount },
  ];

  function renderRow(course: Course) {
    const checked = selected.has(course.id);
    const draft = drafts[course.id];
    return (
      <li key={course.id} className={cn("flex items-center gap-3 px-4 py-2.5 transition-colors sm:px-5", checked ? "bg-primary/[0.04]" : "hover:bg-muted/40")}>
        <button
          type="button"
          onClick={() => toggle(course.id)}
          aria-pressed={checked}
          aria-label={`${checked ? "Remove" : "Assign"} ${course.title}`}
          className={cn(
            "grid size-5 shrink-0 place-items-center rounded-md border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            checked ? "border-primary bg-primary text-primary-foreground" : "border-input bg-background hover:border-primary"
          )}
        >
          {checked ? <Check className="size-3.5" aria-hidden /> : null}
        </button>
        <button type="button" onClick={() => toggle(course.id)} className="min-w-0 flex-1 text-left">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className="truncate text-sm font-medium leading-snug hover:text-primary">{course.title}</span>
            {course.pendingRequest && !checked ? (
              <Badge variant="outline" className="border-amber-500/40 text-[10px] text-amber-800 dark:text-amber-200">Requested</Badge>
            ) : null}
          </span>
          <span className="block truncate font-mono text-[11px] text-muted-foreground">{course.slug}</span>
        </button>
        {checked ? (
          <div className="flex shrink-0 items-center gap-2" onClick={(event) => event.stopPropagation()}>
            <label className="sr-only" htmlFor={`max-${course.id}`}>Max enrollments for {course.title}</label>
            <Input
              id={`max-${course.id}`}
              type="number"
              min={1}
              value={draft.maxEnrollments}
              onChange={(event) => updateDraft(course.id, { maxEnrollments: event.target.value })}
              aria-label={`Max enrollments for ${course.title}`}
              title="Max enrollments"
              className="h-8 w-20 px-2 text-xs tabular-nums"
            />
            <Input
              type="date"
              value={draft.expiresAt}
              onChange={(event) => updateDraft(course.id, { expiresAt: event.target.value })}
              aria-label={`Expiry date for ${course.title}`}
              title="Expires (optional)"
              className="h-8 w-36 px-2 text-xs"
            />
          </div>
        ) : null}
      </li>
    );
  }

  function renderGroup(title: string, list: Course[], tone: "assigned" | "available") {
    if (list.length === 0) return null;
    return (
      <section aria-label={title}>
        <h3 className={cn("sticky top-0 z-10 flex items-center justify-between border-b border-border px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] sm:px-5", tone === "assigned" ? "bg-card text-primary" : "bg-muted text-muted-foreground")}>
          {title}
          <span className="tabular-nums">{list.length}</span>
        </h3>
        <ul className="divide-y divide-border">{list.map(renderRow)}</ul>
      </section>
    );
  }

  return (
    <>
      <Button type="button" size="sm" variant="outline" onClick={openManager}>
        <ListFilter className="size-4" aria-hidden />
        Manage courses
      </Button>

      <dialog ref={dialogRef} onClose={() => setOpen(false)} aria-labelledby="course-access-title" className="fixed inset-0 z-[70] m-0 h-dvh max-h-none w-screen max-w-none overflow-hidden border-0 bg-transparent p-0 backdrop:bg-background/70 open:flex open:justify-end">
        <div className="flex h-dvh w-full max-w-2xl flex-col overflow-hidden border-l border-border bg-background text-foreground shadow-2xl">
          <div className="flex items-center justify-between gap-4 border-b border-border bg-card px-5 py-3 sm:px-7">
            <div className="min-w-0">
              <h2 id="course-access-title" className="text-base font-semibold tracking-tight">Manage courses</h2>
              <p className="truncate text-xs text-muted-foreground">Assigned courses are available to this organization&apos;s integration.</p>
            </div>
            <button type="button" onClick={() => setOpen(false)} className="rounded-xl p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label="Close course management">
              <X className="size-5" aria-hidden />
            </button>
          </div>

          <form action={formAction} className="flex min-h-0 flex-1 flex-col">
            <input type="hidden" name="organizationId" value={organizationId} />
            {courses.map((course) => {
              if (selected.has(course.id)) {
                const draft = drafts[course.id];
                return (
                  <Fragment key={course.id}>
                    <input type="hidden" name="courseIds" value={course.id} />
                    <input type="hidden" name={`maxEnrollments_${course.id}`} value={draft.maxEnrollments} />
                    <input type="hidden" name={`expiresAt_${course.id}`} value={draft.expiresAt} />
                  </Fragment>
                );
              }
              return course.allocated ? <input key={course.id} type="hidden" name="removeCourseIds" value={course.id} /> : null;
            })}

            <div className="space-y-2.5 border-b border-border bg-card px-5 py-3 sm:px-7">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search courses by title or slug…" aria-label="Search courses" className="h-10 pl-9" />
              </div>

              <div role="tablist" aria-label="Filter courses" className="flex gap-1 overflow-hidden rounded-xl bg-muted p-1">
                {segments.map((segment) => {
                  const active = view === segment.value;
                  return (
                    <button
                      key={segment.value}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      onClick={() => setView(segment.value)}
                      className={cn(
                        "flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        active ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      {segment.label}
                      <span className={cn("rounded-full px-1.5 text-[10px] font-semibold tabular-nums", active ? "bg-primary/10 text-primary" : "bg-background/60")}>
                        {segment.count}
                      </span>
                    </button>
                  );
                })}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex gap-2">
                  <Button type="button" size="sm" variant="outline" onClick={assignShown} disabled={shown.length === 0}>
                    Assign {shown.length} shown
                  </Button>
                  <Button type="button" size="sm" variant="ghost" onClick={removeShown} disabled={shown.length === 0}>
                    Remove {shown.length} shown
                  </Button>
                </div>
                <span className={cn("text-xs font-medium", changedCount ? "text-primary" : "text-muted-foreground")}>
                  {changedCount ? `${changedCount} unsaved change${changedCount === 1 ? "" : "s"}` : "No unsaved changes"}
                </span>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto">
              {shown.length === 0 ? (
                <p className="px-6 py-16 text-center text-sm text-muted-foreground">
                  {search.trim()
                    ? "No courses match your search."
                    : view === "assigned"
                      ? "No courses are assigned yet. Switch to Available to add some."
                      : view === "available"
                        ? "Every course is already assigned."
                        : "No published courses to assign."}
                </p>
              ) : view === "all" ? (
                <>
                  {renderGroup(`Assigned (${assignedVisible.length})`, assignedVisible, "assigned")}
                  {renderGroup(`Available (${availableVisible.length})`, availableVisible, "available")}
                </>
              ) : (
                <ul className="divide-y divide-border">{shown.map(renderRow)}</ul>
              )}
            </div>

            <div className="flex items-center justify-between gap-3 border-t border-border bg-card px-5 py-4 sm:px-7">
              <p className="text-xs text-muted-foreground tabular-nums">
                {assignedCount} of {courses.length} assigned · Changes apply after saving
              </p>
              <div className="flex gap-2">
                <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
                <Button type="submit" disabled={changedCount === 0} loadingLabel="Saving…">Save changes</Button>
              </div>
            </div>
          </form>
        </div>
      </dialog>
    </>
  );
}
