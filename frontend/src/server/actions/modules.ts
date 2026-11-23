"use server";

import { revalidatePath } from "next/cache";
import type { CourseSettingsInput } from "@/shared/api/teach";
import { teachCall } from "./teach-call";

export type CourseBuilderActionResult =
  | { ok: true }
  | { ok: false; errors: string[] };

async function builderCall(
  path: string,
  init: { method: "POST" | "PATCH" | "PUT"; json?: unknown },
): Promise<CourseBuilderActionResult> {
  const result = await teachCall<unknown>(path, init);
  if (!result.ok) return result;
  // Every course edit page re-renders; the builder has no stable slug at hand here.
  revalidatePath("/courses/[courseSlug]/edit", "page");
  revalidatePath("/courses/[courseSlug]/settings", "page");
  return { ok: true };
}

export async function createModule(input: {
  courseId: string;
  title: string;
}): Promise<CourseBuilderActionResult> {
  return builderCall(
    `/api/v1/teach/courses/${encodeURIComponent(input.courseId)}/modules`,
    { method: "POST", json: { title: input.title } },
  );
}

export async function renameModule(input: {
  moduleId: string;
  title: string;
}): Promise<CourseBuilderActionResult> {
  return builderCall(
    `/api/v1/teach/modules/${encodeURIComponent(input.moduleId)}`,
    { method: "PATCH", json: { title: input.title } },
  );
}

export async function moveModule(input: {
  moduleId: string;
  direction: "up" | "down";
}): Promise<CourseBuilderActionResult> {
  return builderCall(
    `/api/v1/teach/modules/${encodeURIComponent(input.moduleId)}/move`,
    { method: "POST", json: { direction: input.direction } },
  );
}

export async function updateCourseIntegrity(input: {
  courseId: string;
  integritySnapshots?: boolean;
  integrityMode?: "STANDARD" | "SECURE";
}): Promise<CourseBuilderActionResult> {
  const { courseId, ...settings } = input;
  return builderCall(
    `/api/v1/teach/courses/${encodeURIComponent(courseId)}/integrity`,
    { method: "PUT", json: settings },
  );
}

export async function updateCourseCertificateTemplate(input: {
  courseId: string;
  template: string;
}): Promise<CourseBuilderActionResult> {
  return builderCall(
    `/api/v1/teach/courses/${encodeURIComponent(input.courseId)}/certificate-template`,
    { method: "PUT", json: { template: input.template } },
  );
}

export async function updateCourseSettings(
  input: { courseId: string } & CourseSettingsInput,
): Promise<CourseBuilderActionResult> {
  const { courseId, ...settings } = input;
  return builderCall(
    `/api/v1/teach/courses/${encodeURIComponent(courseId)}/settings`,
    { method: "PATCH", json: settings },
  );
}
