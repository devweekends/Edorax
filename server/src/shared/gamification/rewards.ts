// The rewards marketplace catalog, bought with Build Credits.
//
// Two kinds of item share the credits spend:
//   - "cosmetic" (kind: cosmetic): a mascot accessory/theme unlocked once and shown on Dot. Owned is
//     a boolean (`UnlockedCosmetic`), equippable via `activeCosmetic`.
//   - "consumable" (kind: consumable): a one-shot utility held in a quantity (`RewardInventory`) and
//     used up (`Use` / auto-consumed). Consumables never grant permanent XP or the career ladder;
//     an XP boost is temporary, a league shield only holds a weekly tier.
//
// Purchases spend Build Credits and never touch XP or the career ladder.

export const REWARDS = [
  { id: "sparkle-trail", label: "Sparkle trail", price: 50, kind: "cosmetic", visual: "sparkle" },
  { id: "shades", label: "Shades", price: 90, kind: "cosmetic", visual: "shades" },
  { id: "oops-reaction", label: "Oops reaction", price: 120, kind: "cosmetic", visual: "oops" },
  { id: "cozy-scarf", label: "Cozy scarf", price: 150, kind: "cosmetic", visual: "scarf" },
  { id: "royal-crown", label: "Royal crown", price: 170, kind: "cosmetic", visual: "crown" },
  { id: "focus-buddy", label: "Focus buddy", price: 170, kind: "cosmetic", visual: "focus" },
  { id: "victory-dance", label: "Victory dance", price: 200, kind: "cosmetic", visual: "victory" },
  { id: "night-coder", label: "Night coder", price: 240, kind: "cosmetic", visual: "night" },
  { id: "confetti-carpet", label: "Confetti carpet", price: 260, kind: "cosmetic", visual: "confetti" },
  { id: "aurora-aura", label: "Aurora aura", price: 300, kind: "cosmetic", visual: "aurora" },
  { id: "graduation-cap", label: "Graduation cap", price: 340, kind: "cosmetic", visual: "grad" },
  { id: "wizard-hat", label: "Wizard hat", price: 380, kind: "cosmetic", visual: "wizard" },
  { id: "league-shield", label: "League shield", price: 300, kind: "consumable", effect: "shield" },
  { id: "xp-boost", label: "×2 XP boost (session)", price: 220, kind: "consumable", effect: "xp_boost", durationMs: 15 * 60 * 1000 },
  { id: "xp-boost-long", label: "×2 XP boost (hour)", price: 400, kind: "consumable", effect: "xp_boost", durationMs: 60 * 60 * 1000 },
] as const;

export type RewardId = (typeof REWARDS)[number]["id"];
export type RewardKind = (typeof REWARDS)[number]["kind"];
export type RewardVisual = Extract<(typeof REWARDS)[number], { kind: "cosmetic" }>["visual"];
export type RewardEffect = Extract<(typeof REWARDS)[number], { kind: "consumable" }>["effect"];

export const REWARD_BY_ID = new Map<RewardId, (typeof REWARDS)[number]>(REWARDS.map((reward) => [reward.id, reward]));

// The consumable reward ids we special-case in the shop and the mechanics that consume them.
export const XP_BOOST_REWARD = "xp-boost";
export const XP_BOOST_DURATION_MS = 15 * 60 * 1000; // default session: 15 minutes
export const LEAGUE_SHIELD_REWARD = "league-shield";