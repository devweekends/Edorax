import { shellTopicLabel, type PublicShellLab } from "@/lib/shell-labs";
import type { visualLabGroups } from "@/lib/visual-labs";

// A collection is every lab of one topic on its own page: /labs/linux, /labs/docker,
// /labs/networking and so on. The Labs overview (/labs) lists the collections.

export interface LabCollection {
  /** The last part of the address: /labs/<id>. */
  id: string;
  kind: "shell" | "visual";
  name: string;
  /** One sentence about what the labs practise. */
  intro: string;
  count: number;
  href: string;
}

/** Addresses under /labs that are pages of their own, so no collection may use them. */
const RESERVED = new Set(["visual", "guided", "shell"]);

const SHELL_ORDER = ["linux", "docker", "kubernetes", "ansible", "terraform"];
const SHELL_INTRO: Record<string, string> = {
  linux: "Files, users, permissions, processes and networking on a real Linux machine.",
  docker: "Images, containers, networks and volumes on a real Docker engine.",
  kubernetes: "Deployments, services, configuration and fixing a broken cluster.",
  ansible: "Playbooks, inventories and roles against real servers.",
  terraform: "Plans, state and modules.",
};

/** The shell collections, in a fixed order, from the labs the API sent. */
export function shellCollections(labs: PublicShellLab[]): LabCollection[] {
  const topics = [...new Set(labs.map((lab) => lab.topic))].filter((topic) => !RESERVED.has(topic));
  topics.sort((a, b) => {
    const [x, y] = [SHELL_ORDER.indexOf(a), SHELL_ORDER.indexOf(b)];
    return (x < 0 ? 99 : x) - (y < 0 ? 99 : y);
  });
  return topics.map((topic) => ({
    id: topic,
    kind: "shell",
    name: shellTopicLabel(topic),
    intro: SHELL_INTRO[topic] ?? "Hands-on labs on a real machine.",
    count: labs.filter((lab) => lab.topic === topic).length,
    href: `/labs/${topic}`,
  }));
}

/** The visual collections: the groups of the visual lab registry. */
export function visualCollections(groups: ReturnType<typeof visualLabGroups>): LabCollection[] {
  return groups
    .filter((group) => !RESERVED.has(group.id))
    .map((group) => ({ id: group.id, kind: "visual", name: group.title, intro: group.description, count: group.labs.length, href: `/labs/${group.id}` }));
}
