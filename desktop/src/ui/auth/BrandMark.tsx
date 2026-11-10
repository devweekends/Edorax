// The Edorax mark, matching frontend/public/logo.svg.
export function BrandMark({ className = 'size-12' }: { className?: string }) {
  return (
    <svg
      role="img"
      aria-label="Edorax"
      xmlns="http://www.w3.org/2000/svg"
      viewBox="3540 -660 740 740"
      className={className}
    >
      <rect x="3540" y="-660" width="740" height="740" rx="120" fill="#F6F7FB" />
      <path d="M3683 -64 L4127 -508" stroke="#2434E0" strokeWidth="160" strokeLinecap="round" fill="none" />
      <path d="M3683 -508 L3775 -416 M4035 -156 L4127 -64" stroke="#0A0F2C" strokeWidth="160" strokeLinecap="round" fill="none" />
      <circle cx="4127" cy="-508" r="90" fill="#FFC933" />
    </svg>
  );
}
