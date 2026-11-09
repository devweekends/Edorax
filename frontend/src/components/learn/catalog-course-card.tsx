import { EnrollmentBadge } from "@buildment/learning-ui/components/learn/enrollment-badge";
import Link from "next/link";
import { CourseCover } from "@/components/learn/course-cover";
import { StarRating } from "@/components/learn/star-rating";
import { formatPriceCents } from "@/lib/format-price";

export type CatalogCourseCardProps = {
  slug: string;
  title: string;
  description: string | null;
  coverUrl: string | null;
  difficulty: string | null;
  estimatedHours: number | null;
  pricingType: string;
  priceCents: number | null;
  currency: string | null;
  instructorName?: string | null;
  enrolledLabel?: string | null;
  subcategory?: string | null;
  tags?: string[];
  ratingAverage?: number | null;
  ratingCount?: number;
};

/** The whole card is the link: a big target on a phone, and one tab stop per course. */
export function CatalogCourseCard({
  slug,
  title,
  description,
  coverUrl,
  difficulty,
  estimatedHours,
  pricingType,
  priceCents,
  currency,
  instructorName,
  enrolledLabel,
  subcategory,
  tags = [],
  ratingAverage = null,
  ratingCount = 0,
}: CatalogCourseCardProps) {
  const meta = [difficulty ? difficulty.toLowerCase() : null, estimatedHours ? `${estimatedHours} hours` : null]
    .filter(Boolean)
    .join(" · ");
  return (
    <Link
      href={`/catalog/${slug}`}
      className="group flex h-full flex-col overflow-hidden rounded-lg border border-border bg-card text-card-foreground outline-none transition-colors hover:border-primary focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-brand-yellow"
    >
      <CourseCover coverUrl={coverUrl} title={title} aspect="video" className="rounded-none" />
      <div className="flex flex-1 flex-col p-5">
        {meta ? <p className="text-sm capitalize text-muted-foreground">{meta}</p> : null}
        {subcategory ? <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-primary">{subcategory}</p> : null}
        <h2 className="mt-2 text-lg leading-snug tracking-[-0.02em]">{title}</h2>
        {ratingCount > 0 && ratingAverage != null ? (
          <div className="mt-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
            <StarRating value={ratingAverage} size={12} />
            <span className="font-medium text-foreground">{ratingAverage.toFixed(1)}</span>
            <span>({ratingCount})</span>
          </div>
        ) : null}
        {tags.length ? <p className="mt-2 line-clamp-1 text-xs text-muted-foreground">{tags.slice(0, 3).join(" · ")}</p> : null}
        {instructorName ? <p className="mt-1 text-sm text-muted-foreground">With {instructorName}</p> : null}
        {description ? (
          <p className="mt-2 line-clamp-3 flex-1 text-base leading-6 text-muted-foreground">{description}</p>
        ) : (
          <div className="flex-1" />
        )}
{enrolledLabel ? <div className="mt-4"><EnrollmentBadge label={enrolledLabel} /></div> : null}
        <span className="mt-4 inline-flex h-10 w-full items-center justify-center rounded-lg bg-primary px-4 text-center text-sm font-semibold text-primary-foreground transition-colors group-hover:bg-primary/90">
          {enrolledLabel === "Enrolled"
            ? "Continue learning"
            : enrolledLabel === "Payment due"
              ? "Request access"
              : pricingType === "PAID"
                ? `Enroll · ${formatPriceCents(priceCents ?? 0, currency ?? "USD")}`
                : "Enroll"}
        </span>
      </div>
    </Link>
  );
}
