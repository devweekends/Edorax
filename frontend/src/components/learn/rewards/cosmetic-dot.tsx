import { Dot, type DotMood } from "@/components/brand/dot";
import type { RewardVisual } from "@/shared/gamification/rewards";

// Mascot cosmetics drawn as vector accessories on Dot's 100×100 canvas: a "back" layer (auras, night
// backdrop) behind the mascot and a "front" layer (hats, glasses, scarves, sparkles) over it. Every
// overlay uses Dot's own coordinates so accessories sit exactly where they should.

const BRAND_YELLOW = "#FFC933";
const BRAND_NAVY = "#0A0F2C";
const BRAND_BLUE = "#2434E0";

function moodFor(visual: string | null): DotMood {
  if (visual === "oops") return "oops";
  if (visual === "sleep") return "sleep";
  return "happy";
}

function Back({ visual }: { visual: string | null }) {
  if (visual === "night") {
    return (
      <>
        <defs>
          <radialGradient id="gstack-night" cx="50%" cy="46%" r="55%">
            <stop offset="0%" stopColor="#0A0F2C" stopOpacity="0.96" />
            <stop offset="72%" stopColor="#0A0F2C" stopOpacity="0.82" />
            <stop offset="100%" stopColor="#0A0F2C" stopOpacity="0" />
          </radialGradient>
        </defs>
        <circle cx="50" cy="54" r="50" fill="url(#gstack-night)" />
      </>
    );
  }
  if (visual === "aurora") {
    return (
      <>
        <defs>
          <radialGradient id="gstack-aurora" cx="50%" cy="45%" r="55%">
            <stop offset="0%" stopColor="#818cf8" stopOpacity="0.85" />
            <stop offset="55%" stopColor="#22d3ee" stopOpacity="0.5" />
            <stop offset="100%" stopColor="#e879f9" stopOpacity="0" />
          </radialGradient>
        </defs>
        <circle cx="50" cy="52" r="48" fill="url(#gstack-aurora)" />
      </>
    );
  }
  return null;
}

function Star({ cx, cy, s, fill }: { cx: number; cy: number; s: number; fill: string }) {
  return (
    <path
      d={`M${cx} ${cy - s} L${cx + s * 0.28} ${cy - s * 0.28} L${cx + s} ${cy} L${cx + s * 0.28} ${cy + s * 0.28} L${cx} ${cy + s} L${cx - s * 0.28} ${cy + s * 0.28} L${cx - s} ${cy} L${cx - s * 0.28} ${cy - s * 0.28} Z`}
      fill={fill}
    />
  );
}

