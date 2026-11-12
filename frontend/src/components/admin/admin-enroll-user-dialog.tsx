"use client";

import { useEffect, useId, useMemo, useRef, useState, useTransition } from "react";
import { GraduationCap, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/app-toast";
import { adminSelectClassName } from "@/components/admin/admin-ui";
import { enrollUserInCourseAction } from "@/server/actions/admin/users";
import type { AdminActionState } from "@/server/actions/admin/action-result";

const initialState: AdminActionState = { ok: false, message: "" };

export function AdminEnrollUserDialog({
  userId,
  userEmail,
  courses,
}: {
  userId: string;
  userEmail: string;
  courses: Array<{ id: string; title: string; slug: string }>;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [courseId, setCourseId] = useState("");
  const [pending, startTransition] = useTransition();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const selectId = useId();
  const searchId = useId();

  const filteredCourses = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return courses;
    return courses.filter(
      (course) =>
        course.title.toLowerCase().includes(q) || course.slug.toLowerCase().includes(q)
    );
  }, [courses, search]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  function openDialog() {
    setCourseId("");
    setSearch("");
    setOpen(true);
  }

  function closeDialog() {
    if (pending) return;
    setOpen(false);
  }

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      const result = await enrollUserInCourseAction(initialState, formData);
      if (result.message) {
        toast(result.message, result.ok ? "success" : "error");
      }
      if (result.ok) {
        setCourseId("");
        setSearch("");
        setOpen(false);
      }
    });
  }

  if (courses.length === 0) {
    return null;
  }

  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={openDialog}>
        <GraduationCap className="size-4" aria-hidden />
        Enroll in course
      </Button>
      <dialog
        ref={dialogRef}
        onClose={() => setOpen(false)}
        onClick={(event) => {
          if (event.target === event.currentTarget) closeDialog();
        }}
        aria-labelledby={`${selectId}-title`}
        className="fixed inset-0 z-[70] m-0 h-full max-h-none w-full max-w-none border-0 bg-transparent p-0 backdrop:bg-background/70 open:flex open:items-center open:justify-center open:p-4"
      >
        <form
          action={handleSubmit}
          className="w-full max-w-md overflow-hidden rounded-2xl border border-border bg-card text-card-foreground shadow-xl"
        >
          <input type="hidden" name="userId" value={userId} />
          <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
            <div>
              <h2 id={`${selectId}-title`} className="text-base font-semibold">
                Enroll in course
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Grant {userEmail} immediate active access to a published course.
              </p>
            </div>
            <button
              type="button"
              onClick={closeDialog}
              className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              aria-label="Close enroll dialog"
            >
              <X className="size-4" aria-hidden />
            </button>
          </div>

          <div className="space-y-4 p-5">
            {courses.length > 5 ? (
              <div className="space-y-1.5">
                <Label htmlFor={searchId}>Filter courses</Label>
                <div className="relative">
                  <Search
                    className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-muted-foreground"
                    aria-hidden
                  />
                  <input
                    id={searchId}
                    type="search"
                    value={search}
                    onChange={(event) => {
                      setSearch(event.target.value);
                      setCourseId("");
                    }}
                    placeholder="Search by title or slug…"
                    className={`${adminSelectClassName} w-full pl-8`}
                  />
                </div>
              </div>
            ) : null}

            <div className="space-y-1.5">
              <Label htmlFor={selectId}>Select course</Label>
              <select
                id={selectId}
                name="courseId"
                required
                value={courseId}
                onChange={(event) => setCourseId(event.target.value)}
                className={`${adminSelectClassName} w-full`}
              >
                <option value="" disabled>
                  {filteredCourses.length === 0 ? "No matching courses" : "Choose a course…"}
                </option>
                {filteredCourses.map((course) => (
                  <option key={course.id} value={course.id}>
                    {course.title}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-border bg-muted/30 px-5 py-3">
            <Button type="button" variant="ghost" onClick={closeDialog} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending || !courseId}>
              {pending ? "Enrolling…" : "Enroll user"}
            </Button>
          </div>
        </form>
      </dialog>
    </>
  );
}

