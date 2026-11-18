import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { GameHost } from "@/components/games/game-host";
import { GAME_IDS, isGameId } from "@/shared/games/types";

const TITLES = { sysdesign: "System Design Runner", linux: "Linux Command Explorer", docker: "Docker Commands" } as const;

export function generateStaticParams() {
  return GAME_IDS.map((game) => ({ game }));
}

export async function generateMetadata({ params }: { params: Promise<{ game: string }> }): Promise<Metadata> {
  const { game } = await params;
  if (!isGameId(game)) return {};
  return { title: `${TITLES[game]} - daily game`, alternates: { canonical: `/puzzles/${game}` } };
}

export default async function GamePage({ params }: { params: Promise<{ game: string }> }) {
  const { game } = await params;
  if (!isGameId(game)) notFound();
  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
      <h1 className="mb-5 text-2xl font-bold tracking-tight sm:text-3xl">{TITLES[game]}</h1>
      <GameHost game={game} />
    </div>
  );
}
