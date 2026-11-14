import type { ReactNode } from "react";
import type { AdminEnrollmentDetail } from "@/shared/api/admin";
import { AdminActionForm } from "@/components/admin/admin-action-form";
import { adminSelectClassName } from "@/components/admin/admin-ui";
import { updateEnrollmentAction } from "@/server/actions/admin/enrollments";

const LIFECYCLES = [
  ["ACTIVE", "Active — has access"],
  ["COMPLETED", "Completed — has access"],
  ["PAYMENT_REQUIRED", "Payment required — no access"],
  ["PENDING_ACCOUNT", "Pending account — no access"],
  ["CANCELLED", "Cancelled — no access"],
  ["EXPIRED", "Expired — no access"],
] as const;
const PAYMENT_STATUSES = [
  ["PENDING", "Pending"],
  ["SUCCEEDED", "Paid"],
  ["FAILED", "Failed"],
  ["REFUNDED", "Refunded"],
] as const;

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium">{label}</span>
      {children}
      {hint ? <span className="block text-xs text-muted-foreground">{hint}</span> : null}
    </label>
  );
}

function Select({ name, value, options }: { name: string; value: string; options: ReadonlyArray<readonly [string, string]> }) {
  return (
    <select name={name} defaultValue={value} className={adminSelectClassName}>
      {options.map(([optionValue, label]) => (
        <option key={optionValue} value={optionValue}>
          {label}
        </option>
      ))}
    </select>
  );
}

/** Admin edit of the two things that can be changed by hand: course access and payment status. */
export function EnrollmentEditForm({ enrollment }: { enrollment: AdminEnrollmentDetail }) {
  const payment = enrollment.payment;
  return (
    <AdminActionForm action={updateEnrollmentAction} submitLabel="Save changes" pendingLabel="Saving…" className="space-y-4">
      <input type="hidden" name="enrollmentId" value={enrollment.id} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Access" hint="Active and Completed can open the course; the rest cannot.">
          <Select name="lifecycle" value={enrollment.lifecycle} options={LIFECYCLES} />
        </Field>
        {payment ? (
          <Field label="Payment status" hint="Changes our record only. No money moves through Polar; use a refund for that.">
            <Select name="paymentStatus" value={payment.status} options={PAYMENT_STATUSES} />
          </Field>
        ) : (
          <p className="self-center text-sm text-muted-foreground">No payment record, so there is no payment status to change.</p>
        )}
      </div>
    </AdminActionForm>
  );
}
