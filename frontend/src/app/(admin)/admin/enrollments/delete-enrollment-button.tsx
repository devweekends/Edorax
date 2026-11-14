import { Trash2 } from "lucide-react";
import { AdminActionForm } from "@/components/admin/admin-action-form";
import { deleteEnrollmentAction } from "@/server/actions/admin/enrollments";

/** Trash icon that deletes the enrollment and everything attached to it, after a confirm. */
export function DeleteEnrollmentButton({
  enrollmentId,
  learner,
  courseTitle,
  paid,
  redirectToList,
}: {
  enrollmentId: string;
  learner: string;
  courseTitle: string;
  paid: string | null;
  redirectToList?: boolean;
}) {
  return (
    <AdminActionForm
      action={deleteEnrollmentAction}
      submitLabel="Delete enrollment"
      pendingLabel="…"
      variant="ghost"
      size="sm"
      icon={<Trash2 className="size-4 text-destructive" aria-hidden />}
      confirm={{
        question: `Delete ${learner}'s enrollment in ${courseTitle}?`,
        description:
          "This permanently removes the enrollment from the database with its progress, answers, payment record and certificate. " +
          (paid ? `The ${paid} payment is not refunded; refund it first if the learner should get money back. ` : "") +
          "This cannot be undone.",
        confirmLabel: "Delete permanently",
      }}
    >
      <input type="hidden" name="enrollmentId" value={enrollmentId} />
      {redirectToList ? <input type="hidden" name="redirectTo" value="list" /> : null}
    </AdminActionForm>
  );
}
