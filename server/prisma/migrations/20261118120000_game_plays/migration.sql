-- CreateTable
CREATE TABLE "GamePlay" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "game" TEXT NOT NULL,
    "dayKey" DATE NOT NULL,
    "roundIndex" INTEGER NOT NULL,
    "stars" INTEGER NOT NULL,
    "score" INTEGER NOT NULL,
    "xpAwarded" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GamePlay_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GamePlay_userId_game_dayKey_roundIndex_key" ON "GamePlay"("userId", "game", "dayKey", "roundIndex");

-- CreateIndex
CREATE INDEX "GamePlay_userId_dayKey_idx" ON "GamePlay"("userId", "dayKey");

-- AddForeignKey
ALTER TABLE "GamePlay" ADD CONSTRAINT "GamePlay_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
