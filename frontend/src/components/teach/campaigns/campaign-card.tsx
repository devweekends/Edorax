"use client";

import { useState, useTransition } from "react";
import { setCampaignParticipationAction } from "@/server/actions/teach-campaigns";
import type { InstructorCampaignCourse, InstructorCampaignItem } from "@/shared/api/teach";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertCircle, Calendar, Check, CheckCircle2, ChevronDown, Sparkles, Tag } from "lucide-react";
import { cn } from "@/lib/utils";

export function CampaignCard({
  campaign,
  allCourses,
}: {
  campaign: InstructorCampaignItem;
  allCourses: InstructorCampaignCourse[];
}) {
  const [selectedIds, setSelectedIds] = useState<string[]>(campaign.participatingCourseIds);
  const [statusMessage, setStatusMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [isPending, startTransition] = useTransition();
  const [isExpanded, setIsExpanded] = useState(campaign.participatingCourseIds.length === 0);

  const eligibleSet = new Set(campaign.eligibleCourseIds);
  const eligibleCourses = allCourses.filter((course) => eligibleSet.has(course.id));
  const participatingCount = selectedIds.filter((id) => eligibleSet.has(id)).length;

  const toggleCourse = (courseId: string) => {
    setSelectedIds((prev) =>
      prev.includes(courseId) ? prev.filter((id) => id !== courseId) : [...prev, courseId]
    );
  };

  const selectAll = () => {
    setSelectedIds(eligibleCourses.map((c) => c.id));
  };

  const deselectAll = () => {
    setSelectedIds([]);
  };

  const handleSave = () => {
    setStatusMessage(null);
    startTransition(async () => {
      const res = await setCampaignParticipationAction(campaign.id, selectedIds);
      if (res.ok) {
        setStatusMessage({ ok: true, text: "Campaign participation updated successfully!" });
        setIsExpanded(false);
      } else {
        setStatusMessage({ ok: false, text: res.errors.join(", ") });
      }
    });
  };

  const hasChanges =
    selectedIds.length !== campaign.participatingCourseIds.length ||
    selectedIds.some((id) => !campaign.participatingCourseIds.includes(id));
  const bodyId = `campaign-${campaign.id}-details`;
  const headingId = `campaign-${campaign.id}-heading`;

  return (
    <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
      {/* Header — always visible, clicking toggles body */}
      <button
        type="button"
        onClick={() => setIsExpanded((v) => !v)}
        className="w-full text-left border-b border-border bg-muted/20 p-5 sm:p-6 hover:bg-muted/30 transition-colors"
        aria-expanded={isExpanded}
        aria-controls={bodyId}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="grid size-9 place-items-center rounded-lg bg-primary/10 text-primary">
              <Sparkles className="size-4" />
            </span>
            <div>
              <h2 id={headingId} className="text-lg font-semibold tracking-tight">{campaign.label}</h2>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <Badge variant="outline" className="font-normal capitalize">
                  Scope: {campaign.scope.toLowerCase().replace(/_/g, " ")}
                </Badge>
                {campaign.autoApply ? (
                  <Badge variant="secondary" className="bg-primary/10 text-primary">
                    Auto-applied at checkout
                  </Badge>
                ) : campaign.code ? (
                  <Badge variant="secondary" className="font-mono">
                    Code: {campaign.code}
                  </Badge>
                ) : null}
                {campaign.expiresAt ? (
                  <span className="flex items-center gap-1 text-muted-foreground">
                    <Calendar className="size-3" />
                    Ends {new Date(campaign.expiresAt).toLocaleDateString()}
                  </span>
                ) : (
                  <span className="text-muted-foreground">Ongoing</span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="text-right">
              <span className="text-2xl font-black text-primary tabular-nums">
                {campaign.percentOff}% OFF
              </span>
              <p className="text-xs text-muted-foreground">Platform-sponsored discount</p>
            </div>

            {/* Summary pill + chevron */}
            <div className="flex flex-col items-end gap-1">
              <Badge
                variant="secondary"
                className={cn(
                  "text-xs",
                  participatingCount > 0
                    ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                    : "bg-muted text-muted-foreground"
                )}
              >
                {participatingCount}/{eligibleCourses.length} course
                {eligibleCourses.length !== 1 ? "s" : ""} participating
              </Badge>
              <ChevronDown
                className={cn(
                  "size-4 text-muted-foreground transition-transform",
                  isExpanded && "rotate-180"
                )}
              />
            </div>
          </div>
        </div>
      </button>

      {/* Collapsible body */}
      {isExpanded && (
        <div id={bodyId} role="region" aria-labelledby={headingId} className="p-5 sm:p-6 space-y-4">
          {statusMessage ? (
            <div
              className={`flex items-center gap-2 rounded-lg p-3 text-sm ${
                statusMessage.ok
                  ? "border border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                  : "border border-destructive/30 bg-destructive/10 text-destructive"
              }`}
            >
              {statusMessage.ok ? (
                <CheckCircle2 className="size-4 shrink-0" />
              ) : (
                <AlertCircle className="size-4 shrink-0" />
              )}
              <span>{statusMessage.text}</span>
            </div>
          ) : null}

          {/* Payout note */}
          <div className="rounded-lg bg-primary/5 border border-primary/15 px-4 py-3 text-sm text-muted-foreground">
            <span className="font-medium text-foreground">Payout: </span>
            You receive <span className="font-semibold text-primary">50% of the discounted price</span> for
            each campaign enrollment. Example: \$100 course with {campaign.percentOff}% discount →
            learner pays ${((100 * (1 - campaign.percentOff / 100))).toFixed(0)} →
            you earn ${((100 * (1 - campaign.percentOff / 100)) * 0.5).toFixed(0)}.
          </div>

          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <p className="font-medium text-foreground">Select courses to include in this campaign:</p>
            {eligibleCourses.length > 1 ? (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={selectAll}
                  className="text-primary hover:underline font-medium"
                >
                  Select all
                </button>
                <span>·</span>
                <button
                  type="button"
                  onClick={deselectAll}
                  className="hover:underline font-medium"
                >
                  Clear all
                </button>
              </div>
            ) : null}
          </div>

          {eligibleCourses.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              <Tag className="mx-auto size-6 text-muted-foreground/60" />
              <p className="mt-2 font-medium">None of your courses match this campaign</p>
              <p className="mt-0.5 text-xs">
                This campaign only targets specific categories or courses.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-border rounded-lg border border-border">
              {eligibleCourses.map((course) => {
                const isChecked = selectedIds.includes(course.id);
                const discountedPrice = (course.priceCents * (1 - campaign.percentOff / 100)) / 100;
                const instructorEarning = discountedPrice * 0.5;
                return (
                  <label
                    key={course.id}
                    className="flex items-center justify-between gap-4 p-3.5 hover:bg-muted/30 cursor-pointer select-none transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggleCourse(course.id)}
                        className="size-4 rounded border-input text-primary focus:ring-primary"
                      />
                      <div>
                        <span className="text-sm font-medium">{course.title}</span>
                        <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground">
                          <span>Original: ${(course.priceCents / 100).toFixed(2)}</span>
                          <span>·</span>
                          <span className="text-primary font-medium">
                            Learner pays: ${discountedPrice.toFixed(2)}
                          </span>
                          <span>·</span>
                          <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                            You earn: ${instructorEarning.toFixed(2)}
                          </span>
                        </div>
                      </div>
                    </div>

                    {isChecked ? (
                      <Badge variant="secondary" className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 gap-1 text-xs">
                        <Check className="size-3" /> Participating
                      </Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">Not participating</span>
                    )}
                  </label>
                );
              })}
            </div>
          )}

          {eligibleCourses.length > 0 ? (
            <div className="flex items-center justify-between pt-2">
              <p className="text-xs text-muted-foreground">
                {participatingCount} of {eligibleCourses.length} course
                {eligibleCourses.length === 1 ? "" : "s"} participating
              </p>
              <Button
                type="button"
                onClick={handleSave}
                disabled={isPending || (!hasChanges && !statusMessage)}
              >
                {isPending ? "Saving…" : "Save participation"}
              </Button>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
