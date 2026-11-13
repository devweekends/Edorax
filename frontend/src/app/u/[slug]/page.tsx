import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { serverApiFetch } from "@/lib/api-server";
import type { PublicProfileView } from "@/shared/api/public-profile";
import { PublicProfileCard } from "@/components/profile/public-profile-card";
import { Wordmark } from "@/components/brand/wordmark";

type Params = { slug: string };

// The public Career Identity page, wrapped in the landing page's chrome (Edorax nav + footer, fonts
// and colours). Always the read-only public card; the owner edits at /profile.
async function fetchPublic(slug: string): Promise<PublicProfileView | null> {
  try {
    return await serverApiFetch<PublicProfileView>(`/api/v1/public/profiles/${encodeURIComponent(slug)}`, { token: null });
  } catch {
    return null;
  }
}

function tagline(profile: PublicProfileView): string {
  return (
    [profile.headline, profile.learningInPublic ? "Learning in public" : null].filter(Boolean).join(" · ") ||
    "A verified learning profile on Buildment."
  );
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { slug } = await params;
  const profile = await fetchPublic(slug);
  if (!profile) return { title: "Profile not found · Buildment" };
  const title = `${profile.name} · Buildment`;
  const description = tagline(profile);
  return {
    title,
    description,
    openGraph: { title, description, type: "profile" },
    twitter: { card: "summary_large_image", title, description },
  };
}

const navLink = { color: "#0A0F2C", textDecoration: "none", fontWeight: 700, padding: "12px 0", whiteSpace: "nowrap" } as const;

export default async function PublicProfilePage({ params }: { params: Promise<Params> }) {
  const { slug } = await params;
  const profile = await fetchPublic(slug);
  if (!profile) notFound();

  return (
    <div
      style={{
        width: "100%",
        minHeight: "100dvh",
        boxSizing: "border-box",
        background: "#F6F7FB",
        color: "#0A0F2C",
        fontFamily: "var(--font-dm-sans), system-ui, sans-serif",
        fontSize: "18px",
        lineHeight: "1.55",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <header style={{ width: "100%" }}>
        <div
          style={{
            maxWidth: 1200,
            margin: "0 auto",
            padding: "20px 24px",
            boxSizing: "border-box",
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 16,
          }}
        >
          <Link href="/" aria-label="Edorax home" style={{ display: "flex", alignItems: "center", textDecoration: "none" }}>
            <Wordmark tone="light" height={30} />
          </Link>
          <nav aria-label="Main" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "8px 28px", fontSize: 16 }}>
            <Link href="/catalog" style={navLink}>
              Courses
            </Link>
            <Link href="/login" style={navLink}>
              Sign in
            </Link>
            <Link
              href="/signup"
              style={{ background: "#2434E0", color: "#F6F7FB", textDecoration: "none", fontWeight: 700, padding: "12px 22px", whiteSpace: "nowrap" }}
            >
              Get started
            </Link>
          </nav>
        </div>
      </header>

      <div style={{ flex: "1 1 auto" }}>
        <PublicProfileCard profile={profile} variant="public" />
      </div>

      <footer style={{ width: "100%", background: "#0A0F2C", color: "#C9CFF0" }}>
        <div
          style={{
            maxWidth: 1200,
            margin: "0 auto",
            padding: "44px 24px 36px",
            boxSizing: "border-box",
            display: "flex",
            flexWrap: "wrap",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 24,
          }}
        >
          <Wordmark tone="dark" height={26} />
          <nav aria-label="Footer" style={{ display: "flex", flexWrap: "wrap", gap: "4px 28px", fontSize: 15 }}>
            <Link href="/" style={{ color: "#C9CFF0", textDecoration: "none", padding: "10px 0" }}>
              Home
            </Link>
            <Link href="/catalog" style={{ color: "#C9CFF0", textDecoration: "none", padding: "10px 0" }}>
              Courses
            </Link>
            <span style={{ padding: "10px 0" }}>edorax.com</span>
          </nav>
        </div>
      </footer>
    </div>
  );
}