function Front({ visual }: { visual: string | null }) {
  switch (visual) {
    case "sparkle":
      return (
        <g>
          <Star cx={78} cy={22} s={9} fill={BRAND_YELLOW} />
          <Star cx={21} cy={34} s={6} fill={BRAND_YELLOW} />
        </g>
      );
    case "shades":
      return (
        <g>
          <path d="M31 46 H25 M69 46 H75" stroke={BRAND_NAVY} strokeWidth="2.6" strokeLinecap="round" />
          <rect x="31" y="42.5" width="17" height="12" rx="4.5" fill={BRAND_NAVY} />
          <rect x="52" y="42.5" width="17" height="12" rx="4.5" fill={BRAND_NAVY} />
          <path d="M48 47.5 H52" stroke={BRAND_NAVY} strokeWidth="2.6" strokeLinecap="round" />
          <path d="M35 46.5 q3 -2 6 0" stroke="#FFFFFF" strokeWidth="1.5" strokeOpacity="0.5" fill="none" strokeLinecap="round" />
        </g>
      );
    case "scarf":
      return (
        <g>
          <rect x="33" y="81" width="34" height="8.5" rx="4" fill={BRAND_BLUE} />
          <rect x="56" y="87" width="7.5" height="12" rx="2.5" fill={BRAND_BLUE} />
          <path d="M33 85.2 H67" stroke="#FFFFFF" strokeOpacity="0.35" strokeWidth="1.6" />
          <path d="M58 90 v6 M61.5 90 v6" stroke="#FFFFFF" strokeOpacity="0.3" strokeWidth="1.2" />
        </g>
      );
    case "crown":
      return (
        <g>
          <path d="M34 24 L39.5 11.5 L46 21.5 L50 9 L54 21.5 L60.5 11.5 L66 24 Z" fill={BRAND_YELLOW} stroke="#E0A800" strokeWidth="1.6" strokeLinejoin="round" />
          <rect x="34" y="23.5" width="32" height="5.5" rx="1.6" fill={BRAND_YELLOW} stroke="#E0A800" strokeWidth="1.6" />
          <circle cx="40" cy="26" r="1.7" fill={BRAND_NAVY} />
          <circle cx="50" cy="26" r="1.7" fill={BRAND_NAVY} />
          <circle cx="60" cy="26" r="1.7" fill={BRAND_NAVY} />
          <ellipse cx="44" cy="16" rx="1.1" ry="2" fill="#FFFFFF" opacity="0.55" transform="rotate(-20 44 16)" />
        </g>
      );
    case "focus":
      return <circle cx="50" cy="52" r="44" fill="none" stroke={BRAND_BLUE} strokeWidth="2" strokeDasharray="5 6" opacity="0.55" />;
    case "victory":
      return (
        <g>
          <circle cx="50" cy="52" r="44" fill="none" stroke={BRAND_YELLOW} strokeWidth="2.5" opacity="0.85" />
          <Star cx={82} cy={16} s={6} fill={BRAND_YELLOW} />
          <Star cx={16} cy={30} s={5} fill={BRAND_YELLOW} />
        </g>
      );
    case "night":
      return (
        <g>
          <path d="M76 12 a9 9 0 1 0 6.5 15 a7.2 7.2 0 1 1 -6.5 -15 z" fill="#E7E9FF" />
          <circle cx="27" cy="24" r="1.5" fill="#FFFFFF" opacity="0.85" />
          <circle cx="68" cy="33" r="1.2" fill="#FFFFFF" opacity="0.7" />
          <circle cx="34" cy="38" r="1" fill="#FFFFFF" opacity="0.6" />
        </g>
      );
    case "confetti":
      return (
        <g>
          <rect x="20" y="13" width="4.5" height="4.5" fill={BRAND_BLUE} transform="rotate(-18 22 15)" />
          <rect x="33" y="7" width="4.5" height="4.5" fill={BRAND_YELLOW} transform="rotate(12 35 9)" />
          <rect x="45" y="15" width="4.5" height="4.5" fill="#e879f9" transform="rotate(-24 47 17)" />
          <rect x="57" y="6" width="4.5" height="4.5" fill="#22d3ee" transform="rotate(20 59 8)" />
          <rect x="69" y="14" width="4.5" height="4.5" fill="#f97316" transform="rotate(-12 71 16)" />
        </g>
      );
    case "grad":
      return (
        <g>
          <path d="M50 9.5 L73 19.5 L50 29.5 L27 19.5 Z" fill={BRAND_NAVY} />
          <path d="M50 29.5 V41" stroke={BRAND_NAVY} strokeWidth="2.2" strokeLinecap="round" />
          <circle cx="50" cy="43" r="2.6" fill={BRAND_YELLOW} />
          <rect x="30" y="19" width="40" height="3" fill="#161c3a" />
        </g>
      );
    case "wizard":
      return (
        <g>
          <path d="M35 25.5 L50 3 L65 25.5 Z" fill={BRAND_BLUE} />
          <ellipse cx="50" cy="25.5" rx="19" ry="4.2" fill="#1b2a8a" />
          <rect x="35" y="22.5" width="30" height="4" fill="#1b2a8a" />
          <Star cx={50} cy={12} s={4.3} fill={BRAND_YELLOW} />
        </g>
      );
    case "oops":
      return (
        <g>
          <circle cx="77" cy="19" r="9.5" fill="#F43F5E" />
          <rect x="75.6" y="12.5" width="2.8" height="8" rx="1.4" fill="#FFFFFF" />
          <circle cx="77" cy="24" r="1.6" fill="#FFFFFF" />
        </g>
      );
    default:
      return null;
  }
}

export function CosmeticDot({ visual, size = 96 }: { visual: RewardVisual | string | null; size?: number }) {
  return (
    <div className="relative inline-grid place-items-center" style={{ width: size, height: size }} aria-hidden>
      <svg viewBox="0 0 100 100" width={size} height={size} className="pointer-events-none absolute inset-0 z-0">
        <Back visual={visual} />
      </svg>
      <span className="relative z-10 inline-flex">
        <Dot mood={moodFor(visual)} size={size} />
      </span>
      <svg viewBox="0 0 100 100" width={size} height={size} className="pointer-events-none absolute inset-0 z-20">
        <Front visual={visual} />
      </svg>
    </div>
  );
}
