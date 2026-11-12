import { StarRating } from "@/components/learn/star-rating";

export type CourseReviewsView = {
  average: number | null;
  count: number;
  distribution: Array<{ stars: number; count: number }>;
  items: Array<{
    id: string;
    rating: number;
    review: string;
    reviewer: string;
    createdAt: string;
  }>;
  total: number;
  page: number;
  pageSize: number;
};

function when(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

/** Public rating summary and written reviews on the catalog course page. */
export function CourseReviews({ reviews }: { reviews: CourseReviewsView }) {
  if (reviews.count === 0) return null;
  const average = reviews.average ?? 0;
  return (
    <section className="mt-6 overflow-hidden rounded-2xl border bg-card">
      <div className="border-b p-5 sm:p-7">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Learner reviews</p>
        <h2 className="mt-1 text-xl font-semibold tracking-tight">What learners say</h2>

        <div className="mt-4 flex flex-col gap-5 sm:flex-row sm:items-center">
          <div className="flex items-center gap-3">
            <span className="text-4xl font-semibold tabular-nums">{average.toFixed(1)}</span>
            <div>
              <StarRating value={average} size={18} />
              <p className="mt-1 text-xs text-muted-foreground">
                {reviews.count} rating{reviews.count === 1 ? "" : "s"}
              </p>
            </div>
          </div>
          <div className="flex-1 space-y-1">
            {reviews.distribution.map((row) => {
              const percent = reviews.count > 0 ? Math.round((row.count / reviews.count) * 100) : 0;
              return (
                <div key={row.stars} className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="w-8 tabular-nums">{row.stars}★</span>
                  <span className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                    <span className="block h-full rounded-full bg-amber-500" style={{ width: `${percent}%` }} />
                  </span>
                  <span className="w-10 text-right tabular-nums">{percent}%</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {reviews.items.length > 0 ? (
        <ul className="divide-y">
          {reviews.items.map((item) => (
            <li key={item.id} className="p-5 sm:p-6">
              <div className="flex flex-wrap items-center gap-2">
                <StarRating value={item.rating} size={14} />
                <span className="text-sm font-medium">{item.reviewer}</span>
                <span className="text-xs text-muted-foreground">· {when(item.createdAt)}</span>
              </div>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{item.review}</p>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
