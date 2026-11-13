import { prisma } from "../../db/prisma.js";
import type {
  OwnerProfileView,
  PublicProfileSettings,
  PublicProfileUpdate,
  PublicProfileView,
} from "../../shared/api/public-profile.js";
import { REWARD_BY_ID, type RewardId } from "../../shared/gamification/rewards.js";
import { BadRequestError, NotFoundError } from "../../utils/errors.js";
import { loadLearnerHabit } from "../progress/learner-habit.js";
import { loadRecords } from "../gamification/records.js";
import { loadAchievements, grantAchievementRewards } from "../gamification/achievements.js";
import { creditBalance } from "../gamification/credits.js";
import { gamificationFeatures } from "../gamification/flags.js";

// The public Career Identity page. A learner opts in (profilePublic) and gets a unique handle; an
// unauthenticated GET /api/v1/public/profiles/:slug returns the curated card. Only safe fields are
// exposed and "hide game elements" suppresses the XP/league/streak tiles.

/** URL-safe handle from a display name; falls back to "learner". */
export function slugify(name: string | null | undefined): string {
  const base = (name ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return base || "learner";
}

async function uniqueSlug(base: string, excludeUserId?: string): Promise<string> {
  for (let n = 0; n < 50; n++) {
    const candidate = n === 0 ? base : `${base}-${n + 1}`;
    const clash = await prisma.user.findUnique({ where: { publicSlug: candidate }, select: { id: true } });
    if (!clash || clash.id === excludeUserId) return candidate;
  }
  return `${base}-${Date.now().toString(36)}`;
}

export async function getPublicProfileSettings(userId: string): Promise<PublicProfileSettings> {
  const [user, profile] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { profilePublic: true, publicSlug: true } }),
    prisma.userProfile.findUnique({ where: { userId }, select: { headline: true, learningInPublic: true } }),
  ]);
  return {
    profilePublic: user?.profilePublic ?? false,
    publicSlug: user?.publicSlug ?? null,
    headline: profile?.headline ?? null,
    learningInPublic: profile?.learningInPublic ?? false,
  };
}

export async function updatePublicProfileSettings(userId: string, input: PublicProfileUpdate): Promise<PublicProfileSettings> {
  if (input.headline !== undefined && input.headline !== null && input.headline.length > 120) {
    throw new BadRequestError("Headline is too long (max 120 characters).");
  }

  await prisma.$transaction(async (tx) => {
    if (input.profilePublic === true) {
      const user = await tx.user.findUnique({ where: { id: userId }, select: { name: true, publicSlug: true } });
      const slug = user?.publicSlug ?? (await uniqueSlug(slugify(user?.name), userId));
      await tx.user.update({ where: { id: userId }, data: { profilePublic: true, publicSlug: slug } });
    } else if (input.profilePublic === false) {
      await tx.user.update({ where: { id: userId }, data: { profilePublic: false } });
    }

    if (input.headline !== undefined || input.learningInPublic !== undefined) {
      const data = {
        ...(input.headline !== undefined ? { headline: input.headline?.trim() || null } : {}),
        ...(input.learningInPublic !== undefined ? { learningInPublic: input.learningInPublic } : {}),
      };
      await tx.userProfile.upsert({
        where: { userId },
        create: { userId, ...data },
        update: data,
      });
    }
  });

  return getPublicProfileSettings(userId);
}

export async function loadPublicProfile(slug: string): Promise<PublicProfileView> {
  const user = await prisma.user.findUnique({
    where: { publicSlug: slug },
    select: PROFILE_SELECT,
  });
  if (!user || !user.profilePublic) throw new NotFoundError("Profile not found");
  return buildProfileView(user, slug);
}

/**
 * The owner's view of the same page. Works even when the profile is private (a preview); ensures the
 * learner has a slug so they always have a URL, and adds owner-only fields (visibility, credits).
 */
export async function loadOwnProfile(userId: string): Promise<OwnerProfileView> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: PROFILE_SELECT });
  if (!user) throw new NotFoundError("Profile not found");

  let slug = user.publicSlug;
  if (!slug) {
    slug = await uniqueSlug(slugify(user.name), user.id);
    await prisma.user.update({ where: { id: user.id }, data: { publicSlug: slug } });
  }

  const view = await buildProfileView(user, slug);
  const creditsOn = gamificationFeatures().credits;
  const achievementRewards =
    creditsOn && view.achievements ? await grantAchievementRewards(userId, view.achievements) : { count: 0, credits: 0 };
  return {
    ...view,
    isOwner: true,
    profilePublic: user.profilePublic,
    creditsBalance: creditsOn ? await creditBalance(userId) : null,
    achievementRewards,
  };
}

const PROFILE_SELECT = {
  id: true,
  name: true,
  createdAt: true,
  xpTotal: true,
  leagueTier: true,
  careerTier: true,
  gamificationHidden: true,
  profilePublic: true,
  publicSlug: true,
  activeCosmetic: true,
  profile: { select: { headline: true, learningInPublic: true } },
} as const;

type ProfileUser = {
  id: string;
  name: string | null;
  createdAt: Date;
  xpTotal: number;
  leagueTier: PublicProfileView["leagueTier"];
  careerTier: PublicProfileView["careerTier"];
  gamificationHidden: boolean;
  activeCosmetic: string | null;
  profile: { headline: string | null; learningInPublic: boolean } | null;
};

async function buildProfileView(user: ProfileUser, slug: string): Promise<PublicProfileView> {
  const [coursesCompleted, habit, records, achievements, current] = await Promise.all([
    prisma.enrollment.count({ where: { userId: user.id, status: "COMPLETED" } }),
    loadLearnerHabit(user.id, { applyFreezes: false }),
    user.gamificationHidden ? Promise.resolve(null) : loadRecords(user.id),
    user.gamificationHidden ? Promise.resolve(null) : loadAchievements(user.id),
    prisma.enrollment.findFirst({
      where: { userId: user.id, status: { notIn: ["COMPLETED", "DROPPED"] } },
      orderBy: [{ lastActiveAt: "desc" }, { createdAt: "desc" }],
      select: { percentComplete: true, course: { select: { slug: true, title: true } } },
    }),
  ]);

  const equipped = user.activeCosmetic ? REWARD_BY_ID.get(user.activeCosmetic as RewardId) : undefined;
  const cosmetic = equipped && equipped.kind === "cosmetic" ? equipped.visual : null;
  const hidden = user.gamificationHidden;

  return {
    slug,
    name: user.name ?? "Buildment learner",
    headline: user.profile?.headline ?? null,
    learningInPublic: user.profile?.learningInPublic ?? false,
    joinedAt: user.createdAt.toISOString(),
    careerTier: user.careerTier,
    coursesCompleted,
    xpTotal: hidden ? null : Math.max(0, user.xpTotal),
    streakDays: hidden ? null : habit.streakCount,
    leagueTier: hidden ? null : user.leagueTier,
    cosmetic,
    hidden,
    records: hidden ? null : records,
    achievements: hidden ? null : achievements,
    currentCourse: current ? { slug: current.course.slug, title: current.course.title, percentComplete: current.percentComplete } : null,
  };
}
