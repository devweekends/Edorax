"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Check, Copy, KeyRound, ShieldAlert, X } from "lucide-react";
import { Button } from "@/components/ui/button";

export function CredentialReveal({ accessKey, secret }: { accessKey: string; secret: string }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const [copied, setCopied] = useState<"access" | "secret" | null>(null);
  const [copyError, setCopyError] = useState(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
    // Keep the one-time values in the dialog while removing them from the visible URL.
    const url = new URL(window.location.href);
    url.searchParams.delete("accessKey");
    url.searchParams.delete("secret");
    window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
  }, []);

  const copy = useCallback(async (which: "access" | "secret", value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopyError(false);
      setCopied(which);
      window.setTimeout(() => setCopied((current) => current === which ? null : current), 2000);
    } catch {
      setCopyError(true);
    }
  }, []);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      className="fixed inset-0 z-[70] m-auto max-h-[calc(100dvh-2rem)] w-[min(36rem,calc(100vw-2rem))] max-w-none overflow-y-auto rounded-2xl border border-border bg-card p-0 text-card-foreground shadow-2xl backdrop:bg-black/60 backdrop:backdrop-blur-sm"
    >
      <div className="flex items-start justify-between gap-4 border-b border-border px-6 py-5">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
            <KeyRound className="size-5" aria-hidden />
          </span>
          <div>
            <h2 id={titleId} className="text-lg font-semibold tracking-tight">Your API credentials</h2>
            <p id={descriptionId} className="mt-1 text-sm text-muted-foreground">Use these keys to connect your organization.</p>
          </div>
        </div>
        <button type="button" onClick={() => dialogRef.current?.close()} aria-label="Close credentials dialog" className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
          <X className="size-4" aria-hidden />
        </button>
      </div>

      <div className="space-y-5 px-6 py-5">
        <div className="flex gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-950 dark:text-amber-100">
          <ShieldAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          <p><span className="font-semibold">Save your secret key now.</span> It won’t be shown again after you close this window.</p>
        </div>
        <dl className="space-y-3">
          {([{ label: "Access key", value: accessKey, key: "access" }, { label: "Secret key", value: secret, key: "secret" }] as const).map((item) => (
            <div key={item.key} className="rounded-xl border border-border bg-muted/40 p-4">
              <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{item.label}</dt>
              <div className="mt-2 flex items-center gap-3">
                <dd className="min-w-0 flex-1 break-all font-mono text-sm">{item.value}</dd>
                <Button type="button" size="sm" variant="outline" onClick={() => copy(item.key, item.value)} aria-label={`Copy ${item.label.toLowerCase()}`}>
                  {copied === item.key ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}
                  {copied === item.key ? "Copied" : "Copy"}
                </Button>
              </div>
            </div>
          ))}
        </dl>
        <p aria-live="polite" className="text-xs text-muted-foreground">
          {copyError ? "Couldn’t copy. Select and copy the key manually." : ""}
        </p>
        <p className="text-xs leading-6 text-muted-foreground">
          Send these as <code className="rounded bg-muted px-1.5 py-1">x-buildment-access-key</code> and{" "}
          <code className="rounded bg-muted px-1.5 py-1">x-buildment-secret-key</code> headers on integration requests.
        </p>
      </div>
      <div className="flex justify-end border-t border-border px-6 py-4">
        <Button type="button" onClick={() => dialogRef.current?.close()}>Done</Button>
      </div>
    </dialog>
  );
}
