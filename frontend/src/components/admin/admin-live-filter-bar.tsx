"use client";

import { useEffect, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { adminSelectClassName } from "./admin-ui";

// Live filter bar for the admin tables. Inputs are uncontrolled: each change is
// debounced, then the URL is replaced and the server component refetches (RSC
// navigation, no full reload, shareable URL). Avoids React state so typing never
// remounts or loses focus. An explicit Apply button covers keyboard/submit use.

export type AdminFilterFieldSpec =
  | { name: string; label: string; kind: "search"; placeholder?: string }
  | { name: string; label: string; kind: "select"; options: Array<{ value: string; label: string }> };

const DEBOUNCE_MS = 300;

export function AdminLiveFilterBar({
  action,
  fields,
  values,
  showClear,
}: {
  action: string;
  fields: AdminFilterFieldSpec[];
  values: Record<string, string | undefined>;
  showClear?: boolean;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  function navigate(form: HTMLFormElement) {
    const params = new URLSearchParams();
    for (const [key, value] of new FormData(form).entries()) {
      const text = String(value).trim();
      if (text) params.set(key, text);
    }
    const qs = params.toString();
    startTransition(() => router.replace(qs ? `${action}?${qs}` : action, { scroll: false }));
  }

  function schedule(form: HTMLFormElement) {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => navigate(form), DEBOUNCE_MS);
  }

  function clear() {
    if (timer.current) clearTimeout(timer.current);
    const form = formRef.current;
    if (!form) return;
    for (const element of Array.from(form.elements)) {
      if (element instanceof HTMLInputElement || element instanceof HTMLSelectElement) element.value = "";
    }
    navigate(form);
  }

  return (
    <form
      ref={formRef}
      method="get"
      action={action}
      onChange={(event) => schedule(event.currentTarget)}
      onSubmit={(event) => {
        event.preventDefault();
        if (timer.current) clearTimeout(timer.current);
        navigate(event.currentTarget);
      }}
      className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:flex lg:flex-wrap lg:items-end"
    >
      {fields.map((field) => (
        <label key={field.name} className="flex min-w-0 flex-col gap-1 text-xs font-medium text-muted-foreground lg:min-w-40">
          {field.label}
          {field.kind === "search" ? (
            <input
              type="search"
              name={field.name}
              defaultValue={values[field.name] ?? ""}
              placeholder={field.placeholder}
              className={adminSelectClassName}
            />
          ) : (
            <select name={field.name} defaultValue={values[field.name] ?? ""} className={adminSelectClassName}>
              {field.options.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          )}
        </label>
      ))}
      <div className="flex items-center gap-3 pb-0.5 sm:col-span-2 lg:col-auto">
        <Button type="submit" size="sm" variant="outline" loading={pending} loadingLabel="Filtering…">
          Apply filters
        </Button>
        {showClear ? (
          <Button type="button" size="sm" variant="ghost" onClick={clear}>
            Clear
          </Button>
        ) : null}
      </div>
      <span role="status" aria-live="polite" className="sr-only">
        {pending ? "Updating results" : ""}
      </span>
    </form>
  );
}
