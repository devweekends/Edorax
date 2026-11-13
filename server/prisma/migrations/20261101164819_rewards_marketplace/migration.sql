-- CreateTable
CREATE TABLE "UnlockedCosmetic" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "cosmetic" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UnlockedCosmetic_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UnlockedCosmetic_userId_idx" ON "UnlockedCosmetic"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "UnlockedCosmetic_userId_cosmetic_key" ON "UnlockedCosmetic"("userId", "cosmetic");

-- AddForeignKey
ALTER TABLE "UnlockedCosmetic" ADD CONSTRAINT "UnlockedCosmetic_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
