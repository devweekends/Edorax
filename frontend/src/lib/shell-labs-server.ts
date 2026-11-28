import "server-only";
import { serverApiFetch } from "@/lib/api-server";
import { DESKTOP_PLATFORMS, platformLabel } from "@/lib/desktop-updates";
import type { DesktopPlatform } from "@/shared/api/desktop-updates";
import type { PublicShellLab } from "@/lib/shell-labs";
import type { BrowserLab } from "@/lib/browser-lab/types";

/** Where the installers live when the server has no download link for a platform yet. */
export const DESKTOP_RELEASES_URL = "https://github.com/devweekends/Edorax/releases";

/** The public shell lab catalogue. An API that is down gives an empty list, so the page still opens. */
export async function loadShellLabs(): Promise<PublicShellLab[]> {
  try {
    return (await serverApiFetch<{ labs: PublicShellLab[] }>("/api/v1/shell-labs/public", { token: null })).labs;
  } catch {
    return [];
  }
}

/** One lab by slug, or null when it does not exist (or the API cannot be reached). */
export async function loadShellLab(slug: string): Promise<PublicShellLab | null> {
  return (await loadShellLabs()).find((lab) => lab.slug === slug) ?? null;
}

/**
 * The whole lab and the steps this learner has passed, for the browser runtime. Null when the
 * visitor is not signed in, has no verified email, or the lab does not run in the browser.
 */
export async function loadBrowserShellLab(slug: string): Promise<{ lab: BrowserLab; done: string[] } | null> {
  try {
    const [{ lab }, { progress }] = await Promise.all([
      serverApiFetch<{ lab: BrowserLab }>(`/api/v1/shell-labs/browser/${encodeURIComponent(slug)}`),
      serverApiFetch<{ progress: Record<string, string[]> }>("/api/v1/shell-labs/progress"),
    ]);
    return { lab, done: progress[slug] ?? [] };
  } catch {
    return null;
  }
}

/** The steps the signed-in learner has passed, per lab. Empty for a visitor or when the API cannot be reached. */
export async function loadShellLabProgress(): Promise<Record<string, string[]>> {
  try {
    return (await serverApiFetch<{ progress: Record<string, string[]> }>("/api/v1/shell-labs/progress")).progress;
  } catch {
    return {};
  }
}

export interface DesktopDownload {
  platform: DesktopPlatform;
  label: string;
  url: string;
  version: string | null;
}

/** The installer link for each platform, from the same policy the desktop app reads. */
export async function loadDesktopDownloads(): Promise<DesktopDownload[]> {
  return Promise.all(
    DESKTOP_PLATFORMS.map(async (platform): Promise<DesktopDownload> => {
      try {
        const policy = await serverApiFetch<{ latestVersion: string; downloadUrl: string }>(`/api/v1/desktop/version?platform=${platform}`, { token: null });
        return { platform, label: platformLabel(platform), url: policy.downloadUrl || DESKTOP_RELEASES_URL, version: policy.latestVersion || null };
      } catch {
        return { platform, label: platformLabel(platform), url: DESKTOP_RELEASES_URL, version: null };
      }
    }),
  );
}
