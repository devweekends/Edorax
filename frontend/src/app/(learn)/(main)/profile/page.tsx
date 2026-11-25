import type { Metadata } from "next";
import Link from "next/link";
import { serverApiFetch } from "@/lib/api-server";
import type { OwnerProfileView } from "@/shared/api/public-profile";
import { PublicProfileCard } from "@/components/profile/public-profile-card";
import { buttonVariants } from "@/components/ui/button";

export const metadata: Metadata = { title: "Profile" };

// The signed-in learner's profile inside the app shell, edge-to-edge (no side gaps). Editing lives in
// Settings; this page previews what the public sees.
export default async function ProfilePage() {
  const owner = await serverApiFetch<OwnerProfileView>("/api/v1/learner/my-profile");
  return (
    <div className="w-full">
      <header className="flex flex-col gap-6 border-b px-4 pb-7 pt-6 sm:flex-row sm:items-end sm:justify-between sm:px-6 lg:px-8">
        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-primary">Your learning identity</p>
          <h1 className="text-[32px] leading-tight tracking-[-0.035em] sm:text-[40px]">Profile</h1>
          <p className="mt-2 max-w-xl text-lg text-muted-foreground">
            Who you are becoming, the milestones behind you, and where your learning goes next. Your shared profile page shows the same card, without your quiz average.
          </p>
        </div>
        <Link href="/settings/profile" className={buttonVariants({ variant: "outline", size: "sm" })}>
          Edit in settings
        </Link>
      </header>
      <PublicProfileCard profile={owner} variant="owner" />
    </div>
  );
}
