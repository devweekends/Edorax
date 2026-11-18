import type { Metadata } from "next";
import { SITE_SHARE_IMAGE } from "@/lib/site";
import { areaById } from "@/lib/learn-areas";
import { AreaHero, AreaPage } from "@/components/areas/area-page";
import { GamesHub } from "@/components/games/games-hub";

export const metadata: Metadata = {
  title: "Daily games",
  description: "Three short games every day: fix a broken system, explore a Linux server, repair a Docker container. A little XP for each round you solve.",
  alternates: { canonical: "/puzzles" },
  openGraph: { title: "Daily games on Edorax", url: "/puzzles", images: [SITE_SHARE_IMAGE] },
};

export default function PuzzlesPage() {
  const area = areaById("puzzles");
  return (
    <AreaPage>
      <AreaHero
        eyebrow="Daily games"
        title="Play, fix, learn"
        status={area.status}
        mood="wink"
        intro="Three games, three rounds each, new every day. Each round you solve earns a little XP, with a bonus for finishing a whole game."
      />
      <GamesHub />
    </AreaPage>
  );
}
