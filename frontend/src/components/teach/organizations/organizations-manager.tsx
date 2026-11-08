"use client";

import { useMemo, useState } from "react";
import { Building2, Check, ChevronDown, Clock3, GraduationCap, Search, ShieldCheck, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatPriceCents } from "@/lib/format-price";
import {
  reviewOrgCourseRequestAction,
  setCourseFreeOrganizationsAction,
} from "@/server/actions/teach-organizations";
import type {
  InstructorCourseFreeAccessItem,
  InstructorOrganizationItem,
  InstructorOrgCourseRequestItem,
} from "@/shared/api/teach";

type Props = {
  organizations: InstructorOrganizationItem[];
  courses: InstructorCourseFreeAccessItem[];
  requests: InstructorOrgCourseRequestItem[];
};

export function OrganizationsManager({ organizations, courses, requests }: Props) {
  const [selectedByOrganization, setSelectedByOrganization] = useState<Record<string, string[]>>(
    () =>
      Object.fromEntries(
        organizations.map((organization) => [
          organization.id,
          courses
            .filter((course) => course.freeOrganizationIds.includes(organization.id))
            .map((course) => course.id),
        ])
      )
  );
  const [expandedOrganizations, setExpandedOrganizations] = useState<string[]>(
    organizations.length ? [organizations[0].id] : []
  );
  const [courseSearch, setCourseSearch] = useState("");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [savingOrganizationId, setSavingOrganizationId] = useState<string | null>(null);
  const [reviewingRequestId, setReviewingRequestId] = useState<string | null>(null);

  const visibleCourses = useMemo(() => {
    const query = courseSearch.trim().toLowerCase();
    if (!query) return courses;
    return courses.filter((course) =>
      [course.title, course.slug].some((value) => value.toLowerCase().includes(query))
    );
  }, [courseSearch, courses]);

  function toggleOrganization(organizationId: string) {
    setExpandedOrganizations((current) =>
      current.includes(organizationId)
        ? current.filter((id) => id !== organizationId)
        : [...current, organizationId]
    );
  }

  function toggleCourse(organizationId: string, courseId: string) {
    setSelectedByOrganization((current) => {
      const selected = current[organizationId] ?? [];
      return {
        ...current,
        [organizationId]: selected.includes(courseId)
          ? selected.filter((id) => id !== courseId)
          : [...selected, courseId],
      };
    });
    setMessage(null);
  }

  async function saveOrganization(organization: InstructorOrganizationItem) {
    setSavingOrganizationId(organization.id);
    setMessage(null);
    const selectedCourseIds = new Set(selectedByOrganization[organization.id] ?? []);
    const updates = courses
      .filter((course) => selectedCourseIds.has(course.id) !== course.freeOrganizationIds.includes(organization.id))
      .map((course) => {
        const organizationIds = new Set(course.freeOrganizationIds);
        if (selectedCourseIds.has(course.id)) organizationIds.add(organization.id);
        else organizationIds.delete(organization.id);
        return setCourseFreeOrganizationsAction(course.id, [...organizationIds]);
      });

    const results = await Promise.all(updates);
    const failure = results.find((result) => !result.ok);
    setSavingOrganizationId(null);
    setMessage(
      failure && !failure.ok
        ? { ok: false, text: failure.errors.join(" ") }
        : { ok: true, text: `${organization.name} course access was updated.` }
    );
  }

  async function reviewRequest(request: InstructorOrgCourseRequestItem, decision: "APPROVED" | "REJECTED") {
    setReviewingRequestId(request.id);
    setMessage(null);
    const result = await reviewOrgCourseRequestAction(request.id, decision, decision === "APPROVED");
    setReviewingRequestId(null);
    setMessage(
      result.ok
        ? { ok: true, text: `Request ${decision.toLowerCase()} successfully.` }
        : { ok: false, text: result.errors.join(" ") }
    );
  }

  return (
    <div className="space-y-8 pb-12">
      {message ? (
        <p
          role={message.ok ? "status" : "alert"}
          className={`rounded-lg border px-4 py-3 text-sm ${
            message.ok
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
              : "border-destructive/30 bg-destructive/10 text-destructive"
          }`}
        >
          {message.text}
        </p>
      ) : null}

      <section className="rounded-2xl border bg-card p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
            <ShieldCheck className="size-5" aria-hidden />
          </span>
          <div>
            <h2 className="text-lg font-semibold">Free access by organization</h2>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              Open an organization below, search your published paid courses, and choose which courses it can assign for free.
            </p>
          </div>
        </div>

        <div className="relative mt-6">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <input
            type="search"
            value={courseSearch}
            onChange={(event) => setCourseSearch(event.target.value)}
            placeholder="Search courses by title or slug"
            aria-label="Search courses"
            className="h-10 w-full rounded-lg border border-input bg-background pl-9 pr-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>

        {organizations.length === 0 ? (
          <div className="mt-6 rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
            No organizations are available yet.
          </div>
        ) : courses.length === 0 ? (
          <div className="mt-6 rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
            Publish a paid course to configure organization access.
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            {organizations.map((organization) => {
              const isExpanded = expandedOrganizations.includes(organization.id);
              const selectedIds = new Set(selectedByOrganization[organization.id] ?? []);
              const selectedCount = selectedIds.size;
              return (
                <div key={organization.id} className="overflow-hidden rounded-xl border bg-background/50">
                  <button
                    type="button"
                    onClick={() => toggleOrganization(organization.id)}
                    aria-expanded={isExpanded}
                    className="flex w-full items-center gap-3 p-4 text-left hover:bg-muted/30"
                  >
                    <Building2 className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">{organization.name}</span>
                      <span className="mt-0.5 block truncate text-xs text-muted-foreground">{organization.slug}</span>
                    </span>
                    <Badge variant={selectedCount ? "secondary" : "outline"}>
                      {selectedCount} course{selectedCount === 1 ? "" : "s"}
                    </Badge>
                    <ChevronDown className={`size-4 text-muted-foreground transition-transform ${isExpanded ? "rotate-180" : ""}`} aria-hidden />
                  </button>

                  {isExpanded ? (
                    <div className="border-t p-4">
                      {visibleCourses.length === 0 ? (
                        <p className="py-6 text-center text-sm text-muted-foreground">No courses match your search.</p>
                      ) : (
                        <div className="space-y-2">
                          {visibleCourses.map((course) => {
                            const checked = selectedIds.has(course.id);
                            return (
                              <label
                                key={course.id}
                                className="flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-colors hover:bg-muted/40"
                              >
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() => toggleCourse(organization.id, course.id)}
                                  className="size-4 rounded border-input accent-primary"
                                />
                                <span className="min-w-0 flex-1">
                                  <span className="block truncate text-sm font-medium">{course.title}</span>
                                  <span className="mt-0.5 block text-xs text-muted-foreground">
                                    {formatPriceCents(course.priceCents, course.currency)} · {course.slug}
                                  </span>
                                </span>
                                {checked ? <Check className="size-4 text-primary" aria-hidden /> : null}
                              </label>
                            );
                          })}
                        </div>
                      )}
                      <div className="mt-4 flex items-center justify-between gap-3 border-t pt-4">
                        <p className="text-xs text-muted-foreground">
                          Selected courses are free only when assigned by this organization.
                        </p>
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => void saveOrganization(organization)}
                          disabled={savingOrganizationId !== null}
                        >
                          {savingOrganizationId === organization.id ? "Saving…" : "Save courses"}
                        </Button>
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="rounded-2xl border bg-card p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-amber-500/10 text-amber-600">
            <Clock3 className="size-5" aria-hidden />
          </span>
          <div>
            <h2 className="text-lg font-semibold">Organization requests</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Review requests from organizations that want access to one of your courses.
            </p>
          </div>
        </div>

        {requests.length === 0 ? (
          <div className="mt-6 rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
            No organization course requests yet.
          </div>
        ) : (
          <div className="mt-6 divide-y rounded-xl border">
            {requests.map((request) => (
              <div key={request.id} className="flex flex-wrap items-center justify-between gap-4 p-4">
                <div className="flex min-w-0 items-start gap-3">
                  <Building2 className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                  <div className="min-w-0">
                    <p className="truncate font-medium">{request.organizationName}</p>
                    <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
                      <GraduationCap className="size-3.5" aria-hidden />
                      <span className="truncate">{request.courseTitle}</span>
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Requested {new Date(request.requestedAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>
                {request.status === "PENDING" ? (
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => void reviewRequest(request, "APPROVED")}
                      disabled={reviewingRequestId !== null}
                    >
                      {reviewingRequestId === request.id ? "Saving…" : "Approve & allow free access"}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => void reviewRequest(request, "REJECTED")}
                      disabled={reviewingRequestId !== null}
                    >
                      <X className="size-3.5" aria-hidden />
                      Reject
                    </Button>
                  </div>
                ) : (
                  <Badge variant={request.status === "APPROVED" ? "secondary" : "outline"}>
                    {request.status.toLowerCase()}
                  </Badge>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
