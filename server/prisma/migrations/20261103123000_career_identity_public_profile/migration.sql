-- Career Identity public profile: opt-in page + headline.
ALTER TABLE "UserProfile"
  ADD COLUMN "headline" TEXT,
  ADD COLUMN "learningInPublic" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "User"
  ADD COLUMN "profilePublic" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "publicSlug" TEXT;

CREATE UNIQUE INDEX "User_publicSlug_key" ON "User"("publicSlug");
