import { Blocks, Boxes, Cloud, Container, Layers, Lightbulb, Network, ServerCog, Terminal, type LucideIcon } from "lucide-react";

// How each lab topic looks in the Labs catalogue: its icon and its colour. A topic keeps the same
// icon and colour on every card, tile and heading, so a learner can find it again at a glance.

export interface LabTopicStyle {
  icon: LucideIcon;
  /** Background and text colour of the icon badge, in light and dark. */
  tone: string;
}

const STYLES: Record<string, LabTopicStyle> = {
  // Shell lab topics
  linux: { icon: Terminal, tone: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200" },
  docker: { icon: Container, tone: "bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-200" },
  kubernetes: { icon: Boxes, tone: "bg-indigo-100 text-indigo-900 dark:bg-indigo-950 dark:text-indigo-200" },
  ansible: { icon: ServerCog, tone: "bg-rose-100 text-rose-900 dark:bg-rose-950 dark:text-rose-200" },
  terraform: { icon: Layers, tone: "bg-violet-100 text-violet-900 dark:bg-violet-950 dark:text-violet-200" },
  // Visual lab groups
  "system-design-challenges": { icon: Blocks, tone: "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200" },
  "system-design-ideas": { icon: Lightbulb, tone: "bg-teal-100 text-teal-900 dark:bg-teal-950 dark:text-teal-200" },
  "cloud-devops": { icon: Cloud, tone: "bg-cyan-100 text-cyan-900 dark:bg-cyan-950 dark:text-cyan-200" },
  networking: { icon: Network, tone: "bg-orange-100 text-orange-900 dark:bg-orange-950 dark:text-orange-200" },
};

const FALLBACK: LabTopicStyle = { icon: Terminal, tone: "bg-secondary text-primary" };

export function labTopicStyle(id: string): LabTopicStyle {
  return STYLES[id] ?? FALLBACK;
}
