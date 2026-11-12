// Flat Edorax covers, the same eight designs the web catalog uses.
// Each card takes one by its list position, so neighbouring cards differ.
const GENERATED_COVERS: { bg: string; shapes: string }[] = [
  {
    bg: "#2434E0",
    shapes: '<rect x="30" y="92" width="22" height="40" fill="#F6F7FB"/><rect x="62" y="68" width="22" height="64" fill="#F6F7FB"/><rect x="94" y="40" width="22" height="92" fill="#FFC933"/>',
  },
  {
    bg: "#0A0F2C",
    shapes: '<circle cx="80" cy="70" r="40" fill="none" stroke="#7A8BFF" stroke-width="14"/><circle cx="80" cy="70" r="14" fill="#FFC933"/>',
  },
  {
    bg: "#FFC933",
    shapes: '<rect x="36" y="36" width="52" height="52" fill="#0A0F2C"/><rect x="72" y="72" width="52" height="52" fill="#2434E0"/>',
  },
  {
    bg: "#E8EBFF",
    shapes: '<circle cx="48" cy="70" r="16" fill="#2434E0"/><circle cx="88" cy="70" r="16" fill="#0A0F2C"/><circle cx="128" cy="70" r="16" fill="#FFC933"/>',
  },
  {
    bg: "#7A8BFF",
    shapes: '<rect x="34" y="60" width="92" height="20" fill="#0A0F2C"/><rect x="34" y="92" width="60" height="20" fill="#F6F7FB"/><circle cx="128" cy="38" r="12" fill="#FFC933"/>',
  },
  {
    bg: "#DCE0F2",
    shapes: '<circle cx="80" cy="70" r="44" fill="#2434E0"/><rect x="62" y="52" width="36" height="36" fill="#FFC933"/>',
  },
  {
    bg: "#46507A",
    shapes: '<rect x="30" y="86" width="26" height="46" fill="#FFC933"/><rect x="66" y="56" width="26" height="76" fill="#F6F7FB"/><rect x="102" y="26" width="26" height="106" fill="#7A8BFF"/>',
  },
  {
    bg: "#0A0F2C",
    shapes: '<rect x="36" y="36" width="88" height="88" fill="none" stroke="#FFC933" stroke-width="12"/><circle cx="80" cy="80" r="14" fill="#7A8BFF"/>',
  },
];

export function CoverArt({ variant }: { variant: number }) {
  const palette = GENERATED_COVERS[((variant % GENERATED_COVERS.length) + GENERATED_COVERS.length) % GENERATED_COVERS.length];
  return (
    <div aria-hidden className="absolute inset-0" style={{ backgroundColor: palette.bg }}>
      <svg
        viewBox="0 0 160 140"
        preserveAspectRatio="xMidYMid slice"
        className="size-full"
        dangerouslySetInnerHTML={{ __html: palette.shapes }}
      />
    </div>
  );
}
