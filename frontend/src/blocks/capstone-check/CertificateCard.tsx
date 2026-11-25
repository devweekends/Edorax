"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Award } from "lucide-react";
import { ApiError, apiFetch } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { CertificateView, MyCertificateState } from "@/shared/lib/certificates";
import { RewardCelebrationDialog, type RewardCelebration } from "@/components/rewards/reward-celebration-dialog";

// Shown under an approved capstone. The learner confirms their name once, then gets the
// verify link, Add to LinkedIn and the share image.

export function CertificateCard({ courseSlug }: { courseSlug: string }) {
  const [state, setState] = useState<MyCertificateState | null>(null);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [claiming, setClaiming] = useState(false);
  const [celebration, setCelebration] = useState<RewardCelebration | null>(null);

  useEffect(() => {
    let live = true;
    apiFetch<MyCertificateState>(`/api/v1/courses/${encodeURIComponent(courseSlug)}/certificate`)
      .then((result) => {
        if (!live) return;
        setState(result);
        setName(result.suggestedName ?? "");
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [courseSlug]);

  if (!state || !state.eligibility.offered) return null;

  async function claim(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setClaiming(true);
    try {
      const result = await apiFetch<{ certificate: CertificateView }>(`/api/v1/courses/${encodeURIComponent(courseSlug)}/certificate`, {
        method: "POST",
        json: { recipientName: name },
      });
      setState((current) => (current ? { ...current, certificate: result.certificate } : current));
      setCelebration({
        size: "large",
        icon: Award,
        kicker: "Certificate issued",
        title: result.certificate.title,
        description: `Issued to ${result.certificate.recipientName}. Anyone can check it with code ${result.certificate.code}.`,
        action: { label: "View certificate", href: `/verify/${result.certificate.code}` },
      });
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Could not issue the certificate. Try again.");
    } finally {
      setClaiming(false);
    }
  }

  const certificate = state.certificate;
  return (
    <section className="space-y-3 border p-4">
      <p className="flex items-center gap-2 text-sm font-semibold">
        <Award className="size-4" />
        Track certificate
      </p>
      {certificate ? (
        <>
          <p className="text-sm leading-6">
            {certificate.title}, issued to {certificate.recipientName}. Certificate {certificate.code}.
          </p>
          <div className="flex flex-wrap gap-2">
            <a href={certificate.linkedInAddUrl} target="_blank" rel="noreferrer noopener" className={cn(buttonVariants({ size: "sm" }))}>
              Add to LinkedIn
            </a>
            <Link href={`/verify/${certificate.code}`} className={cn(buttonVariants({ size: "sm", variant: "outline" }))}>
              View certificate
            </Link>
          </div>
        </>
      ) : state.eligibility.eligible ? (
        <form onSubmit={claim} className="space-y-2">
          <label className="block space-y-1.5">
            <span className="text-sm font-medium">Your name, exactly as it should appear</span>
            <Input value={name} onChange={(event) => setName(event.target.value)} required minLength={2} maxLength={80} autoComplete="name" />
          </label>
          <p className="text-xs text-muted-foreground">You can only set this once.</p>
          <Button type="submit" size="sm" loading={claiming} disabled={claiming}>
            Get my certificate
          </Button>
          {error ? <p className="text-sm text-destructive" role="alert">{error}</p> : null}
        </form>
      ) : (
        <ul className="list-disc space-y-1 pl-5 text-sm leading-6 text-muted-foreground">
          {state.eligibility.missing.map((item) => <li key={item}>{item}</li>)}
        </ul>
      )}
      <RewardCelebrationDialog reward={celebration} onClose={() => setCelebration(null)} />
    </section>
  );
}
