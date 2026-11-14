// The learner areas of Edorax, in one place. The workspace nav, the area tabs, the
// /learn hub, each area's overview page and the landing page all read from here,
// so adding or renaming an area is one edit. The plan behind each area is in
// docs/16-learning-areas.mdx.

export type AreaStatus = "live" | "partly-live" | "coming-soon";

export type LearnAreaId = "courses" | "audiobooks" | "labs" | "practice" | "puzzles" | "voice";

export interface LearnArea {
  id: LearnAreaId;
  /** Full name, used as a page title. */
  name: string;
  /** Short name for tabs and bottom bars. */
  short: string;
  href: string;
  status: AreaStatus;
  /** One line under the name. */
  tagline: string;
  /** Two or three sentences on what it is. */
  summary: string;
  /** Paths that belong to this area, for highlighting the current tab. */
  matches: string[];
}

export const LEARN_AREAS: readonly LearnArea[] = [
  {
    id: "courses",
    name: "Courses",
    short: "Courses",
    href: "/catalog",
    status: "live",
    tagline: "Read it, play with it, listen to it, prove it. Videos are next.",
    summary:
      "Full courses in tech and human skills. Every chapter starts with a question, has diagrams you can play with, can be heard word by word, and ends with a short quiz that proves you got it. Short videos come next, for the ideas that are easier to see.",
    matches: ["/catalog", "/my-courses", "/courses"],
  },
  {
    id: "audiobooks",
    name: "Audiobooks",
    short: "Audiobooks",
    href: "/audiobooks",
    status: "live",
    tagline: "Every narrated course as an audiobook. Learn on a walk, a drive or a run.",
    summary:
      "A shelf of books made from the narrated courses. Chapters play one after another, the player stays with you from page to page, and every book remembers where you stopped. Skip back 15 seconds, set a sleep timer, listen at up to 2x.",
    matches: ["/audiobooks"],
  },
  {
    id: "labs",
    name: "Labs",
    short: "Labs",
    href: "/labs",
    status: "partly-live",
    tagline: "Build it, break it, and see the result.",
    summary:
      "Hands-on practice in three kinds. Visual labs and guided labs are open today: move parts and watch every check pass or fail, or build a real project step by step and have it checked. Shell labs come next.",
    matches: ["/labs"],
  },
  {
    id: "practice",
    name: "Bite-sized practice",
    short: "Practice",
    href: "/practice",
    status: "coming-soon",
    tagline: "One topic, five minutes a day. A question first, then the idea behind it.",
    summary:
      "Master one topic, such as System Design, in short daily sessions: today's question, quick quizzes, quick reads and a review queue. When you cannot answer, it helps you work the answer out.",
    matches: ["/practice"],
  },
  {
    id: "puzzles",
    name: "Puzzles",
    short: "Puzzles",
    href: "/puzzles",
    status: "coming-soon",
    tagline: "One new puzzle a day. Solve it, then climb the daily leaderboard.",
    summary:
      "Several kinds of daily puzzles that use what you learn. One a day, the same for everyone, so you can compete with everyone on today's leaderboard.",
    matches: ["/puzzles"],
  },
  {
    id: "voice",
    name: "On-call tutors",
    short: "Tutors",
    href: "/voice",
    status: "coming-soon",
    tagline: "Call, start talking, and ask about anything that feels hard.",
    summary:
      "A tutor for every topic, one call away. Say what you already know and start talking. Ask about anything that feels hard, as many times as you need; it explains in plain words and keeps track of where you are in the topic.",
    matches: ["/voice"],
  },
];

export function areaById(id: LearnAreaId): LearnArea {
  return LEARN_AREAS.find((area) => area.id === id)!;
}

/** The area a path belongs to, or null (dashboard, progress, settings). */
export function areaForPath(pathname: string): LearnArea | null {
  return LEARN_AREAS.find((area) => area.matches.some((m) => pathname === m || pathname.startsWith(`${m}/`))) ?? null;
}

export const STATUS_LABEL: Record<AreaStatus, string> = {
  live: "Open now",
  "partly-live": "Partly open",
  "coming-soon": "Coming soon",
};

// ---- Labs ----------------------------------------------------------------------

export type LabKindId = "visual" | "guided" | "shell";

export interface LabKind {
  id: LabKindId;
  name: string;
  href: string;
  status: AreaStatus;
  tagline: string;
  summary: string;
}

export const LAB_KINDS: readonly LabKind[] = [
  {
    id: "visual",
    name: "Visual labs",
    href: "/labs?kind=visual",
    status: "live",
    tagline: "No code. Move parts, press Run, watch the checks.",
    summary:
      "Design a system on a board: add parts, link them and size them. Pick what to break, then press Run. Every test case passes or fails on screen, with the reason.",
  },
  {
    id: "guided",
    name: "Guided labs",
    href: "/labs/guided",
    status: "live",
    tagline: "Step by step, and every step is checked.",
    summary:
      "A real project split into small labs. Tests check each lab, a quiz follows it, and the capstone in your own GitHub repository is checked automatically. Finish a level and you get a certificate.",
  },
  {
    id: "shell",
    name: "Shell labs",
    href: "/labs/shell",
    status: "live",
    tagline: "Real machines and a real terminal.",
    summary:
      "46 hands-on labs on real Linux machines, containers and networks. Each lab gives you a task and checks the machine itself. Shell labs run in the free Edorax desktop app.",
  },
];

/** Visual labs grouped for the catalogue. Slugs come from the lab registry; `id` is the topic filter on /labs (?topic=). */
export const VISUAL_LAB_GROUPS: readonly { id: string; title: string; description: string; prefix: (slug: string) => boolean }[] = [
  {
    id: "system-design-challenges",
    title: "System Design challenges",
    description: "Design a real product from parts, then survive peak traffic and failures inside a budget.",
    prefix: (slug) => slug.startsWith("hld-visual-"),
  },
  {
    id: "cloud-devops",
    title: "Cloud and DevOps",
    description: "Docker Compose, Kubernetes, AWS and a single Linux host, on the same kind of board. They go with the Cloud and DevOps courses.",
    prefix: (slug) => ["docker-compose-stack", "k8s-web-app", "aws-web-tier", "linux-single-host"].includes(slug),
  },
  {
    id: "system-design-ideas",
    title: "System Design ideas",
    description: "Smaller boards for one idea at a time: where waiting explodes, three tiers, a cache.",
    prefix: (slug) => /^hld-m\d+-/.test(slug),
  },
  {
    id: "networking",
    title: "Networking",
    description: "Explore, plan, build and fix small networks. Every answer is checked.",
    prefix: (slug) => slug.startsWith("net-"),
  },
];
