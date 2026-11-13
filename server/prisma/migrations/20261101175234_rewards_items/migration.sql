-- AlterTable
ALTER TABLE "User" ADD COLUMN     "xpBoostUntil" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "RewardInventory" (
    "userId" TEXT NOT NULL,
    "rewardId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL
);

-- CreateIndex
CREATE INDEX "RewardInventory_userId_idx" ON "RewardInventory"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "RewardInventory_userId_rewardId_key" ON "RewardInventory"("userId", "rewardId");

-- AddForeignKey
ALTER TABLE "RewardInventory" ADD CONSTRAINT "RewardInventory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
