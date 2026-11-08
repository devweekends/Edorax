"use client";

import type { ChangeEvent } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { BookOpenCheck, ImageIcon, Upload, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { updateCourseSettings } from "@/server/actions/modules";
import type { CourseSettingsInput, CourseSettingsView } from "@/shared/api/teach";
import { uploadCourseImage } from "@/lib/course-media-upload";
import { isSafeAssetUrl } from "@/shared/lib/asset-url";
import { COURSE_CATEGORY_INFO } from "@/lib/course-categories";

type SettingsSection = "details" | "learning" | "pricing";

function settingsFromCourse(course: CourseSettingsView): CourseSettingsInput {
  return {
    title: course.title,
    description: course.description ?? "",
    coverUrl: course.coverUrl ?? "",
    projectGoal: course.projectGoal ?? "",
    difficulty: course.difficulty ?? "",
    estimatedHours: course.estimatedHours == null ? "" : String(course.estimatedHours),
    category: course.category,
    subcategory: course.subcategory ?? "",
    tags: course.tags,
    sequential: course.sequential,
    autoGradeOpenQuestions: course.autoGradeOpenQuestions,
    ...(course.hasVariants ? { variantAssignment: course.variantAssignment } : {}),
    pricingType: course.pricingType,
    priceDollars: course.pricingType === "PAID" && course.priceCents > 0 ? (course.priceCents / 100).toFixed(2) : "",
    currency: course.currency,
  };
}

function settingsFromForm(form: HTMLFormElement): CourseSettingsInput {
  const data = new FormData(form);
  const variantAssignment = data.get("variantAssignment");
  return {
    title: String(data.get("title") ?? ""),
    description: String(data.get("description") ?? ""),
    coverUrl: String(data.get("coverUrl") ?? ""),
    projectGoal: String(data.get("projectGoal") ?? ""),
    difficulty: String(data.get("difficulty") ?? ""),
    estimatedHours: String(data.get("estimatedHours") ?? ""),
    category: String(data.get("category") ?? "TECH"),
    subcategory: String(data.get("subcategory") ?? ""),
    tags: String(data.get("tags") ?? "").split(",").map((tag) => tag.trim().toLowerCase()).filter(Boolean),
    sequential: data.get("sequential") === "on",
    autoGradeOpenQuestions: data.get("autoGradeOpenQuestions") === "on",
    ...(variantAssignment === null ? {} : { variantAssignment: String(variantAssignment) }),
    pricingType: String(data.get("pricingType") ?? "FREE"),
    priceDollars: String(data.get("priceDollars") ?? ""),
    currency: String(data.get("currency") ?? "USD"),
  };
}

function sectionChanged(current: CourseSettingsInput, saved: CourseSettingsInput, section: SettingsSection): boolean {
  if (section === "details") return current.title !== saved.title || current.description !== saved.description || current.coverUrl !== saved.coverUrl;
  if (section === "learning") {
    return (
      current.projectGoal !== saved.projectGoal ||
      current.difficulty !== saved.difficulty ||
      current.estimatedHours !== saved.estimatedHours ||
      current.category !== saved.category ||
      current.subcategory !== saved.subcategory ||
      current.tags.join(",") !== saved.tags.join(",") ||
      current.sequential !== saved.sequential ||
      current.autoGradeOpenQuestions !== saved.autoGradeOpenQuestions ||
      current.variantAssignment !== saved.variantAssignment
    );
  }
  return current.pricingType !== saved.pricingType || current.priceDollars !== saved.priceDollars || current.currency !== saved.currency;
}

function mergeSection(saved: CourseSettingsInput, current: CourseSettingsInput, section: SettingsSection): CourseSettingsInput {
  if (section === "details") return { ...saved, title: current.title, description: current.description, coverUrl: current.coverUrl };
  if (section === "learning") {
    return {
      ...saved,
      projectGoal: current.projectGoal,
      difficulty: current.difficulty,
      estimatedHours: current.estimatedHours,
      category: current.category,
      subcategory: current.subcategory,
      tags: current.tags,
      sequential: current.sequential,
      autoGradeOpenQuestions: current.autoGradeOpenQuestions,
      variantAssignment: current.variantAssignment,
    };
  }
  return { ...saved, pricingType: current.pricingType, priceDollars: current.priceDollars, currency: current.currency };
}

export function CourseSettings({ course }: { course: CourseSettingsView }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [pricingType, setPricingType] = useState(course.pricingType);
  const [savingSection, setSavingSection] = useState<SettingsSection | null>(null);
  const [error, setError] = useState<{ section: SettingsSection; message: string } | null>(null);
  const [savedSection, setSavedSection] = useState<SettingsSection | null>(null);
  const [savedValues, setSavedValues] = useState(() => settingsFromCourse(course));
  const [currentValues, setCurrentValues] = useState(() => settingsFromCourse(course));
  const [coverUrl, setCoverUrl] = useState(course.coverUrl ?? "");
  const [uploading, setUploading] = useState(false);
  const coverPreviewUrl = isSafeAssetUrl(coverUrl.trim()) ? coverUrl.trim() : null;

  const syncValues = useCallback(() => {
    if (formRef.current) setCurrentValues(settingsFromForm(formRef.current));
  }, []);

  useEffect(() => { syncValues(); }, [coverUrl, pricingType, syncValues]);

  async function uploadCover(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    setSavedSection(null);
    try {
      setCoverUrl(await uploadCourseImage(course.id, "cover", file));
    } catch (cause) {
      setError({ section: "details", message: cause instanceof Error ? cause.message : "Could not upload the image. Please try again." });
    } finally {
      setUploading(false);
      event.target.value = "";
    }
  }

  async function save(section: SettingsSection) {
    if (savingSection || uploading || !formRef.current) return;
    const sectionId = section === "details" ? "course-details" : section === "learning" ? "learning-rules" : "pricing";
    const sectionElement = formRef.current.querySelector(`#${sectionId}`);
    const invalidField = Array.from(sectionElement?.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>("input, textarea, select") ?? []).find(field => !field.checkValidity());
    if (invalidField) {
      invalidField.reportValidity();
      return;
    }
    const next = mergeSection(savedValues, settingsFromForm(formRef.current), section);
    if (next.coverUrl.trim() && !isSafeAssetUrl(next.coverUrl.trim())) {
      setError({ section, message: "Use a same-origin image path or HTTPS URL for the cover." });
      return;
    }
    setSavingSection(section);
    setError(null);
    setSavedSection(null);
    try {
      const result = await updateCourseSettings({
        courseId: course.id,
        ...next,
      });
      if (!result.ok) {
        setError({ section, message: result.errors.join(" ") });
        return;
      }
      setSavedValues(next);
      setSavedSection(section);
      router.refresh();
    } catch {
      setError({ section, message: "Could not save settings. Please try again." });
    } finally {
      setSavingSection(null);
    }
  }

  function footer(section: SettingsSection) {
    const dirty = sectionChanged(currentValues, savedValues, section);
    if (!dirty && savedSection !== section && error?.section !== section) return null;
    return <div className="flex flex-wrap items-center justify-end gap-3 border-t px-5 py-4 sm:px-6">
      {error?.section === section && <p role="alert" className="mr-auto text-sm text-destructive">{error.message}</p>}
      {savedSection === section && !dirty && !error && <p role="status" className="mr-auto text-sm text-emerald-700 dark:text-emerald-400">Changes saved.</p>}
      {dirty && error?.section !== section && <p className="mr-auto text-xs text-muted-foreground">Unsaved changes</p>}
      {dirty && <Button type="button" onClick={() => void save(section)} loading={savingSection === section} loadingLabel="Saving…" disabled={savingSection !== null || uploading}>Save changes</Button>}
    </div>;
  }

  function saveFocusedSection() {
    if (!formRef.current) return;
    const sectionId = document.activeElement?.closest("section")?.id;
    const section = sectionId === "course-details" ? "details" : sectionId === "learning-rules" ? "learning" : sectionId === "pricing" ? "pricing" : null;
    if (section && sectionChanged(settingsFromForm(formRef.current), savedValues, section)) void save(section);
  }

  return (
    <form ref={formRef} onInput={syncValues} onChange={syncValues} onSubmit={(event) => { event.preventDefault(); saveFocusedSection(); }} className="space-y-6">
      <section id="course-details" aria-labelledby="course-details-title" className="scroll-mt-24 overflow-hidden rounded-2xl border bg-card">
        <SectionHeading icon={ImageIcon} title="Course details" description="The name, summary, and cover learners see in the catalog." id="course-details-title" />
        <div className="grid gap-7 p-5 sm:p-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
          <div className="space-y-5">
            <Field label="Course title" htmlFor="course-title">
              <Input id="course-title" name="title" defaultValue={course.title} minLength={3} maxLength={120} required className="h-10" />
            </Field>
            <Field label="Short description" htmlFor="course-description" hint="A quick explanation of what learners will build.">
              <Textarea id="course-description" name="description" defaultValue={course.description ?? ""} maxLength={2000} rows={5} placeholder="What will learners build and understand?" />
            </Field>
            <Field label="Cover image" htmlFor="course-cover-file" hint="JPEG, PNG, WebP, GIF, or AVIF · up to 8 MB. Save changes after uploading to publish the new cover.">
              <div className="flex flex-wrap items-center gap-3">
                <input id="course-cover-file" type="file" accept="image/jpeg,image/png,image/webp,image/gif,image/avif" onChange={(event) => void uploadCover(event)} className="sr-only" disabled={uploading} />
                <label htmlFor="course-cover-file" className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-lg border bg-background px-4 text-sm font-medium hover:bg-muted focus-within:ring-2 focus-within:ring-ring/30">
                  <Upload className="size-4" aria-hidden />{uploading ? "Uploading…" : "Upload cover"}
                </label>
                {uploading && <span role="status" className="text-sm text-muted-foreground">Sending image to storage…</span>}
              </div>
            </Field>
            <Field label="Or use an image URL" htmlFor="course-cover-url">
              <Input id="course-cover-url" name="coverUrl" type="text" inputMode="url" value={coverUrl} onChange={(event) => { setCoverUrl(event.target.value); setSavedSection(null); }} maxLength={2048} placeholder="https://example.com/cover.jpg" className="h-10" />
            </Field>
          </div>
          <div className="min-w-0">
            <p className="mb-2 text-sm font-medium">Cover preview</p>
            <div className="overflow-hidden rounded-xl border bg-muted/30">
              {coverPreviewUrl ? (
                <Image unoptimized width={1600} height={900} src={coverPreviewUrl} alt={`Cover for ${course.title}`} className="aspect-video w-full object-cover" />
              ) : (
                <div className="flex aspect-video items-center justify-center text-muted-foreground"><ImageIcon className="size-8" aria-hidden /></div>
              )}
            </div>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">This is how the cover will look after you save.</p>
          </div>
        </div>
        {footer("details")}
      </section>

      <section id="learning-rules" aria-labelledby="learning-rules-title" className="scroll-mt-24 overflow-hidden rounded-2xl border bg-card">
        <SectionHeading icon={BookOpenCheck} title="Learning experience" description="Set expectations and choose how learners move through chapters." id="learning-rules-title" />
        <div className="space-y-5 p-5 sm:p-6">
          <Field label="Project goal" htmlFor="course-goal" hint="One clear outcome learners can work toward.">
            <Input id="course-goal" name="projectGoal" defaultValue={course.projectGoal ?? ""} maxLength={1000} placeholder="Ship a real multi-vendor marketplace" className="h-10" />
          </Field>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Difficulty" htmlFor="course-difficulty">
              <select id="course-difficulty" name="difficulty" defaultValue={course.difficulty ?? ""} className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30">
                <option value="">Not set</option><option value="Beginner">Beginner</option><option value="Easy">Easy</option><option value="Medium">Medium</option><option value="Advanced">Advanced</option><option value="Hard">Hard</option>
              </select>
            </Field>
            <Field label="Estimated hours" htmlFor="course-hours">
              <Input id="course-hours" name="estimatedHours" type="number" min={1} max={1000} defaultValue={course.estimatedHours ?? ""} placeholder="12" className="h-10" />
            </Field>
          </div>
          <Field label="Catalog category" htmlFor="course-category" hint="Learners can filter the catalog by category.">
            <select id="course-category" name="category" defaultValue={course.category} className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30">
              {COURSE_CATEGORY_INFO.map((category) => <option key={category.value} value={category.value}>{category.label}</option>)}
            </select>
          </Field>
          <Field label="Subcategory" htmlFor="course-subcategory" hint="Examples: AI, Full Stack, AWS, or System Design.">
            <Input id="course-subcategory" name="subcategory" defaultValue={course.subcategory ?? ""} maxLength={80} placeholder="Full Stack" className="h-10" />
          </Field>
          <Field label="Search tags" htmlFor="course-tags" hint="Comma-separated topics learners can search and filter by.">
            <Input id="course-tags" name="tags" defaultValue={course.tags.join(", ")} maxLength={400} placeholder="React, TypeScript, APIs" className="h-10" />
          </Field>
          <label className="flex items-start gap-3 rounded-xl border bg-muted/25 p-4">
            <input type="checkbox" name="sequential" defaultChecked={course.sequential} className="mt-1 size-4 accent-primary" />
            <span><span className="block text-sm font-medium">Require chapters in order</span><span className="mt-1 block text-xs leading-5 text-muted-foreground">Learners finish the previous chapter before opening the next one.</span></span>
          </label>
          <label className="flex items-start gap-3 rounded-xl border bg-muted/25 p-4">
            <input type="checkbox" name="autoGradeOpenQuestions" defaultChecked={course.autoGradeOpenQuestions} className="mt-1 size-4 accent-primary" />
            <span>
              <span className="block text-sm font-medium">Auto-grade text open questions with AI</span>
              <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                Short answers are graded instantly with the learner&apos;s OpenRouter key instead of the mentor review queue. Learners must add a key if they have not already. URL and project submissions still go to mentors.
              </span>
            </span>
          </label>
          {course.hasVariants && (
            <Field label="Course variant" htmlFor="course-variant-assignment" hint="New learners get a variant with the fewest learners and cannot change it. Existing learners keep their choice and progress.">
              <select id="course-variant-assignment" name="variantAssignment" defaultValue={course.variantAssignment} className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30">
                <option value="SELF_SELECT">Learners choose their variant</option><option value="RANDOM">Assign a balanced variant</option>
              </select>
            </Field>
          )}
        </div>
        {footer("learning")}
      </section>

      <section id="pricing" aria-labelledby="pricing-title" className="scroll-mt-24 overflow-hidden rounded-2xl border bg-card">
        <SectionHeading icon={Wallet} title="Pricing" description="Choose how learners enroll in this course." id="pricing-title" />
        <div className="grid gap-5 p-5 sm:grid-cols-2 sm:p-6">
          <Field label="Enrollment type" htmlFor="course-pricing">
            <select id="course-pricing" name="pricingType" value={pricingType} onChange={(event) => setPricingType(event.target.value as typeof pricingType)} className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30">
              <option value="FREE">Free</option><option value="PAID">Paid</option>
            </select>
          </Field>
          <div className="hidden sm:block" />
          <Field label="Price" htmlFor="course-price" hint={pricingType === "FREE" ? "Free courses do not need a price." : undefined}>
            <Input id="course-price" name="priceDollars" type="number" min={0.01} step={0.01} defaultValue={course.pricingType === "PAID" && course.priceCents > 0 ? (course.priceCents / 100).toFixed(2) : ""} disabled={pricingType === "FREE"} required={pricingType === "PAID"} placeholder="49.00" className="h-10" />
          </Field>
          <Field label="Currency" htmlFor="course-currency">
            <Input id="course-currency" name="currency" defaultValue={course.currency} minLength={3} maxLength={3} required placeholder="USD" className="h-10" />
          </Field>
          {pricingType === "PAID" && <p className="text-xs leading-5 text-muted-foreground sm:col-span-2">Payment collection depends on the course checkout configuration.</p>}
        </div>
        {footer("pricing")}
      </section>
    </form>
  );
}

function SectionHeading({ icon: Icon, title, description, id }: { icon: typeof ImageIcon; title: string; description: string; id: string }) {
  return <div className="flex items-start gap-3 border-b bg-muted/15 px-5 py-4 sm:px-6"><span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg border bg-background text-muted-foreground"><Icon className="size-4" aria-hidden /></span><div><h2 id={id} className="text-base font-semibold">{title}</h2><p className="mt-0.5 text-sm text-muted-foreground">{description}</p></div></div>;
}

function Field({ label, htmlFor, hint, children }: { label: string; htmlFor: string; hint?: string; children: React.ReactNode }) {
  return <div className="space-y-2"><Label htmlFor={htmlFor}>{label}</Label>{children}{hint && <p className="text-xs leading-5 text-muted-foreground">{hint}</p>}</div>;
}
