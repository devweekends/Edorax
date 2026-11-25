import type { AchievementClaim, AchievementView, PublicProfileView } from "@/shared/api/public-profile";
import type { CareerProgress } from "@/shared/api/gamification";
import Link from "next/link";
import { rewardForTier } from "@/shared/gamification/achievements";
import {
  Award,
  BookOpen,
  Building2,
  Calendar,
  Check,
  Clock,
  Compass,
  Flame,
  GraduationCap,
  Medal,
  Moon,
  ShieldCheck,
  Sparkles,
  Sprout,
  Star,
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
import { Dot, type DotMood } from "@/components/brand/dot";
import { cn } from "@/lib/utils";
import { careerNodeState, careerRequirementLine, featuredAchievements, monthYear, nextStepCopy, shortDate, type CareerNodeState } from "@/lib/profile-view";
import { ShareProfileButton } from "./share-profile-button";
import { RevealMore } from "./reveal-more";
import { AchievementClaimButton } from "./achievement-claim-button";
import { CareerPromotionCelebration } from "./career-promotion-celebration";
import { buttonVariants } from "@/components/ui/button";
import type { CareerTier } from "@/shared/api/gamification";

type CardProfile = PublicProfileView & {
  profilePublic?: boolean;
  creditsBalance?: number | null;
  achievementClaims?: AchievementClaim[];
  careerPromotion?: { tier: CareerTier } | null;
  career?: CareerProgress | null;
};

type Claims = Map<string, AchievementClaim>;

const TIER_ICONS: Record<CareerTier, LucideIcon> = {
  INTERN: Sprout,
  JUNIOR: Sparkles,
  MID: ShieldCheck,
  SENIOR: Building2,
  STAFF: Compass,
  PRINCIPAL: Star,
};

const ACH_ICONS: Record<string, LucideIcon> = { book: BookOpen, cap: GraduationCap, flame: Flame, zap: Zap, target: Target, trophy: Trophy, moon: Moon, sun: Sunrise, calendar: Calendar };

function SectionHeading({ id, title, description }: { id: string; title: string; description: string }) {
  return (
    <div className="min-w-0">
      <h2 id={id} className="text-lg font-semibold tracking-tight">
        {title}
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">{description}</p>
    </div>
  );
}

function HeroStat({ value, label }: { value: string; label: string }) {
  return (
    <div className="min-w-0 rounded-xl border-2 border-b-4 border-white/10 bg-white/[0.06] px-3.5 py-3">
      <p className="truncate text-2xl font-semibold tracking-tight tabular-nums">{value}</p>
      <p className="mt-0.5 truncate text-xs font-medium uppercase tracking-wide text-white/60">{label}</p>
    </div>
  );
}

function HeroTag({ children, highlight = false }: { children: React.ReactNode; highlight?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold",
        highlight ? "border-[var(--brand-yellow)]/45 bg-[var(--brand-yellow)]/15 text-[var(--brand-yellow)]" : "border-white/15 bg-white/10 text-white/90",
      )}
    >
      {children}
    </span>
  );
}

// One card for the whole page, in two sizes, so records, achievements and the career map share
// corners, the chunky bottom edge, the icon tile and the header row. Each section has one theme
// colour for its icon tiles and progress bars.
type Tone = "cobalt" | "yellow" | "soft";

const TONES: Record<Tone, { tile: string; bar: string }> = {
  cobalt: { tile: "bg-primary text-primary-foreground", bar: "bg-primary" },
  yellow: { tile: "bg-[var(--brand-yellow)] text-[#0a0f2c]", bar: "bg-[var(--brand-yellow)]" },
  soft: { tile: "bg-secondary text-primary", bar: "bg-primary/70" },
};

/** The chunky edge every card on the page uses. */
const CARD_EDGE = "rounded-2xl border-2 border-b-[5px] bg-card";

function IconTile({ icon: Icon, tone, size = "large" }: { icon: LucideIcon; tone: Tone; size?: "large" | "compact" }) {
  return (
    <span className={cn("grid shrink-0 place-items-center rounded-xl", size === "large" ? "size-11" : "size-9", TONES[tone].tile)}>
      <Icon className={size === "large" ? "size-5" : "size-4"} aria-hidden />
    </span>
  );
}

