import { cn } from "@/lib/utils";

// GitHub-style contribution grid: 53 week columns × 7 day rows, coloured by daily study time.

type Day = { day: string; seconds: number };

const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const LEVEL_CLASS = ["bg-muted", "bg-primary/30", "bg-primary/50", "bg-primary/75", "bg-primary"];
const DAY_MS = 86_400_000;

function level(seconds: number): number {
  if (seconds <= 0) return 0;
  const minutes = seconds / 60;
  if (minutes <= 15) return 1;
  if (minutes <= 30) return 2;
  if (minutes <= 60) return 3;
  return 4;
}

export function ActivityGrid({ days }: { days: Day[] }) {
  if (days.length === 0) return null;

  const byDay = new Map(days.map((d) => [d.day, d.seconds]));
  const first = days[0]!.day;
  const last = days[days.length - 1]!.day;
  const start = new Date(`${first}T00:00:00Z`);
  const end = new Date(`${last}T00:00:00Z`);
  const gridStart = new Date(start);
  gridStart.setUTCDate(gridStart.getUTCDate() - start.getUTCDay());
  const totalDays = Math.round((end.getTime() - gridStart.getTime()) / DAY_MS) + 1;
  const weeks = Math.ceil(totalDays / 7);

  const cells: Array<{ day: string; seconds: number; inRange: boolean }> = [];
  for (let i = 0; i < weeks * 7; i++) {
    const d = new Date(gridStart);
    d.setUTCDate(gridStart.getUTCDate() + i);
    const key = d.toISOString().slice(0, 10);
    cells.push({ day: key, seconds: byDay.get(key) ?? 0, inRange: key >= first && key <= last });
  }

  const activeDays = days.filter((d) => d.seconds > 0).length;

  const monthForWeek: Array<string | null> = [];
  let lastMonth = -1;
  for (let w = 0; w < weeks; w++) {
    let label: string | null = null;
    for (let r = 0; r < 7; r++) {
      const cell = cells[w * 7 + r]!;
      if (cell.inRange) {
        const m = Number(cell.day.slice(5, 7)) - 1;
        if (m !== lastMonth) {
          label = MONTH_LABELS[m] ?? null;
          lastMonth = m;
        }
        break;
      }
    }
    monthForWeek.push(label);
  }

  return (
    <article className="rounded-2xl border bg-card p-5 sm:p-7" aria-labelledby="activity-grid-heading">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h3 id="activity-grid-heading" className="text-lg font-semibold tracking-tight">Activity</h3>
          <p className="mt-1 text-sm text-muted-foreground">Your study time each day over the last year.</p>
        </div>
        <p className="text-2xl font-semibold tabular-nums">
          {activeDays}
          <span className="ml-1 text-sm font-normal text-muted-foreground">active days</span>
        </p>
      </div>

      <div className="mt-5 overflow-x-auto pb-1">
        <div className="mx-auto w-max">
          <div className="flex flex-col gap-[3px]">
            <div className="flex gap-[3px] pl-12">
              {monthForWeek.map((m, w) => (
                <span key={w} className="w-[13px] text-[10px] leading-none text-muted-foreground">
                  {m ?? ""}
                </span>
              ))}
            </div>
            <div className="flex gap-[3px]">
              <div className="mr-1 flex flex-col gap-[3px] text-[10px] leading-[13px] text-muted-foreground">
                {["", "Mon", "", "Wed", "", "Fri", ""].map((d, i) => (
                  <span key={i} className="h-[13px] w-10">{d}</span>
                ))}
              </div>
              {Array.from({ length: weeks }).map((_, w) => (
                <div key={w} className="flex flex-col gap-[3px]">
                  {Array.from({ length: 7 }).map((_, r) => {
                    const cell = cells[w * 7 + r]!;
                    const lvl = level(cell.seconds);
                    return (
                      <span
                        key={r}
                        title={cell.inRange ? `${cell.day}: ${Math.round(cell.seconds / 60)} min` : undefined}
                        className={cn(
                          "size-[13px] rounded-[2px]",
                          cell.inRange ? LEVEL_CLASS[lvl] : "bg-transparent",
                          cell.inRange && lvl === 0 && "ring-1 ring-inset ring-border"
                        )}
                      />
                    );
                  })}
                </div>
              ))}
            </div>
            <div className="mt-2 flex items-center justify-end gap-1 pl-12 text-[10px] text-muted-foreground">
              <span className="mr-1">Less</span>
              {LEVEL_CLASS.map((cls, i) => (
                <span key={i} className={cn("size-[13px] rounded-[2px]", cls, i === 0 && "ring-1 ring-inset ring-border")} />
              ))}
              <span className="ml-1">More</span>
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}
