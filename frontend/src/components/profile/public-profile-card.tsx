import type { AchievementView, PublicProfileView } from "@/shared/api/public-profile";
import Link from "next/link";
import { rewardForTier } from "@/shared/gamification/achievements";
import { levelProgress } from "@/shared/gamification/levels";
import {
  Award,
  BookOpen,
  Calendar,
  Clock,
  Flame,
  GraduationCap,
  Medal,
  Moon,
  Sunrise,
  Target,
  Timer,
  Trophy,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { AchievementShareButton } from "./achievement-share-button";
import { CAREER_REQUIREMENTS, CAREER_TIER_LABELS, CAREER_TIERS, careerTierIndex } from "@/shared/gamification/career";
import { LEAGUE_TIER_LABELS } from "@/shared/gamification/leagues";
import { CosmeticDot } from "@/components/learn/rewards/cosmetic-dot";
import { cn } from "@/lib/utils";
import { ShareProfileButton } from "./share-profile-button";
import { ShowMore } from "./show-more";
import { buttonVariants } from "@/components/ui/button";

type CardProfile = PublicProfileView & {
  profilePublic?: boolean;
  creditsBalance?: number | null;
  achievementRewards?: { count: number; credits: number };
};

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-2xl border bg-card p-4 sm:p-5">
      <p className="text-2xl font-semibold tracking-tight tabular-nums sm:text-3xl">{value}</p>
      <p className="mt-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
    </div>
  );
}

