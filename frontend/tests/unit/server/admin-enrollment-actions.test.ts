import { beforeEach, describe, expect, it, vi } from "vitest";

const serverApiFetch = vi.fn();
const revalidatePath = vi.fn();

vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("@/lib/api-server", () => ({ serverApiFetch }));

const { removeUserEnrollmentAction, enrollUserInCourseAction } = await import(
  "@/server/actions/admin/users"
);

describe("removeUserEnrollmentAction", () => {
  beforeEach(() => {
    serverApiFetch.mockReset();
    revalidatePath.mockReset();
  });

  it("calls the delete endpoint and revalidates paths on success", async () => {
    serverApiFetch.mockResolvedValue(undefined);

    const formData = new FormData();
    formData.set("userId", "usr-123");
    formData.set("enrollmentId", "enr-456");

    const result = await removeUserEnrollmentAction({ ok: false, message: "" }, formData);

    expect(result).toEqual({ ok: true, message: "Enrollment removed." });
    expect(serverApiFetch).toHaveBeenCalledWith(
      "/api/v1/admin/users/usr-123/enrollments/enr-456",
      { method: "DELETE" }
    );
    expect(revalidatePath).toHaveBeenCalledWith("/admin/users/usr-123");
    expect(revalidatePath).toHaveBeenCalledWith("/admin/users");
    expect(revalidatePath).toHaveBeenCalledWith("/admin/audit");
  });

  it("returns error state when enrollmentId is missing", async () => {
    const formData = new FormData();
    formData.set("userId", "usr-123");

    const result = await removeUserEnrollmentAction({ ok: false, message: "" }, formData);

    expect(result).toEqual({ ok: false, message: "Missing enrollment." });
    expect(serverApiFetch).not.toHaveBeenCalled();
  });
});

describe("enrollUserInCourseAction", () => {
  beforeEach(() => {
    serverApiFetch.mockReset();
    revalidatePath.mockReset();
  });

  it("calls the enroll endpoint and revalidates paths on success", async () => {
    serverApiFetch.mockResolvedValue({ id: "enr-789" });

    const formData = new FormData();
    formData.set("userId", "usr-123");
    formData.set("courseId", "crs-999");

    const result = await enrollUserInCourseAction({ ok: false, message: "" }, formData);

    expect(result).toEqual({ ok: true, message: "User enrolled in course." });
    expect(serverApiFetch).toHaveBeenCalledWith(
      "/api/v1/admin/users/usr-123/enroll",
      { method: "POST", json: { courseId: "crs-999" } }
    );
    expect(revalidatePath).toHaveBeenCalledWith("/admin/users/usr-123");
  });

  it("validates required fields", async () => {
    const formData = new FormData();
    formData.set("userId", "");
    formData.set("courseId", "crs-1");

    const missingUser = await enrollUserInCourseAction({ ok: false, message: "" }, formData);
    expect(missingUser).toEqual({ ok: false, message: "Missing user." });

    formData.set("userId", "usr-1");
    formData.set("courseId", "");
    const missingCourse = await enrollUserInCourseAction({ ok: false, message: "" }, formData);
    expect(missingCourse).toEqual({ ok: false, message: "Select a course." });
  });
});