function ProfileCard({
  tone,
  icon,
  size = "large",
  badge,
  muted = false,
  children,
}: {
  tone: Tone;
  icon: LucideIcon;
  size?: "large" | "compact";
  /** Shown on the right of the header row. */
  badge?: React.ReactNode;
  /** Locked items fade back. */
  muted?: boolean;
  children: React.ReactNode;
}) {
  return (
    <article className={cn(CARD_EDGE, "flex flex-col", size === "large" ? "p-5" : "p-3.5", muted && "opacity-70")}>
      <div className="flex items-start justify-between gap-3">
        <IconTile icon={icon} tone={tone} size={size} />
        {badge}
      </div>
      <div className={cn("flex flex-1 flex-col", size === "large" ? "mt-4" : "mt-3")}>{children}</div>
    </article>
  );
}

function Pill({ children }: { children: React.ReactNode }) {
  return <span className="rounded-full bg-secondary px-2.5 py-0.5 text-xs font-medium text-primary">{children}</span>;
}

function CardLabel({ children }: { children: React.ReactNode }) {
  return <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{children}</p>;
}

function ProgressBar({ percent, tone }: { percent: number; tone: Tone }) {
  return (
    <div className="h-2.5 overflow-hidden rounded-full bg-muted">
      <div className={cn("h-full rounded-full", TONES[tone].bar)} style={{ width: `${Math.max(0, Math.min(100, percent))}%` }} />
    </div>
  );
}

/** Dot is drawn as decoration; the text beside it carries the meaning. */
function DotAside({ mood, size = 44 }: { mood: DotMood; size?: number }) {
  return (
    <span aria-hidden className="shrink-0">
      <Dot mood={mood} size={size} />
    </span>
  );
}

const NODE_BUBBLE: Record<CareerNodeState, string> = {
  done: "bg-primary text-primary-foreground",
  current: "size-20 bg-[var(--brand-yellow)] text-[#0a0f2c] ring-4 ring-[var(--brand-yellow)]/25",
  next: "bg-secondary text-primary ring-2 ring-primary/40",
  locked: "bg-muted text-muted-foreground",
};