function Ring({ percent, center, label }: { percent: number; center: string; label: string }) {
  const clamped = Math.max(0, Math.min(100, percent));
  const r = 34;
  const circumference = 2 * Math.PI * r;
  const offset = circumference * (1 - clamped / 100);
  return (
    <div className="flex items-center gap-4 rounded-2xl border bg-card p-4 sm:p-5">
      <svg viewBox="0 0 80 80" className="size-16 shrink-0 -rotate-90" role="img" aria-label={`${label}: ${clamped}%`}>
        <circle cx="40" cy="40" r={r} fill="none" stroke="currentColor" strokeWidth="8" className="text-muted" />
        <circle
          cx="40"
          cy="40"
          r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="text-primary"
        />
      </svg>
      <div className="min-w-0">
        <p className="truncate text-2xl font-semibold tracking-tight tabular-nums">{center}</p>
        <p className="truncate text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}

function RecordTile({ icon: Icon, label, value, sub }: { icon?: LucideIcon; label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border bg-muted/30 p-3">
      <div className="flex items-center gap-1.5">
        {Icon ? <Icon className="size-3.5 text-primary" aria-hidden /> : null}
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      </div>
      <p className="mt-1 text-lg font-semibold tracking-tight tabular-nums">{value}</p>
      {sub ? <p className="text-xs text-muted-foreground">{sub}</p> : null}
    </div>
  );
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function shortDate(key: string): string {
  const [, m, d] = key.split("-");
  const month = MONTHS[Number(m) - 1] ?? m;
  return `${month} ${Number(d)}`;
}

const ACH_ICONS: Record<string, LucideIcon> = { book: BookOpen, cap: GraduationCap, flame: Flame, zap: Zap, target: Target, trophy: Trophy, moon: Moon, sun: Sunrise, calendar: Calendar };

function AchievementCard({ a }: { a: AchievementView }) {
  const maxed = a.tier >= 0 && a.nextTarget === null;
  const locked = a.tier < 0;
  const Icon = ACH_ICONS[a.icon] ?? Trophy;
  const tierLabel = a.tier >= 0 ? a.tiers[a.tier]?.label : "Locked";
  const earnedCredits = Array.from({ length: a.tier + 1 }, (_, i) => rewardForTier(i)).reduce((sum, n) => sum + n, 0);
  const nextReward = a.tier + 1 < a.tiers.length ? rewardForTier(a.tier + 1) : a.nextReward ?? null;
  return (
    <div className={cn("rounded-xl border p-3", maxed ? "bg-primary/5 ring-2 ring-primary/60" : "bg-muted/30", locked && "opacity-70")}>
      <div className="flex items-center gap-2">
        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
          <Icon className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{a.title}</p>
          <p className="truncate text-xs text-muted-foreground">{tierLabel}</p>
        </div>
        {!locked ? <AchievementShareButton title={a.title} /> : null}
      </div>
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-primary" style={{ width: `${Math.round((maxed ? 1 : a.progress) * 100)}%` }} />
      </div>
      <p className="mt-1 text-[11px] text-muted-foreground">
        {maxed ? `Maxed · earned ${earnedCredits}` : `${a.value} / ${a.nextTarget} · +${nextReward ?? 0} credits`}
      </p>
    </div>
  );
}

export function PublicProfileCard({
  profile,
  variant = "public",
}: {
  profile: CardProfile;
  variant?: "public" | "owner";
}) {
  const headline =
    [profile.headline, profile.learningInPublic ? "Learning in public" : null].filter(Boolean).join(" · ") || null;
  const currentIndex = careerTierIndex(profile.careerTier);
  const xp = profile.xpTotal === null ? "Hidden" : profile.xpTotal.toLocaleString();
  const league = profile.leagueTier ? LEAGUE_TIER_LABELS[profile.leagueTier] : "Hidden";
  const isOwner = variant === "owner";
  const xpInfo = profile.xpTotal === null ? null : levelProgress(profile.xpTotal);
  const nextTier = CAREER_TIERS[currentIndex + 1] ?? null;
  const coursesTarget = nextTier ? CAREER_REQUIREMENTS[nextTier].courses : Math.max(1, profile.coursesCompleted);
  const coursesPercent = nextTier ? Math.min(100, Math.round((profile.coursesCompleted / Math.max(1, coursesTarget)) * 100)) : 100;

  const Section = ({ children }: { children: React.ReactNode }) =>
    isOwner ? <section className="rounded-2xl border bg-card p-5 sm:p-6">{children}</section> : <>{children}</>;

  const careerInner = (
    <>
      <h2 className="mb-4 text-base font-semibold tracking-tight">EdoraX Career Path</h2>
      <ol className="flex items-center gap-0 overflow-x-auto pb-2">
        {CAREER_TIERS.map((tier, index) => {
          const reached = index <= currentIndex;
          const current = index === currentIndex;
          return (
            <li key={tier} className="flex min-w-0 flex-1 items-center last:flex-none">
              <div className="flex flex-col items-center">
                <span
                  className={cn(
                    "grid size-6 place-items-center rounded-full border-2",
                    current ? "border-primary bg-primary" : reached ? "border-primary bg-primary/80" : "border-muted-foreground/30 bg-muted"
                  )}
                  aria-current={current ? "step" : undefined}
                />
                <span className={cn("mt-2 whitespace-nowrap text-xs", current ? "font-semibold text-foreground" : reached ? "text-foreground/80" : "text-muted-foreground")}>
                  {CAREER_TIER_LABELS[tier]}
                </span>
              </div>
              {index < CAREER_TIERS.length - 1 ? (
                <span className={cn("mx-2 h-0.5 flex-1", index < currentIndex ? "bg-primary" : "bg-muted")} />
              ) : null}
            </li>
          );
        })}
      </ol>
    </>
  );

  return (
    <main className={cn("w-full", isOwner ? "" : "mx-auto max-w-[1200px] px-6 py-10")}>
      <div className={isOwner ? "px-4 py-6 sm:px-6 lg:px-8" : "rounded-3xl border bg-card p-4 shadow-sm sm:p-6"}>
        {/* Hero */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-900 via-slate-900 to-slate-800 px-6 py-8 text-white sm:px-8">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_85%_-10%,rgba(255,255,255,0.14),transparent_55%)]" />
          <div className="relative flex items-start justify-between gap-4">
            <div className="flex items-center gap-4 sm:gap-5">
              <div className="grid size-24 shrink-0 place-items-center rounded-full bg-white/10 ring-2 ring-white/20 sm:size-28">
                <CosmeticDot visual={profile.cosmetic} size={112} />
              </div>
              <div className="min-w-0">
                <h1 className="truncate text-2xl font-bold tracking-tight sm:text-3xl">{profile.name}</h1>
                {headline ? <p className="mt-1 text-sm text-white/70 sm:text-base">{headline}</p> : null}
                <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-white/10 px-2.5 py-1 text-xs font-medium text-white/85">
                  <Award className="size-3.5" /> {CAREER_TIER_LABELS[profile.careerTier]}
                </span>
              </div>
            </div>
            <ShareProfileButton shareUrl={`/u/${profile.slug}`} className="hidden shrink-0 sm:inline-flex" />
          </div>
          <div className="relative mt-6 sm:hidden">
            <ShareProfileButton shareUrl={`/u/${profile.slug}`} className="w-full" />
          </div>
        </div>

        <div className="mt-5 space-y-5">
          <Section>{careerInner}</Section>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
            {xpInfo ? <Ring percent={xpInfo.percent} center={xp} label="Lifetime XP" /> : <Stat value="Hidden" label="Lifetime XP" />}
            <Ring percent={coursesPercent} center={String(profile.coursesCompleted)} label="Courses" />
            <Stat value={league} label="Weekly league" />
          </div>

          {isOwner && profile.currentCourse ? (
            <Section>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Currently learning</p>
                  <p className="mt-1 truncate text-base font-semibold">{profile.currentCourse.title}</p>
                </div>
                <Link href={`/courses/${profile.currentCourse.slug}`} className={buttonVariants({ size: "sm" })}>
                  Continue
                </Link>
              </div>
              <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary"
                  style={{ width: `${Math.max(0, Math.min(100, profile.currentCourse.percentComplete))}%` }}
                />
              </div>
            </Section>
          ) : null}

          {isOwner && profile.achievementRewards && profile.achievementRewards.count > 0 ? (
            <div className="rounded-xl border border-primary/40 bg-primary/10 p-3 text-sm">
              You earned <span className="font-semibold tabular-nums">{profile.achievementRewards.credits}</span> Build Credits from{" "}
              {profile.achievementRewards.count} new achievement{profile.achievementRewards.count === 1 ? "" : "s"}.
            </div>
          ) : null}

          {profile.records ? (
            <Section>
              <h2 className="mb-3 text-base font-semibold tracking-tight">Records</h2>
              <ShowMore
                items={[
                  <RecordTile key="streak" icon={Flame} label="Longest streak" value={`${profile.records.longestStreakDays} ${profile.records.longestStreakDays === 1 ? "day" : "days"}`} />,
                  <RecordTile key="bestWeek" icon={Calendar} label="Best week" value={profile.records.bestWeeklyXp ? `${profile.records.bestWeeklyXp.value.toLocaleString()} XP` : "Not yet"} sub={profile.records.bestWeeklyXp ? `week of ${shortDate(profile.records.bestWeeklyXp.weekKey)}` : undefined} />,
                  <RecordTile key="bestDay" icon={Zap} label="Best day" value={profile.records.mostXpInADay ? `${profile.records.mostXpInADay.value.toLocaleString()} XP` : "Not yet"} sub={profile.records.mostXpInADay ? shortDate(profile.records.mostXpInADay.dayKey) : undefined} />,
                  <RecordTile key="leagueFinish" icon={Trophy} label="Best league finish" value={profile.records.bestLeagueFinish ? `#${profile.records.bestLeagueFinish.rank} · ${LEAGUE_TIER_LABELS[profile.records.bestLeagueFinish.tier]}` : "Not yet"} />,
                  <RecordTile key="highestLeague" icon={Medal} label="Highest league" value={profile.records.highestLeagueTier ? LEAGUE_TIER_LABELS[profile.records.highestLeagueTier] : "Not yet"} />,
                  <RecordTile key="chaptersWeek" icon={BookOpen} label="Best chapters / week" value={profile.records.bestWeekChapters ? `${profile.records.bestWeekChapters.value}` : "Not yet"} sub={profile.records.bestWeekChapters ? `week of ${shortDate(profile.records.bestWeekChapters.weekKey)}` : undefined} />,
                  <RecordTile key="studyDay" icon={Clock} label="Most study / day" value={profile.records.mostStudyMinutesInADay ? `${profile.records.mostStudyMinutesInADay.value} min` : "Not yet"} sub={profile.records.mostStudyMinutesInADay ? shortDate(profile.records.mostStudyMinutesInADay.dayKey) : undefined} />,
                  <RecordTile key="session" icon={Timer} label="Longest session" value={profile.records.longestSessionMinutes > 0 ? `${profile.records.longestSessionMinutes} min` : "Not yet"} />,
                  <RecordTile key="perfect" icon={Target} label="Perfect quizzes" value={`${profile.records.perfectQuizzes}`} />,
                ]}
                initial={8}
                label="records"
                gridClassName="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4"
              />
            </Section>
          ) : null}

          {profile.achievements && profile.achievements.length > 0 ? (
            <Section>
              <h2 className="mb-3 text-base font-semibold tracking-tight">Achievements</h2>
              <ShowMore
                items={profile.achievements.map((a) => (
                  <AchievementCard key={a.id} a={a} />
                ))}
                initial={8}
                label="achievements"
                gridClassName="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4"
              />
            </Section>
          ) : null}
        </div>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          Verified learning on Buildment. Career tier reflects completed courses and quiz mastery, not time spent.
        </p>
      </div>
    </main>
  );
}
