import type { AdminEnrollmentDiscount, AdminPaymentStatus } from "@/shared/api/admin";
import { Badge } from "@/components/ui/badge";

const LABELS: Record<AdminPaymentStatus, string> = {
  PENDING: "Pending",
  SUCCEEDED: "Paid",
  FAILED: "Failed",
  REFUNDED: "Refunded",
};

/** Payment status for an enrollment; no payment row means free or granted by an admin. */
export function PaymentStatusBadge({ status }: { status: AdminPaymentStatus | null }) {
  if (!status) return <Badge variant="outline">No payment</Badge>;
  const variant = status === "SUCCEEDED" ? "secondary" : status === "FAILED" || status === "REFUNDED" ? "destructive" : "outline";
  return <Badge variant={variant}>{LABELS[status]}</Badge>;
}

/** Whether money changed hands: a completed payment, or one that was later refunded. */
export function wasCharged(status: AdminPaymentStatus | null | undefined) {
  return status === "SUCCEEDED" || status === "REFUNDED";
}

const DISCOUNT_KIND_LABELS: Record<AdminEnrollmentDiscount["kind"], string> = {
  campaign: "Campaign",
  instructor_coupon: "Coupon",
  organization_coupon: "Org coupon",
  admin_enrollment: "Admin enrollment",
};

/** Short badge for one coupon or campaign, e.g. "Campaign · BLACKFRIDAY · 30% off". */
export function DiscountBadge({ discount }: { discount: AdminEnrollmentDiscount }) {
  if (discount.kind === "admin_enrollment") {
    return <Badge variant="secondary">Admin enrollment · {discount.percentOff}% off</Badge>;
  }
  const parts = [DISCOUNT_KIND_LABELS[discount.kind], discount.code ?? discount.label, `${discount.percentOff}% off`];
  return (
    <Badge variant="secondary" title={discount.label}>
      {parts.join(" · ")}
    </Badge>
  );
}

export function discountKindLabel(kind: AdminEnrollmentDiscount["kind"]) {
  return DISCOUNT_KIND_LABELS[kind];
}

const PROVIDER_LABELS: Record<string, string> = { polar: "Polar", admin: "Admin", manual: "Manual" };

/** Who took the payment: polar, admin, manual, or another provider name as stored. */
export function providerLabel(provider: string) {
  return PROVIDER_LABELS[provider] ?? provider;
}
