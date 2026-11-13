"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

/** After Polar redirects back, the webhook may still be in flight — poll the checkout page. */
export function CheckoutPaidPending({ courseSlug, courseTitle }: { courseSlug: string; courseTitle: string }) {
  const router = useRouter();

  useEffect(() => {
    const started = Date.now();
    const timer = window.setInterval(() => {
      if (Date.now() - started > 45_000) {
        window.clearInterval(timer);
        return;
      }
      router.refresh();
    }, 2000);
    return () => window.clearInterval(timer);
  }, [router]);

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-lg flex-col justify-center px-4 py-16 sm:px-6">
      <div className="rounded-2xl border bg-card p-6 sm:p-8">
        <p className="text-sm text-muted-foreground">Payment received</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Confirming access</h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          Thanks — we are unlocking <span className="font-medium text-foreground">{courseTitle}</span>. This usually takes a few seconds.
        </p>
        <p className="mt-6 text-sm text-muted-foreground">
          If nothing happens, refresh this page or open{" "}
          <Link href={`/courses/${courseSlug}`} className="font-medium text-primary underline underline-offset-4">
            the course
          </Link>
          .
        </p>
      </div>
    </div>
  );
}
