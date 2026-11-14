"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/app-toast";
import { AdminPanel } from "@/components/admin/admin-ui";
import { cn } from "@/lib/utils";
import {
  DESKTOP_PLATFORMS,
  MESSAGE_MAX_LENGTH,
  buildUpdateRequest,
  compareVersions,
  describeForcePlan,
  formatUpdatedAt,
  isValidVersion,
  planForceToLatest,
  platformLabel,
} from "@/lib/desktop-updates";
import type { DesktopPlatform, DesktopUpdatePolicy, DesktopUpdateRequest } from "@/shared/api/desktop-updates";

type ActionResult = { ok: boolean; message: string };
type Actions = {
  saveRules: (input: DesktopUpdateRequest) => Promise<ActionResult>;
  forceToLatest: (input: { confirmed: Partial<Record<DesktopPlatform, string>> }) => Promise<ActionResult>;
};

const fieldClass =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-60";
const labelClass = "flex flex-col gap-1 text-xs font-medium text-muted-foreground";

/** Runs a server action, shows the answer, and reloads the page data when it worked. */
function useRunner() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  const run = (work: () => Promise<ActionResult>, after?: () => void) =>
    startTransition(async () => {
      let next: ActionResult;
      try {
        next = await work();
      } catch {
        next = { ok: false, message: "Something went wrong. Please try again." };
      }
      setResult(next);
      toast(next.message, next.ok ? "success" : "error");
      if (next.ok) {
        after?.();
        router.refresh();
      }
    });
  return { pending, result, setResult, run };
}

function Result({ result }: { result: ActionResult | null }) {
  if (!result) return null;
  return (
    <p
      role={result.ok ? "status" : "alert"}
      className={cn("text-xs leading-relaxed", result.ok ? "text-emerald-600 dark:text-emerald-400" : "text-destructive")}
    >
      {result.message}
    </p>
  );
}

/** A button that asks once more before it does something that locks users out. */
function ConfirmButton({
  label,
  question,
  disabled,
  onConfirm,
}: {
  label: string;
  question: string;
  disabled?: boolean;
  onConfirm: () => void;
}) {
  const [asking, setAsking] = useState(false);
  if (!asking) {
    return (
      <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={() => setAsking(true)}>
        {label}
      </Button>
    );
  }
  return (
    <span className="flex flex-wrap items-center gap-2" role="group" aria-label={label}>
      <span className="text-xs text-foreground">{question}</span>
      <Button
        type="button"
        variant="destructive"
        size="sm"
        onClick={() => {
          setAsking(false);
          onConfirm();
        }}
      >
        Yes, do it
      </Button>
      <Button type="button" variant="ghost" size="sm" onClick={() => setAsking(false)}>
        Cancel
      </Button>
    </span>
  );
}

export function DesktopUpdatesPanel({ policies, saveRules, forceToLatest }: { policies: DesktopUpdatePolicy[] } & Actions) {
  const all = useRunner();
  const plan = planForceToLatest(DESKTOP_PLATFORMS, policies);

  return (
    <div className="space-y-4">
      <AdminPanel className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold tracking-tight text-foreground">Make everyone update</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {plan.groups.length > 0
              ? `Sets the minimum version to the latest: ${describeForcePlan(plan.groups)}.`
              : "Every platform already requires its latest version."}
          </p>
        </div>
        <ConfirmButton
          label="Force all platforms to the latest"
          question="Old apps stop working until they update. Sure?"
          disabled={all.pending || plan.groups.length === 0}
          onConfirm={() => {
            const confirmed: Partial<Record<DesktopPlatform, string>> = {};
            for (const group of plan.groups) for (const platform of group.platforms) confirmed[platform] = group.version;
            all.run(() => forceToLatest({ confirmed }));
          }}
        />
        <div className="w-full">
          <Result result={all.result} />
        </div>
      </AdminPanel>

      <div className="grid gap-4 lg:grid-cols-3">
        {DESKTOP_PLATFORMS.map((platform) => {
          const policy = policies.find((item) => item.platform === platform);
          return policy ? (
            <PlatformCard
              key={`${platform}:${policy.updatedAt ?? "default"}`}
              policy={policy}
              saveRules={saveRules}
              forceToLatest={forceToLatest}
            />
          ) : null;
        })}
      </div>
    </div>
  );
}

