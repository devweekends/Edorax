import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { GuidedTrackView } from "@/lib/guided-labs";
import { StatusBadge } from "./area-page";

// The Dev Weekends tracks on /labs/guided. One row per track: who it is for and what you build on
// the left, the facts and the way in on the right. Rows, not a card grid, because each one has
// a paragraph to read.

function Fact({ label, children }: { label: string; children: string }) {
  return (
    <div>
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="text-base font-bold">{children}</dd>
    </div>
  );
}

export function GuidedTrackList({ tracks }: { tracks: GuidedTrackView[] }) {
  return (
    <ul className="space-y-4" data-testid="guided-tracks">
      {tracks.map(({ track, open, title, length, price, href }) => (
        <li key={track.slug} className="grid gap-5 border border-border bg-card p-5 md:grid-cols-[1.6fr_1fr] md:gap-8" data-testid={`guided-track-${track.slug}`}>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-sm font-bold uppercase tracking-wider text-primary">{track.level}</span>
              <StatusBadge status={open ? "live" : "coming-soon"} />
            </div>
            <h3 className="mt-2 text-xl tracking-[-0.02em]">{title}</h3>
            <p className="mt-1 text-base font-bold">{track.audience}</p>
            <p className="mt-2 text-base text-muted-foreground">
              <span className="font-bold text-foreground">You build: </span>
              {track.build}
            </p>
          </div>
          <div className="flex flex-col justify-between gap-5 border-t border-border pt-5 md:border-l md:border-t-0 md:pl-8 md:pt-0">
            <dl className="grid grid-cols-2 gap-4 md:grid-cols-1">
              {length ? <Fact label="Length">{length}</Fact> : null}
              {price ? <Fact label="Price">{price}</Fact> : null}
              {!open ? <Fact label="Status">Not published yet</Fact> : null}
            </dl>
            {open && href ? (
              <Link
                href={href}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border-2 border-primary px-5 text-base font-bold text-primary outline-none transition-colors hover:bg-secondary focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-brand-yellow"
                aria-label={`Open ${title}`}
              >
                Open
                <ArrowRight className="size-4" aria-hidden />
              </Link>
            ) : (
              <p className="text-base text-muted-foreground">It opens here as soon as the course is published.</p>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
