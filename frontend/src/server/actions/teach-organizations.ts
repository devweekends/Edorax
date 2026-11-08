"use server";

import { revalidatePath } from "next/cache";
import { teachCall, type TeachActionFailure } from "./teach-call";

export type TeachOrgActionResult = { ok: true; data: any } | TeachActionFailure;

export async function setCourseFreeOrganizationsAction(
  courseId: string,
  organizationIds: string[]
): Promise<TeachOrgActionResult> {
  if (!courseId) {
    return { ok: false, errors: ["Missing course ID."] };
  }

  const result = await teachCall(`/api/v1/teach/courses/${encodeURIComponent(courseId)}/free-organizations`, {
    method: "POST",
    json: { organizationIds },
  });

  if (result.ok) {
    revalidatePath("/organizations");
  }

  return result;
}

export async function reviewOrgCourseRequestAction(
  requestId: string,
  decision: "APPROVED" | "REJECTED",
  grantFreeAccess: boolean
): Promise<TeachOrgActionResult> {
  if (!requestId) {
    return { ok: false, errors: ["Missing request ID."] };
  }

  const result = await teachCall(`/api/v1/teach/organization-requests/${encodeURIComponent(requestId)}/review`, {
    method: "POST",
    json: { decision, grantFreeAccess },
  });

  if (result.ok) {
    revalidatePath("/organizations");
  }

  return result;
}