function PlatformCard({ policy, saveRules, forceToLatest }: { policy: DesktopUpdatePolicy } & Actions) {
  const { pending, result, setResult, run } = useRunner();
  const [minimum, setMinimum] = useState(policy.minimumVersion);
  const [latest, setLatest] = useState(policy.latestVersion);
  const [link, setLink] = useState(policy.downloadUrl);
  const [message, setMessage] = useState(policy.message);
  const [blocked, setBlocked] = useState(policy.blockedVersions.join(", "));

  const canForce = isValidVersion(policy.latestVersion) && compareVersions(policy.latestVersion, policy.minimumVersion) > 0;

  function save() {
    const built = buildUpdateRequest({
      platforms: [policy.platform],
      current: policy,
      values: {
        minimumVersion: minimum,
        latestVersion: latest,
        downloadUrl: link,
        message,
        blockedVersions: blocked.split(/[\s,]+/).filter(Boolean),
      },
      clear: { message: !message.trim() && !!policy.message },
    });
    if (!built.ok) {
      setResult({ ok: false, message: built.errors.join(" ") });
      return;
    }
    run(() => saveRules(built.request));
  }

  return (
    <AdminPanel className="space-y-4">
      <div>
        <h2 className="text-base font-semibold tracking-tight text-foreground">{platformLabel(policy.platform)}</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          {policy.isDefault || !policy.updatedAt ? (
            "Not set yet: using the server defaults."
          ) : (
            <>
              Changed by {policy.updatedBy ? policy.updatedBy.name || policy.updatedBy.email : "unknown"} on{" "}
              <time dateTime={policy.updatedAt}>{formatUpdatedAt(policy.updatedAt)}</time>
            </>
          )}
        </p>
      </div>

      <form
        noValidate
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          save();
        }}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <label className={labelClass}>
            Latest version
            <input
              className={fieldClass}
              value={latest}
              onChange={(event) => setLatest(event.target.value)}
              placeholder="0.3.0"
              autoComplete="off"
              spellCheck={false}
              disabled={pending}
            />
            <span className="text-[11px] font-normal">Older apps see a small note.</span>
          </label>
          <label className={labelClass}>
            Must update below
            <input
              className={fieldClass}
              value={minimum}
              onChange={(event) => setMinimum(event.target.value)}
              placeholder="0.2.0"
              autoComplete="off"
              spellCheck={false}
              disabled={pending}
            />
            <span className="text-[11px] font-normal">Older apps are stopped.</span>
          </label>
        </div>

        <details className="group rounded-md border border-border px-3 py-2">
          <summary className="cursor-pointer text-xs font-medium text-muted-foreground">More options</summary>
          <div className="mt-3 space-y-3">
            <label className={labelClass}>
              Download link
              <input
                type="url"
                className={fieldClass}
                value={link}
                onChange={(event) => setLink(event.target.value)}
                placeholder="https://"
                autoComplete="off"
                spellCheck={false}
                disabled={pending}
              />
            </label>
            <label className={labelClass}>
              Message for users (optional)
              <textarea
                className={cn(fieldClass, "h-20 resize-y")}
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                maxLength={MESSAGE_MAX_LENGTH}
                disabled={pending}
              />
            </label>
            <label className={labelClass}>
              Block exact versions (optional)
              <input
                className={fieldClass}
                value={blocked}
                onChange={(event) => setBlocked(event.target.value)}
                placeholder="0.1.4, 0.1.5"
                autoComplete="off"
                spellCheck={false}
                disabled={pending}
              />
              <span className="text-[11px] font-normal">Separate versions with commas. Empty means none.</span>
            </label>
          </div>
        </details>

        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" size="sm" disabled={pending}>
            {pending ? "Saving..." : "Save"}
          </Button>
          <ConfirmButton
            label="Force to latest"
            question={`Stop apps below ${policy.latestVersion}?`}
            disabled={pending || !canForce}
            onConfirm={() => run(() => forceToLatest({ confirmed: { [policy.platform]: policy.latestVersion } }))}
          />
        </div>
        <Result result={result} />
      </form>
    </AdminPanel>
  );
}
