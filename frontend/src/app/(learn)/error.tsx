"use client";

import { Button } from "@/components/ui/button";

export default function LearnError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <section className="mx-auto my-12 max-w-xl rounded-xl border bg-card p-6 text-card-foreground" role="alert">
      <h1 className="text-lg font-semibold">This page could not load</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        The server may be temporarily unavailable. Try loading the page again.
      </p>
      <Button className="mt-4" onClick={reset}>
        Try again
      </Button>
    </section>
  );
}
