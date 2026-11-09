import Link from "next/link";
import { redirect } from "next/navigation";
import type { Checkout } from "@/shared/api/catalog";
import {
  purchaseCourseAccessAction,
  selfEnrollInCourseAction,
} from "@/server/actions/enroll";
import { requireVerifiedUser } from "@/server/auth/guards";
import { serverApiFetchOrNotFound } from "@/lib/api-server";
import { formatPriceCents } from "@/lib/format-price";
import { Input } from "@/components/ui/input";
import { PendingSubmitButton } from "@/components/ui/pending-submit-button";
import { CourseCover } from "@/components/learn/course-cover";
import { CheckoutPaidPending } from "@/components/learn/checkout-paid-pending";

function couponErrorMessage(code: string | undefined) {
  if (code === "COUPON_EXHAUSTED") return "This code has no redemptions remaining.";
  if (code === "COUPON_NOT_APPLICABLE") return "This code cannot be used for this course.";
  return "This code is invalid or expired.";
}

export default async function CourseCheckoutPage({
  params,
  searchParams,
}: {
  params: Promise<{ courseSlug: string }>;
  searchParams: Promise<{ paid?: string; checkout_failed?: string; code?: string; coupon_error?: string; discount_applied?: string }>;
}) {
  const { courseSlug } = await params;
  const {
    paid,
    checkout_failed: checkoutFailed,
    code: checkoutErrorCode,
    coupon_error: couponError,
    discount_applied: discountApplied,
  } = await searchParams;
  await requireVerifiedUser();
  const { course, enrollment, state, automaticDiscount, organizationDiscount, amountDueCents } = await serverApiFetchOrNotFound<Checkout>(
    `/api/v1/courses/${encodeURIComponent(courseSlug)}/checkout`
  );
  if (state === "already_paid") {
    redirect(`/courses/${course.slug}`);
  }

  if (course.pricingType !== "PAID") {
    redirect(`/catalog/${course.slug}`);
  }

  if (paid === "1" && state === "payment_required") {
    return <CheckoutPaidPending courseSlug={course.slug} courseTitle={course.title} />;
  }

  const listPriceLabel = formatPriceCents(course.priceCents, course.currency);
  const priceLabel = formatPriceCents(amountDueCents, course.currency);
  const discountAmountCents = Math.max(0, course.priceCents - amountDueCents);
  const discountAmountLabel = discountAmountCents > 0 ? formatPriceCents(discountAmountCents, course.currency) : null;
  const derivedDiscountPercent =
    course.priceCents > 0 && discountAmountCents > 0 ? Math.round((discountAmountCents / course.priceCents) * 100) : 0;
  const discountPercent = organizationDiscount?.percentOff ?? automaticDiscount?.percentOff ?? derivedDiscountPercent;
  const discountLabel = organizationDiscount?.label ?? automaticDiscount?.label ?? null;
  const discountLockedIn = Boolean(organizationDiscount) || (Boolean(enrollment) && discountAmountCents > 0);
  const description = course.description?.trim() || course.projectGoal?.trim() || null;
  const checkoutErrorMessage =
    checkoutErrorCode === "PAYMENTS_NOT_CONFIGURED"
      ? "Online payments are not configured yet. Please try again later or contact support."
      : "We couldn’t start checkout. Please try again.";

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-7 sm:px-6 sm:py-10">
      <Link href={`/catalog/${course.slug}`} className="text-sm text-muted-foreground hover:text-foreground">
        ← Back to course
      </Link>

      <header className="mt-6">
        <h1 className="text-3xl font-semibold tracking-tight">Checkout</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
          Review the course, apply a discount if you have one, then pay securely to unlock full access.
        </p>
      </header>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(18rem,0.85fr)] lg:items-start">
        <section className="overflow-hidden rounded-2xl border bg-card">
          <CourseCover coverUrl={course.coverUrl} title={course.title} aspect="banner" className="rounded-none" />
          <div className="border-b border-border p-6 sm:p-8">
            <p className="text-sm text-muted-foreground">
              {course.instructorName ? `Instructor · ${course.instructorName}` : "Instructor-led course"}
            </p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">{course.title}</h2>
            {description ? <p className="mt-3 text-sm leading-6 text-muted-foreground">{description}</p> : null}
            <dl className="mt-4 flex flex-wrap gap-4 text-sm text-muted-foreground">
              {course.difficulty ? (
                <div>
                  <dt className="sr-only">Difficulty</dt>
                  <dd>{course.difficulty}</dd>
                </div>
              ) : null}
              {course.estimatedHours ? (
                <div>
                  <dt className="sr-only">Duration</dt>
                  <dd>~{course.estimatedHours} hours</dd>
                </div>
              ) : null}
              <div>
                <dt className="sr-only">Access</dt>
                <dd>Lifetime course access</dd>
              </div>
            </dl>
          </div>

          <div className="p-6 sm:p-8">
            <h3 className="text-sm font-semibold">Order summary</h3>
            <dl className="mt-4 space-y-3 text-sm">
              <div className="flex items-start justify-between gap-4">
                <dt className="text-muted-foreground">Course access</dt>
                <dd className="font-medium tabular-nums">{listPriceLabel}</dd>
              </div>
              {discountPercent > 0 && discountAmountLabel ? (
                <div className="flex items-start justify-between gap-4">
                  <dt className="max-w-[70%] text-muted-foreground">
                    {discountPercent}% off
                    {discountLabel ? <span className="mt-0.5 block text-xs">{discountLabel}</span> : null}
                  </dt>
                  <dd className="font-medium tabular-nums text-primary">−{discountAmountLabel}</dd>
                </div>
              ) : null}
              <div className="flex items-baseline justify-between gap-4 border-t pt-4">
                <dt className="font-semibold">Amount due</dt>
                <dd className="text-2xl font-semibold tracking-tight tabular-nums">{priceLabel}</dd>
              </div>
            </dl>
            {discountPercent > 0 ? (
              <p className="mt-4 rounded-xl border bg-muted/20 px-3 py-2 text-sm text-muted-foreground">
                {organizationDiscount
                  ? `Organization discount applied: ${organizationDiscount.percentOff}% off.`
                  : automaticDiscount
                    ? `Automatic discount available: ${automaticDiscount.percentOff}% off.`
                    : `${discountPercent}% discount applied.`}
              </p>
            ) : null}
          </div>
        </section>

        <aside className="space-y-4 lg:sticky lg:top-8">
          <section className="rounded-2xl border bg-card p-6">
            <h2 className="text-xl font-semibold tracking-tight">Payment</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Pay once. Access unlocks as soon as payment succeeds.
            </p>

            {discountApplied === "1" ? (
              <p role="status" className="mt-4 rounded-xl border border-ok/30 bg-ok-soft px-3 py-2 text-sm text-ok">
                Discount applied. Pay the remaining {priceLabel} to unlock the course.
              </p>
            ) : null}

            {discountLockedIn ? (
              <div className="mt-6 rounded-xl border bg-muted/20 p-3 text-sm">
                <p className="font-medium">
                  {organizationDiscount ? "Organization discount reserved" : "Discount applied"}
                </p>
                <p className="mt-1 text-muted-foreground">
                  {discountPercent}% off
                  {discountLabel ? ` · ${discountLabel}` : ""}. Remaining amount due: {priceLabel}.
                </p>
              </div>
            ) : (
              <div className="mt-6">
                <h3 className="text-sm font-semibold">Discount code</h3>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  Have a code? Apply it before paying. A 100% discount unlocks the course immediately.
                </p>
                {couponError ? (
                  <p role="alert" className="mt-3 text-sm text-destructive">
                    {couponErrorMessage(couponError)}
                  </p>
                ) : null}
                <form action={selfEnrollInCourseAction} className="mt-3 flex flex-col gap-2 sm:flex-row">
                  <input type="hidden" name="courseId" value={course.id} />
                  <input type="hidden" name="courseSlug" value={course.slug} />
                  <Input
                    name="couponCode"
                    required
                    minLength={3}
                    maxLength={32}
                    placeholder="Enter code"
                    aria-label="Discount code"
                    className="sm:flex-1"
                  />
                  <PendingSubmitButton pendingLabel="Applying…" variant="outline">
                    Apply
                  </PendingSubmitButton>
                </form>
              </div>
            )}

            <div className="mt-6 border-t pt-5">
              <div className="flex items-baseline justify-between gap-4">
                <p className="text-sm text-muted-foreground">Total today</p>
                <p className="text-2xl font-semibold tracking-tight tabular-nums">{priceLabel}</p>
              </div>
              {discountPercent > 0 ? (
                <p className="mt-1 text-right text-xs text-muted-foreground">{discountPercent}% off · was {listPriceLabel}</p>
              ) : null}

              {checkoutFailed === "1" ? (
                <p role="alert" className="mt-4 text-sm text-destructive">
                  {checkoutErrorMessage}
                </p>
              ) : null}

              <form action={purchaseCourseAccessAction} className="mt-5">
                <input type="hidden" name="courseId" value={course.id} />
                <input type="hidden" name="courseSlug" value={course.slug} />
                {enrollment ? <input type="hidden" name="enrollmentId" value={enrollment.id} /> : null}
                <PendingSubmitButton pendingLabel="Redirecting to Polar…" size="lg" className="w-full">
                  Pay {priceLabel}
                </PendingSubmitButton>
              </form>

              <p className="mt-3 text-center text-xs leading-5 text-muted-foreground">
                You’ll finish payment on Polar, then return here with course access unlocked.
              </p>
            </div>
          </section>

          <p className="px-1 text-center text-xs text-muted-foreground sm:text-left">
            Card details are handled by Polar. Edorax never stores your payment information.
          </p>

          <div className="flex justify-center lg:justify-start">
            <Link href="/my-courses" className="text-sm text-muted-foreground hover:text-foreground">
              Back to my learning
            </Link>
          </div>
        </aside>
      </div>
    </div>
  );
}
