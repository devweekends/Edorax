"use client";

import { useRouter } from "next/navigation";
import { useTransition, type FormEvent, type ReactNode } from "react";

/**
 * A search/filter form that updates the URL in place. The page's data refreshes
 * without a full browser reload, and empty fields are left out of the address.
 */
export function AdminQueryForm({
  basePath,
  hash,
  className,
  children,
}: {
  basePath: string;
  hash?: string;
  className?: string;
  children: ReactNode;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const params = new URLSearchParams();
    for (const [key, value] of data.entries()) {
      if (typeof value === "string" && value.trim()) params.set(key, value.trim());
    }
    const qs = params.toString();
    const target = `${basePath}${qs ? `?${qs}` : ""}${hash ? `#${hash}` : ""}`;
    startTransition(() => router.push(target, { scroll: false }));
  }

  return (
    <form onSubmit={onSubmit} className={className} aria-busy={pending} data-pending={pending || undefined}>
      {children}
    </form>
  );
}
