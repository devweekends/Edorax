import { describe, expect, it } from "vitest";
import { runsInBrowser, toPublicShellLab } from "../../src/services/shell-labs-public.js";

describe("toPublicShellLab", () => {
  const lab = {
    slug: "demo-linux",
    topic: "linux",
    level: "beginner",
    title: "Demo Linux",
    summary: "Folders and files.",
    scenario: "Tidy the reports folder.",
    minutes: 10,
    tags: ["Demo", 3, "Files"],
    machine: { name: "demobox", image: "ubuntu:24.04" },
    steps: [
      {
        id: "make-folder",
        goal: "Create the reports folder",
        body: "1. Go to /srv/demo.",
        hints: ["a", "b", "c"],
        checks: [{ id: "c1", label: "Folder exists", run: "test -d /srv/demo/reports", fail: "No folder." }],
        solution: "mkdir -p /srv/demo/reports",
      },
      { id: "", goal: "dropped: no id" },
    ],
  };

  it("keeps the catalogue fields and the goal of each step", () => {
    expect(toPublicShellLab(lab)).toEqual({
      slug: "demo-linux",
      topic: "linux",
      level: "beginner",
      title: "Demo Linux",
      summary: "Folders and files.",
      minutes: 10,
      scenario: "Tidy the reports folder.",
      tags: ["Demo", "Files"],
      steps: [{ id: "make-folder", goal: "Create the reports folder" }],
      browser: true,
    });
  });

  it("never carries checks, hints, solutions or the machine", () => {
    const text = JSON.stringify(toPublicShellLab(lab));
    for (const secret of ["checks", "hints", "solution", "mkdir", "test -d", "machine", "ubuntu"]) expect(text).not.toContain(secret);
  });

  it("copes with a lab that has no steps", () => {
    expect(toPublicShellLab({ slug: "x" })).toMatchObject({ slug: "x", minutes: 0, scenario: null, tags: [], steps: [], browser: false });
  });
});

describe("runsInBrowser", () => {
  const linux = (machine: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({ topic: "linux", machine: { name: "box", image: "ubuntu:24.04", ...machine }, ...extra });

  it("takes a one-machine Linux lab whose packages are in the browser image", () => {
    expect(runsInBrowser(linux({}))).toBe(true);
    expect(runsInBrowser(linux({ packages: ["cron", "nano"] }))).toBe(true);
  });

  it("leaves out what a browser tab cannot run", () => {
    expect(runsInBrowser(linux({ vm: true }))).toBe(false);
    expect(runsInBrowser(linux({ build: "curl -O https://example.com/x" }))).toBe(false);
    expect(runsInBrowser(linux({ packages: ["iptables"] }))).toBe(false);
    expect(runsInBrowser(linux({ image: "rockylinux:9.3" }))).toBe(false);
    expect(runsInBrowser(linux({}, { machines: [{ name: "web1", image: "ubuntu:24.04" }] }))).toBe(false);
    expect(runsInBrowser({ ...linux({}), topic: "kubernetes" })).toBe(false);
    expect(runsInBrowser({ topic: "linux" })).toBe(false);
  });

  it("lets the lab file decide", () => {
    expect(runsInBrowser(linux({}, { browser: false }))).toBe(false);
    expect(runsInBrowser({ ...linux({}), topic: "kubernetes", browser: true })).toBe(true);
  });
});
