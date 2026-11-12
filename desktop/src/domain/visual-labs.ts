import { labRegistry } from '@buildment/learning-ui/labs/registry';

// Visual lab topics, the same groups the web Labs page uses.
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

export type VisualLabSummary = { slug: string; title: string; purpose: string };

/** Every registered visual lab, grouped by topic. Groups with no labs are left out. */
export function visualLabGroups() {
  const all: VisualLabSummary[] = Object.keys(labRegistry).map((slug) => ({
    slug,
    title: labRegistry[slug].title,
    purpose: labRegistry[slug].purpose,
  }));
  return VISUAL_LAB_GROUPS.map((group) => ({ ...group, labs: all.filter((lab) => group.prefix(lab.slug)) })).filter(
    (group) => group.labs.length > 0,
  );
}
