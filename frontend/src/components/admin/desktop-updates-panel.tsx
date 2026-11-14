"use client";

import { useEffect, useId, useRef, useState, useTransition, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/app-toast";
import { AdminPanel } from "@/components/admin/admin-ui";
import { cn } from "@/lib/utils";
import {
  BLOCKED_VERSIONS_MAX,
  DESKTOP_PLATFORMS,
  MESSAGE_MAX_LENGTH,
  addBlockedVersion,
  buildUpdateRequest,
  describeForcePlan,
  joinPlatformLabels,
  planForceToLatest,
  platformLabel,
  removeBlockedVersion,
  type RulesFormValues,
} from "@/lib/desktop-updates";
import type { DesktopPlatform, DesktopUpdatePolicy, DesktopUpdateRequest } from "@/shared/api/desktop-updates";

type ActionResult = { ok: boolean; message: string };

const fieldClass =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-60";
const labelClass = "flex flex-col gap-1 text-xs font-medium text-muted-foreground";
const hintClass = "text-[11px] font-normal text-muted-foreground";

const EMPTY_VALUES: RulesFormValues = {
  minimumVersion: "",
  latestVersion: "",
  downloadUrl: "",
  message: "",
  blockedVersions: [],
};

function prefill(policy: DesktopUpdatePolicy | null): RulesFormValues {
  if (!policy) return EMPTY_VALUES;
  return {
    minimumVersion: policy.minimumVersion,
    latestVersion: policy.latestVersion,
    downloadUrl: policy.downloadUrl,
    message: policy.message,
    blockedVersions: [...policy.blockedVersions],
  };
}

export function DesktopUpdatesPanel({
  policies,
  saveRules,
  forceToLatest,
}: {
  policies: DesktopUpdatePolicy[];
  saveRules: (input: DesktopUpdateRequest) => Promise<ActionResult>;
  forceToLatest: (input: { confirmed: Partial<Record<DesktopPlatform, string>> }) => Promise<ActionResult>;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<DesktopPlatform[]>([]);
  const [result, setResult] = useState<ActionResult | null>(null);
  const [resets, setResets] = useState(0);
  const [pending, startTransition] = useTransition();

  const allSelected = selected.length === DESKTOP_PLATFORMS.length;
  const single = selected.length === 1 ? (policies.find((policy) => policy.platform === selected[0]) ?? null) : null;

  const toggle = (platform: DesktopPlatform, checked: boolean) =>
    setSelected(DESKTOP_PLATFORMS.filter((item) => (item === platform ? checked : selected.includes(item))));

  const report = (next: ActionResult) => {
    setResult(next);
    toast(next.message, next.ok ? "success" : "error");
    if (next.ok) {
      setResets((count) => count + 1);
      router.refresh();
    }
  };

  const run = (work: () => Promise<ActionResult>) =>
    startTransition(async () => {
      try {
        report(await work());
      } catch {
        report({ ok: false, message: "Something went wrong. Please try again." });
      }
    });

  return (
    <AdminPanel className="space-y-6">
      <div>
        <h2 className="text-base font-semibold tracking-tight text-foreground">Change the update rules</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Choose the platforms first. Then change only the fields you need.
        </p>
      </div>

      <fieldset className="space-y-2" disabled={pending}>
        <legend className="text-sm font-medium text-foreground">Apply to</legend>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          {DESKTOP_PLATFORMS.map((platform) => (
            <label key={platform} className="inline-flex min-h-9 items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="size-4 accent-primary"
                checked={selected.includes(platform)}
                onChange={(event) => toggle(platform, event.target.checked)}
              />
              {platformLabel(platform)}
            </label>
          ))}
          <button
            type="button"
            onClick={() => setSelected(allSelected ? [] : [...DESKTOP_PLATFORMS])}
            className="min-h-9 text-xs font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-ring"
          >
            {allSelected ? "Clear selection" : "Select all"}
          </button>
        </div>
        {selected.length === 0 ? (
          <p className="text-xs text-muted-foreground">Choose at least one platform.</p>
        ) : null}
      </fieldset>

      <RulesForm
        // Start fresh when the selection goes to or from one platform, or when a save updates it.
        key={`${single ? `${single.platform}:${single.updatedAt ?? "default"}` : selected.length > 0 ? "many" : "none"}:${resets}`}
        selected={selected}
        single={single}
        pending={pending}
        onSave={(request) => run(() => saveRules(request))}
        onError={(message) => {
          setResult({ ok: false, message });
        }}
      />

      <ForceSection
        selected={selected}
        policies={policies}
        pending={pending}
        onConfirm={(confirmed) => run(() => forceToLatest({ confirmed }))}
      />

      <div aria-live="polite" className="min-h-5">
        {result ? (
          <p
            role={result.ok ? "status" : "alert"}
            className={cn(
              "rounded-md border px-3 py-2 text-sm leading-relaxed",
              result.ok
                ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-700 dark:text-emerald-300"
                : "border-destructive/30 bg-destructive/5 text-destructive"
            )}
          >
            {result.message}
          </p>
        ) : null}
      </div>
    </AdminPanel>
  );
}

function RulesForm({
  selected,
  single,
  pending,
  onSave,
  onError,
}: {
  selected: DesktopPlatform[];
  single: DesktopUpdatePolicy | null;
  pending: boolean;
  onSave: (request: DesktopUpdateRequest) => void;
  onError: (message: string) => void;
}) {
  const [values, setValues] = useState<RulesFormValues>(() => prefill(single));
  const [clearMessage, setClearMessage] = useState(false);
  const [clearBlocked, setClearBlocked] = useState(false);
  const [blockedInput, setBlockedInput] = useState("");
  const [blockedError, setBlockedError] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  const blockedErrorId = useId();
  const errorsId = useId();

  const set = <K extends keyof RulesFormValues>(key: K, value: RulesFormValues[K]) => {
    setValues((current) => ({ ...current, [key]: value }));
    setErrors([]);
  };

  const addBlocked = () => {
    const outcome = addBlockedVersion(values.blockedVersions, blockedInput);
    if (!outcome.ok) {
      setBlockedError(outcome.error);
      return;
    }
    setBlockedError("");
    setBlockedInput("");
    setClearBlocked(false);
    set("blockedVersions", outcome.list);
  };

  const onBlockedKey = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      addBlocked();
    }
  };

  const disabled = pending || selected.length === 0;

  return (
    <form
      noValidate
      className="space-y-5"
      onSubmit={(event) => {
        event.preventDefault();
        const built = buildUpdateRequest({
          platforms: selected,
          values,
          clear: { message: clearMessage, blockedVersions: clearBlocked },
          current: single,
        });
        if (!built.ok) {
          setErrors(built.errors);
          onError(built.errors.join(" "));
          return;
        }
        setErrors([]);
        onSave(built.request);
      }}
    >
      <p className="text-xs text-muted-foreground">
        {single
          ? `The fields show the saved values for ${platformLabel(single.platform)}. Change what you need.`
          : selected.length > 1
            ? "Empty fields stay as they are. Whatever you fill in is saved for every platform you chose."
            : "Choose a platform to see its saved values."}
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className={labelClass}>
          Minimum version
          <input
            className={fieldClass}
            value={values.minimumVersion}
            onChange={(event) => set("minimumVersion", event.target.value)}
            placeholder="0.2.0"
            inputMode="decimal"
            autoComplete="off"
            spellCheck={false}
            disabled={disabled}
          />
          <span className={hintClass}>Apps older than this are stopped until they update.</span>
        </label>
        <label className={labelClass}>
          Latest version
          <input
            className={fieldClass}
            value={values.latestVersion}
            onChange={(event) => set("latestVersion", event.target.value)}
            placeholder="0.3.0"
            inputMode="decimal"
            autoComplete="off"
            spellCheck={false}
            disabled={disabled}
          />
          <span className={hintClass}>Apps older than this see a small new version available note.</span>
        </label>
      </div>

      <label className={labelClass}>
        Download link
        <input
          type="url"
          className={fieldClass}
          value={values.downloadUrl}
          onChange={(event) => set("downloadUrl", event.target.value)}
          placeholder="https://example.com/edorax"
          autoComplete="off"
          spellCheck={false}
          disabled={disabled}
        />
        <span className={hintClass}>Must start with https://. Users open it to get the new version.</span>
      </label>

      <div className="space-y-2">
        <label className={labelClass}>
          Message shown to users (optional)
          <textarea
            className={cn(fieldClass, "h-24 resize-y py-2")}
            value={values.message}
            onChange={(event) => {
              set("message", event.target.value);
              if (event.target.value) setClearMessage(false);
            }}
            maxLength={MESSAGE_MAX_LENGTH}
            disabled={disabled}
          />
          <span className={hintClass}>
            {values.message.length} of {MESSAGE_MAX_LENGTH} characters.
          </span>
        </label>
        <label className="inline-flex min-h-9 items-center gap-2 text-xs text-muted-foreground">
          <input
            type="checkbox"
            className="size-4 accent-primary"
            checked={clearMessage}
            disabled={disabled}
            onChange={(event) => {
              setClearMessage(event.target.checked);
              if (event.target.checked) set("message", "");
              else if (single) set("message", single.message);
            }}
          />
          Clear the saved message
        </label>
      </div>

      <div className="space-y-2">
        <label className={labelClass}>
          Force these exact versions to update
          <span className="flex gap-2">
            <input
              className={fieldClass}
              value={blockedInput}
              onChange={(event) => {
                setBlockedInput(event.target.value);
                setBlockedError("");
              }}
              onKeyDown={onBlockedKey}
              placeholder="0.1.4"
              inputMode="decimal"
              autoComplete="off"
              spellCheck={false}
              disabled={disabled}
              aria-describedby={blockedError ? blockedErrorId : undefined}
              aria-invalid={blockedError ? true : undefined}
            />
            <Button type="button" variant="outline" size="sm" onClick={addBlocked} disabled={disabled}>
              Add
            </Button>
          </span>
          <span className={hintClass}>
            Apps on one of these versions are stopped, even if they are above the minimum. Up to {BLOCKED_VERSIONS_MAX}.
            {selected.length > 1 ? " This list replaces the saved list on every platform you chose." : ""}
          </span>
        </label>
        {blockedError ? (
          <p id={blockedErrorId} role="alert" className="text-xs text-destructive">
            {blockedError}
          </p>
        ) : null}
        {values.blockedVersions.length > 0 ? (
          <ul className="flex flex-wrap gap-2" aria-label="Blocked versions">
            {values.blockedVersions.map((version) => (
              <li
                key={version}
                className="inline-flex items-center gap-1 rounded-md bg-muted py-0.5 pl-2 pr-0.5 font-mono text-xs"
              >
                {version}
                <button
                  type="button"
                  aria-label={`Remove ${version}`}
                  disabled={disabled}
                  onClick={() => set("blockedVersions", removeBlockedVersion(values.blockedVersions, version))}
                  className="inline-flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-background hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
                >
                  <X className="size-3.5" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        <label className="inline-flex min-h-9 items-center gap-2 text-xs text-muted-foreground">
          <input
            type="checkbox"
            className="size-4 accent-primary"
            checked={clearBlocked}
            disabled={disabled}
            onChange={(event) => {
              setClearBlocked(event.target.checked);
              if (event.target.checked) set("blockedVersions", []);
              else if (single) set("blockedVersions", [...single.blockedVersions]);
            }}
          />
          Remove all blocked versions
        </label>
      </div>

      {errors.length > 0 ? (
        <ul id={errorsId} role="alert" className="list-disc space-y-1 pl-5 text-xs text-destructive">
          {errors.map((error) => (
            <li key={error}>{error}</li>
          ))}
        </ul>
      ) : null}

      <Button type="submit" disabled={disabled} aria-describedby={errors.length ? errorsId : undefined}>
        {pending ? "Saving..." : "Save changes"}
      </Button>
    </form>
  );
}

function ForceSection({
  selected,
  policies,
  pending,
  onConfirm,
}: {
  selected: DesktopPlatform[];
  policies: DesktopUpdatePolicy[];
  pending: boolean;
  onConfirm: (confirmed: Partial<Record<DesktopPlatform, string>>) => void;
}) {
  const [open, setOpen] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const plan = planForceToLatest(selected, policies);
  const names = plan.groups.flatMap((group) => group.platforms);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <div className="space-y-3 rounded-xl border border-border bg-muted/30 p-4">
      <div>
        <h3 className="text-sm font-semibold text-foreground">Force everyone to the latest version</h3>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          Sets each chosen platform&apos;s minimum version to its own latest version. Each platform can have a different
          latest version, so each gets its own number.
        </p>
      </div>
      {plan.groups.length > 0 ? (
        <p className="text-xs text-foreground">Would set: {describeForcePlan(plan.groups)}.</p>
      ) : null}
      {plan.skipped.length > 0 ? (
        <p className="text-xs text-muted-foreground">
          Nothing to do for {plan.skipped.map((item) => `${platformLabel(item.platform)} (${item.reason})`).join(" ")}
        </p>
      ) : null}
      <Button
        type="button"
        variant="destructive"
        size="sm"
        disabled={pending || plan.groups.length === 0}
        onClick={() => setOpen(true)}
      >
        Force to the latest version
      </Button>

      <dialog
        ref={dialogRef}
        onClose={() => setOpen(false)}
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        className="fixed inset-0 z-[70] m-0 h-full max-h-none w-full max-w-none border-0 bg-transparent p-0 backdrop:bg-background/70 open:flex open:items-center open:justify-center open:p-4"
      >
        <div className="w-full max-w-md overflow-hidden rounded-2xl border border-border bg-card text-card-foreground shadow-xl">
          <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
            <h2 id={titleId} className="flex items-center gap-2 text-base font-semibold text-foreground">
              <AlertTriangle className="size-4 text-destructive" aria-hidden />
              Force {joinPlatformLabels(names)} to update?
            </h2>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label="Close"
            >
              <X className="size-4" aria-hidden />
            </button>
          </div>
          <div className="px-5 py-4">
            <p id={descriptionId} className="text-sm leading-relaxed text-muted-foreground">
              The minimum version will be set to: {describeForcePlan(plan.groups)}. Users on older versions will be
              locked out of the app until they install it.
            </p>
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button
                type="button"
                variant="destructive"
                disabled={pending}
                onClick={() => {
                  const confirmed: Partial<Record<DesktopPlatform, string>> = {};
                  for (const group of plan.groups) for (const platform of group.platforms) confirmed[platform] = group.version;
                  setOpen(false);
                  onConfirm(confirmed);
                }}
              >
                Yes, force the update
              </Button>
            </div>
          </div>
        </div>
      </dialog>
    </div>
  );
}
