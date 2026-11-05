import { serverApiFetch } from "@/lib/api-server";
import { HighlightsLibrary } from "@/components/learn/highlights-library";
import type { UserHighlightView } from "@/server/actions/highlights";

export const dynamic = "force-dynamic";

export default async function HighlightsPage() {
  const highlights = await serverApiFetch<UserHighlightView[]>("/api/v1/learner/highlights").catch(() => []);
  return <HighlightsLibrary initial={highlights} />;
}
