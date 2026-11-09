import Link from "next/link";
import { redirect } from "next/navigation";
import type { Checkout } from "@/shared/api/catalog";
import {
  requestCourseAccessAction,
  selfEnrollInCourseAction,
} from "@/server/actions/enroll";
import { requireVerifiedUser } from "@/server/auth/guards";
import { serverApiFetchOrNotFound } from "@/lib/api-server";
import { formatPriceCents } from "@/lib/format-price";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export default async function CourseCheckoutPage({
  params,
  searchParams,
}: {
  params: Promise<{ courseSlug: string }>;
  searchParams: Promise<{ requested?: string; request_failed?: string; email_unavailable?: string; coupon_error?: string }>;
}) {
  const { courseSlug } = await params;
  const { requested, request_failed, email_unavailable: emailUnavailable, coupon_error: couponError } = await searchParams;
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

  const priceLabel = formatPriceCents(amountDueCents, course.currency);

  return (
    <div className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center px-6 py-16">
      <Link href={`/catalog/${course.slug}`} className="text-sm text-muted-foreground hover:text-foreground">
        ← Back to course details
      </Link>

      <h1 className="mt-6 text-2xl font-semibold tracking-tight">Enroll in {course.title}</h1>
      <p className="mt-2 text-sm text-muted-foreground">{organizationDiscount ? "Your organization assigned a course discount. Request access after arranging the remaining payment with an administrator." : "Use a discount code or request access after arranging payment with an administrator."}</p>
      {automaticDiscount ? <p className="mt-4 rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm"><strong>{automaticDiscount.percentOff}% discount applied:</strong> {automaticDiscount.label}. Your adjusted price is {priceLabel}.</p> : null}
      {organizationDiscount ? <p className="mt-4 rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm"><strong>{organizationDiscount.percentOff}% organization discount applied:</strong> {organizationDiscount.label}. The discount is reserved for your assignment; amount remaining is {priceLabel}.</p> : null}

      <div className="mt-8 space-y-5">
        {!organizationDiscount ? <section className="rounded-2xl border bg-card p-6">
          <h2 className="font-semibold">Have a discount code?</h2>
          <p className="mt-1 text-sm text-muted-foreground">Enter a discount code, or use an automatic discount when one is available. A full discount gives immediate access; an administrator will confirm any remaining payment.</p>
          {couponError ? <p role="alert" className="mt-3 text-sm text-destructive">{couponError === "COUPON_EXHAUSTED" ? "This code has no redemptions remaining." : couponError === "COUPON_NOT_APPLICABLE" ? "This code cannot be used for this course." : "This code is invalid or expired."}</p> : null}
          <form action={selfEnrollInCourseAction} className="mt-4 flex flex-col gap-3 sm:flex-row">
            <input type="hidden" name="courseId" value={course.id} />
            <input type="hidden" name="courseSlug" value={course.slug} />
            <Input name="couponCode" required minLength={3} maxLength={32} placeholder="Enter coupon code" aria-label="Coupon code" className="sm:flex-1" />
            <Button type="submit">Apply discount</Button>
          </form>
        </section> : null}

        <section className="rounded-2xl border bg-card p-6">
          <h2 className="font-semibold">Request access</h2>
          <p className="mt-1 text-sm text-muted-foreground">No online payment is collected here. The administrators will contact you to arrange direct payment and grant course access.</p>
          <div className="mt-4 flex items-baseline justify-between gap-4 border-t pt-4">
            <span className="text-sm text-muted-foreground">Amount due{organizationDiscount ? ` · ${organizationDiscount.percentOff}% off` : automaticDiscount ? ` · ${automaticDiscount.percentOff}% off` : ""}</span>
            <span className="text-2xl font-semibold tabular-nums">{priceLabel}</span>
          </div>
          {request_failed === "1" && <p role="alert" className="mt-4 text-sm text-destructive">We couldn’t send your request. Please try again or contact an administrator.</p>}
          {requested === "1" && <p role="status" className="mt-4 text-sm">{emailUnavailable === "1" ? "Your request is recorded for administrator review. Email notification is unavailable right now." : "Your request was sent to the administrators."}</p>}
          {!enrollment || automaticDiscount ? (
            <form action={selfEnrollInCourseAction} className="mt-5">
              <input type="hidden" name="courseId" value={course.id} />
              <input type="hidden" name="courseSlug" value={course.slug} />
              <Button type="submit" className="w-full">{automaticDiscount ? `Apply ${automaticDiscount.percentOff}% discount and continue` : "Request access"}</Button>
            </form>
          ) : (
            <form action={requestCourseAccessAction} className="mt-5">
              <input type="hidden" name="enrollmentId" value={enrollment.id} />
              <input type="hidden" name="courseSlug" value={course.slug} />
              <Button type="submit" className="w-full">{requested === "1" ? "Send request again" : "Request access"}</Button>
            </form>
          )}
        </section>
      </div>

      <Link href="/my-courses" className={cn(buttonVariants({ variant: "ghost" }), "mt-6 self-center")}>
        My learning
      </Link>
    </div>
  );
}