function CareerMap({ profile, isOwner }: { profile: CardProfile; isOwner: boolean }) {
  const currentIndex = careerTierIndex(profile.careerTier);
  const nextTier = CAREER_TIERS[currentIndex + 1] ?? null;
  const mastery = profile.career ? { completedCourses: profile.career.completedCourses, avgScore: profile.career.avgScore } : null;
  const fill = CAREER_TIERS.length > 1 ? (currentIndex / (CAREER_TIERS.length - 1)) * 100 : 100;

  return (
    <div className={cn(CARD_EDGE, "overflow-hidden")}>
      <div className="flex flex-col gap-3 border-b-2 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <IconTile icon={Sparkles} tone="cobalt" />
          <div>
            <h3 className="text-base font-semibold tracking-tight">Edorax Career Path</h3>
            <p className="text-xs text-muted-foreground">Verified mastery moves you forward, one tier at a time.</p>
          </div>
        </div>
        <Pill>
          {currentIndex + 1} of {CAREER_TIERS.length} milestones
        </Pill>
      </div>

      <div className="px-4 pb-5 pt-6 sm:px-8">
        <div className="overflow-x-auto pb-2">
          <ol className="relative grid min-w-[720px] grid-cols-6 gap-3" aria-label="Career tiers">
            {/* The track runs between the first and last node centres; the filled part ends at the current tier. */}
            <span aria-hidden className="absolute left-[8.33%] right-[8.33%] top-10 h-2 rounded-full bg-muted">
              <span className="block h-full rounded-full bg-primary" style={{ width: `${fill}%` }} />
            </span>
            {CAREER_TIERS.map((tier, index) => {
              const state = careerNodeState(index, currentIndex);
              const Icon = TIER_ICONS[tier];
              return (
                <li key={tier} className="relative flex min-w-0 flex-col items-center text-center" aria-current={state === "current" ? "step" : undefined}>
                  <div className="flex h-20 items-center">
                    <span
                      className={cn(
                        "relative grid size-14 place-items-center rounded-2xl border-4 border-card shadow-[0_4px_0_0_var(--border)]",
                        NODE_BUBBLE[state],
                      )}
                    >
                      <Icon className={state === "current" ? "size-8" : "size-6"} aria-hidden />
                      {state === "done" ? (
                        <span className="absolute -bottom-1.5 -right-1.5 grid size-5 place-items-center rounded-full border-2 border-card bg-[var(--ok)] text-white">
                          <Check className="size-3" strokeWidth={3} aria-hidden />
                        </span>
                      ) : null}
                    </span>
                  </div>
                  {state === "current" ? (
                    <span className="mt-2 rounded-full bg-[var(--brand-yellow)] px-2 py-0.5 text-xs font-semibold text-[#0a0f2c]">
                      {isOwner ? "You are here" : "Current tier"}
                    </span>
                  ) : null}
                  <p className={cn("mt-2 text-sm font-semibold", state === "locked" ? "text-muted-foreground" : "text-foreground")}>
                    {CAREER_TIER_LABELS[tier]}
                  </p>
                  <p className="mt-1 max-w-[8.5rem] text-xs leading-snug text-muted-foreground">
                    {state === "done" ? "Reached" : careerRequirementLine(CAREER_REQUIREMENTS[tier])}
                  </p>
                </li>
              );
            })}
          </ol>
        </div>

        <div className="mt-4 flex flex-col gap-3 rounded-xl bg-secondary/60 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <DotAside mood={nextTier ? "determined" : "cheer"} />
            <p className="text-sm text-muted-foreground">
              {nextTier ? (
                <>
                  <span className="font-semibold text-foreground">Next up: {CAREER_TIER_LABELS[nextTier]}</span>
                  <br />
                  {nextStepCopy(nextTier, CAREER_REQUIREMENTS[nextTier], isOwner ? mastery : null)}
                </>
              ) : (
                <span className="font-semibold text-foreground">The highest career tier is reached.</span>
              )}
            </p>
          </div>
          {isOwner && nextTier ? (
            <Link
              href={profile.currentCourse ? `/courses/${profile.currentCourse.slug}` : "/catalog"}
              className={cn(buttonVariants({ size: "sm" }), "shrink-0")}
            >
              {profile.currentCourse ? "Continue learning" : "Find a course"}
            </Link>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function RecordCard({
  icon,
  badge,
  label,
  value,
  unit,
  caption,
  date,
  empty = false,
}: {
  icon: LucideIcon;
  badge: string;
  label: string;
  value: string;
  unit?: string;
  caption: string;
  date?: string;
  /** No record yet: Dot keeps the learner company instead of a bare "Not yet". */
  empty?: boolean;
}) {
  return (
    <ProfileCard tone="yellow" icon={icon} badge={<Pill>{badge}</Pill>}>
      <CardLabel>{label}</CardLabel>
      <p className="mt-1 text-2xl font-semibold tracking-tight tabular-nums">
        {value} {unit ? <small className="text-sm font-semibold text-muted-foreground">{unit}</small> : null}
      </p>
      <div className="mt-1.5 flex items-center gap-2">
        {empty ? <DotAside mood="wave" size={36} /> : null}
        <p className="text-sm text-muted-foreground">{caption}</p>
      </div>
      {date ? <p className="mt-1 text-xs text-muted-foreground">{date}</p> : null}
    </ProfileCard>
  );
}

function RecordTile({ icon, label, value, sub }: { icon: LucideIcon; label: string; value: string; sub?: string }) {
  return (
    <ProfileCard tone="yellow" icon={icon} size="compact">
      <CardLabel>{label}</CardLabel>
      <p className="mt-1 text-lg font-semibold tracking-tight tabular-nums">{value}</p>
      {sub ? <p className="text-xs text-muted-foreground">{sub}</p> : null}
    </ProfileCard>
  );
}

function Records({ records }: { records: NonNullable<PublicProfileView["records"]> }) {
  const streak = records.longestStreakDays;
  const big = (
    <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <RecordCard
        icon={Flame}
        badge="Personal best"
        label="Longest streak"
        value={String(streak)}
        unit={streak === 1 ? "day" : "days"}
        caption={streak > 0 ? "The longest learning run so far." : "A streak starts with one day of learning."}
        empty={streak === 0}
      />
      <RecordCard
        icon={Zap}
        badge="Personal best"
        label="Best learning week"
        value={records.bestWeeklyXp ? records.bestWeeklyXp.value.toLocaleString() : "Not yet"}
        unit={records.bestWeeklyXp ? "XP" : undefined}
        caption={records.bestWeeklyXp ? "The most focused week yet." : "Earn XP in a week to set this record."}
        date={records.bestWeeklyXp ? `Week of ${shortDate(records.bestWeeklyXp.weekKey)}` : undefined}
        empty={!records.bestWeeklyXp}
      />
      <RecordCard
        icon={Trophy}
        badge={records.bestLeagueFinish ? "Unlocked" : "Locked"}
        label="Best league finish"
        value={records.bestLeagueFinish ? `#${records.bestLeagueFinish.rank}` : "Not yet"}
        unit={records.bestLeagueFinish ? LEAGUE_TIER_LABELS[records.bestLeagueFinish.tier] : undefined}
        caption={records.bestLeagueFinish ? "Best finish on a weekly league board." : "Finish a weekly league to set this record."}
        date={records.bestLeagueFinish ? `Week of ${shortDate(records.bestLeagueFinish.weekKey)}` : undefined}
        empty={!records.bestLeagueFinish}
      />
    </div>
  );
  return (
    <section aria-labelledby="records-heading">
      <RevealMore
        label="See all records"
        hideLabel="Show fewer records"
        heading={<SectionHeading id="records-heading" title="Records" description="Big moments worth keeping around." />}
        preview={big}
      >
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          <RecordTile icon={Zap} label="Best day" value={records.mostXpInADay ? `${records.mostXpInADay.value.toLocaleString()} XP` : "Not yet"} sub={records.mostXpInADay ? shortDate(records.mostXpInADay.dayKey) : undefined} />
          <RecordTile icon={Medal} label="Highest league" value={records.highestLeagueTier ? LEAGUE_TIER_LABELS[records.highestLeagueTier] : "Not yet"} />
          <RecordTile icon={BookOpen} label="Best chapters / week" value={records.bestWeekChapters ? `${records.bestWeekChapters.value}` : "Not yet"} sub={records.bestWeekChapters ? `week of ${shortDate(records.bestWeekChapters.weekKey)}` : undefined} />
          <RecordTile icon={Clock} label="Most study / day" value={records.mostStudyMinutesInADay ? `${records.mostStudyMinutesInADay.value} min` : "Not yet"} sub={records.mostStudyMinutesInADay ? shortDate(records.mostStudyMinutesInADay.dayKey) : undefined} />
          <RecordTile icon={Timer} label="Longest session" value={records.longestSessionMinutes > 0 ? `${records.longestSessionMinutes} min` : "Not yet"} />
          <RecordTile icon={Target} label="Perfect quizzes" value={`${records.perfectQuizzes}`} />
          <RecordTile icon={Calendar} label="Active days" value={`${records.activeDays}`} />
        </div>
      </RevealMore>
    </section>
  );
}

function nextRewardFor(a: AchievementView): number | null {
  return a.tier + 1 < a.tiers.length ? rewardForTier(a.tier + 1) : a.nextReward ?? null;
}

function achievementPercent(a: AchievementView): number {
  return a.nextTarget === null ? 100 : Math.round(a.progress * 100);
}

function FeaturedAchievement({ a, claim }: { a: AchievementView; claim?: AchievementClaim }) {
  const reward = nextRewardFor(a);
  const earned = a.tier >= 0 ? a.tiers[a.tier]?.label : null;
  const percent = achievementPercent(a);
  return (
    <ProfileCard
      tone="soft"
      icon={ACH_ICONS[a.icon] ?? Trophy}
      badge={<Pill>{reward !== null ? `Next reward · ${reward} credits` : earned ? `${earned} · earned` : "In progress"}</Pill>}
    >
      <CardLabel>{a.category} collection</CardLabel>
      <h3 className="mt-1 text-lg font-semibold tracking-tight">{a.title}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{a.description}</p>
      <div className="mt-auto pt-4">
        <div className="mb-1.5 flex justify-between gap-2 text-xs font-medium text-muted-foreground">
          <span className="tabular-nums">{a.nextTarget === null ? "All tiers reached" : `${a.value} / ${a.nextTarget}`}</span>
          <span className="tabular-nums">{percent}%</span>
        </div>
        <ProgressBar percent={percent} tone="soft" />
        {claim ? <AchievementClaimButton achievementId={a.id} credits={claim.credits} className="mt-4" /> : null}
      </div>
    </ProfileCard>
  );
}

function AchievementCard({ a, claim }: { a: AchievementView; claim?: AchievementClaim }) {
  const maxed = a.tier >= 0 && a.nextTarget === null;
  const locked = a.tier < 0;
  const tierLabel = a.tier >= 0 ? a.tiers[a.tier]?.label : "Locked";
  const earnedCredits = Array.from({ length: a.tier + 1 }, (_, i) => rewardForTier(i)).reduce((sum, n) => sum + n, 0);
  const nextReward = nextRewardFor(a);
  return (
    <ProfileCard
      tone="soft"
      icon={ACH_ICONS[a.icon] ?? Trophy}
      size="compact"
      muted={locked}
      badge={!locked ? <AchievementShareButton title={a.title} /> : null}
    >
      <p className="truncate text-sm font-semibold">{a.title}</p>
      <p className="truncate text-xs text-muted-foreground">{tierLabel}</p>
      <div className="mt-auto pt-2.5">
        <ProgressBar percent={achievementPercent(a)} tone="soft" />
        <p className="mt-1.5 text-xs text-muted-foreground">
          {maxed ? `Maxed · earned ${earnedCredits}` : `${a.value} / ${a.nextTarget} · +${nextReward ?? 0} credits`}
        </p>
        {claim ? <AchievementClaimButton achievementId={a.id} credits={claim.credits} className="mt-2 w-full" /> : null}
      </div>
    </ProfileCard>
  );
}

function Achievements({ achievements, claims }: { achievements: AchievementView[]; claims: Claims }) {
  const featured = featuredAchievements(achievements, 2, new Set(claims.keys()));
  const heading = <SectionHeading id="achievements-heading" title="Achievements" description="Small wins with a little more room to celebrate." />;
  const preview =
    featured.length > 0 ? (
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        {featured.map((a) => (
          <FeaturedAchievement key={a.id} a={a} claim={claims.get(a.id)} />
        ))}
      </div>
    ) : null;
  return (
    <section aria-labelledby="achievements-heading">
      <RevealMore label={`Open achievement shelf (${achievements.length})`} hideLabel="Close achievement shelf" heading={heading} preview={preview}>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {achievements.map((a) => (
            <AchievementCard key={a.id} a={a} claim={claims.get(a.id)} />
          ))}
        </div>
      </RevealMore>
    </section>
  );
}

export function PublicProfileCard({
  profile,
  variant = "public",
}: {
  profile: CardProfile;
  variant?: "public" | "owner";
}) {
  const isOwner = variant === "owner";
  // The owner page already has a "Profile" h1; on the public page the learner's name is the page title.
  const NameHeading = isOwner ? "h2" : "h1";
  const headline =
    [profile.headline, profile.learningInPublic ? "Learning in public" : null].filter(Boolean).join(" · ") || null;
  const joined = monthYear(profile.joinedAt);
  const earnedAchievements = profile.achievements?.filter((a) => a.tier >= 0).length ?? null;
  const claims: Claims = new Map(isOwner ? (profile.achievementClaims ?? []).map((claim) => [claim.id, claim]) : []);
  const claimTotal = [...claims.values()].reduce((sum, claim) => sum + claim.credits, 0);

  const stats: { value: string; label: string }[] = [];
  if (profile.xpTotal !== null) stats.push({ value: profile.xpTotal.toLocaleString(), label: "Lifetime XP" });
  if (profile.records) stats.push({ value: String(profile.records.longestStreakDays), label: "Best streak" });
  if (earnedAchievements !== null) stats.push({ value: String(earnedAchievements), label: "Achievements" });
  if (stats.length === 0) stats.push({ value: String(profile.coursesCompleted), label: "Courses completed" });

  return (
    <main className={cn("w-full", isOwner ? "" : "mx-auto max-w-[1240px] px-4 py-10 sm:px-6")}>
      <div className={cn("space-y-8", isOwner && "px-4 py-6 sm:px-6 lg:px-8")}>
        {/* Hero */}
        <section
          aria-label="Profile header"
          className="rounded-2xl bg-[#0a0f2c] px-5 py-6 text-white dark:border dark:bg-card sm:px-8 sm:py-7"
        >
          <div className="relative grid gap-6 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-center">
            <div className="flex min-w-0 flex-col gap-5 sm:flex-row sm:items-center">
              <div className="grid size-24 shrink-0 place-items-center rounded-2xl bg-[var(--brand-yellow)]">
                <CosmeticDot visual={profile.cosmetic} size={80} />
              </div>
              <div className="min-w-0">
                <NameHeading className="break-words text-2xl font-semibold tracking-tight sm:text-3xl">{profile.name}</NameHeading>
                {headline ? <p className="mt-2 text-sm text-white/70">{headline}</p> : null}
                <div className="mt-3.5 flex flex-wrap gap-2">
                  <HeroTag highlight>
                    <Award className="size-3.5" aria-hidden /> {CAREER_TIER_LABELS[profile.careerTier]}
                  </HeroTag>
                  <HeroTag>
                    <GraduationCap className="size-3.5" aria-hidden /> {profile.coursesCompleted} {profile.coursesCompleted === 1 ? "course" : "courses"} completed
                  </HeroTag>
                  {joined ? (
                    <HeroTag>
                      <Calendar className="size-3.5" aria-hidden /> Joined {joined}
                    </HeroTag>
                  ) : null}
                  {profile.currentCourse ? (
                    <HeroTag>
                      <BookOpen className="size-3.5 shrink-0" aria-hidden /> <span className="max-w-[18rem] truncate" title={profile.currentCourse.title}>{profile.currentCourse.title}</span>
                    </HeroTag>
                  ) : null}
                </div>
              </div>
            </div>
            <div className="flex flex-col gap-3">
              <div className={cn("grid gap-2.5 xl:min-w-80", stats.length === 3 ? "grid-cols-3" : stats.length === 2 ? "grid-cols-2" : "grid-cols-1")} aria-label="Profile stats">
                {stats.map((stat) => (
                  <HeroStat key={stat.label} value={stat.value} label={stat.label} />
                ))}
              </div>
              <ShareProfileButton shareUrl={`/u/${profile.slug}`} className="w-full sm:w-auto sm:self-start xl:self-end" />
            </div>
          </div>
        </section>

        {isOwner && claimTotal > 0 ? (
          <a
            href="#achievements-heading"
            className="flex items-center gap-2 rounded-2xl border-2 border-b-[5px] border-primary/40 bg-primary/10 p-3 text-sm transition-[border-width,transform] hover:bg-primary/15 active:translate-y-[3px] active:border-b-2 motion-reduce:transition-none motion-reduce:active:translate-y-0"
          >
            <Trophy className="size-4 shrink-0 text-primary" aria-hidden />
            <span>
              <span className="font-semibold tabular-nums">{claimTotal}</span> Build Credits are ready to claim from {claims.size}{" "}
              {claims.size === 1 ? "achievement" : "achievements"}.
            </span>
          </a>
        ) : null}
        {isOwner && profile.careerPromotion ? <CareerPromotionCelebration tier={profile.careerPromotion.tier} /> : null}

        <section aria-labelledby="career-heading" className="space-y-4">
          <SectionHeading
            id="career-heading"
            title={isOwner ? "Your career adventure" : "Career adventure"}
            description="Every finished course moves the character one step closer to the next tier."
          />
          <CareerMap profile={profile} isOwner={isOwner} />
        </section>

        {profile.records ? <Records records={profile.records} /> : null}

        {profile.achievements && profile.achievements.length > 0 ? <Achievements achievements={profile.achievements} claims={claims} /> : null}

        <p className="text-center text-xs text-muted-foreground">
          Verified learning on Edorax. Career tier reflects completed courses and quiz mastery, not time spent.
        </p>
      </div>
    </main>
  );
}
