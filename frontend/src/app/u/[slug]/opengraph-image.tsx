import { ImageResponse } from "next/og";
import type { PublicProfileView } from "@/shared/api/public-profile";
import { CAREER_TIER_LABELS } from "@/shared/gamification/career";

// Social preview card for a public Career Identity page (/u/<slug>). Self-contained fetch so it does
// not depend on request cookies.

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const API_URL = (process.env.API_URL ?? "http://localhost:4000").replace(/\/$/, "");

async function fetchProfile(slug: string): Promise<PublicProfileView | null> {
  try {
    const res = await fetch(`${API_URL}/api/v1/public/profiles/${encodeURIComponent(slug)}`, { cache: "no-store" });
    if (!res.ok) return null;
    const json = (await res.json()) as { data?: PublicProfileView };
    return json.data ?? null;
  } catch {
    return null;
  }
}

export default async function OpengraphImage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const profile = await fetchProfile(slug);
  const name = profile?.name ?? "Buildment learner";
  const headline =
    [profile?.headline, profile?.learningInPublic ? "Learning in public" : null].filter(Boolean).join(" · ") ||
    "Verified learning profile";
  const career = profile ? CAREER_TIER_LABELS[profile.careerTier] : "Intern";
  const xp = profile?.xpTotal == null ? "—" : profile.xpTotal.toLocaleString();
  const courses = profile ? String(profile.coursesCompleted) : "0";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "linear-gradient(135deg, #0f172a 0%, #1e1b4b 100%)",
          color: "white",
          padding: 64,
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 28 }}>
          <div
            style={{
              width: 120,
              height: 120,
              borderRadius: 60,
              background: "#facc15",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 64,
            }}
          >
            🙂
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ fontSize: 56, fontWeight: 700 }}>{name}</div>
            <div style={{ fontSize: 28, color: "rgba(255,255,255,0.7)" }}>{headline}</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 24 }}>
          {[
            { label: "CAREER", value: career },
            { label: "LIFETIME XP", value: xp },
            { label: "COURSES", value: courses },
          ].map((s) => (
            <div
              key={s.label}
              style={{
                display: "flex",
                flexDirection: "column",
                background: "rgba(255,255,255,0.08)",
                borderRadius: 24,
                padding: "24px 36px",
              }}
            >
              <div style={{ fontSize: 44, fontWeight: 700 }}>{s.value}</div>
              <div style={{ fontSize: 20, letterSpacing: 2, color: "rgba(255,255,255,0.6)" }}>{s.label}</div>
            </div>
          ))}
        </div>
        <div style={{ fontSize: 24, color: "rgba(255,255,255,0.5)" }}>Buildment · Career Identity</div>
      </div>
    ),
    { ...size }
  );
}
