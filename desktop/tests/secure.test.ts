import assert from "node:assert/strict";
import test from "node:test";
import {
  evaluateSecurePrecheck,
  matchBlockedApps,
  scoreIntegrityRisk,
  SECURE_BLOCKED_APPS,
  type SecurePrecheckReport,
} from "../../server/src/shared/api/integrity";
import { parseExamLink } from "../src/secure/exam-link";
import { parsePsOutput, parseTasklist } from "../src/secure/process-scan";
import { isBlockedShortcut } from "../src/secure/shortcuts";
import { looksVirtual } from "../src/secure/system-check";
import { FaceWatch } from "../src/ui/learning/quiz/secure/face-watch";
import { TypingWatch } from "../src/ui/learning/quiz/secure/typing-watch";

const token = "A".repeat(43);
const clean: SecurePrecheckReport = {
  platform: "win32",
  appVersion: "1.0.0",
  apps: [],
  displayCount: 1,
  virtualMachine: false,
  camera: "OK",
  checkedAt: new Date().toISOString(),
};

test("exam links are parsed strictly", () => {
  const ok = parseExamLink(
    `edorax://exam/abc123?token=${token}&course=intro&chapter=final-quiz`,
  );
  assert.deepEqual(ok, {
    chapterId: "abc123",
    token,
    courseSlug: "intro",
    chapterSlug: "final-quiz",
  });
  assert.equal(parseExamLink(`https://exam/abc123?token=${token}`), null);
  assert.equal(parseExamLink(`edorax://exam/abc123?token=short`), null);
  assert.equal(parseExamLink(`edorax://other/abc123?token=${token}`), null);
  assert.equal(parseExamLink(`edorax://exam/a b?token=${token}`), null);
  assert.equal(
    parseExamLink(`edorax://exam/abc?token=${token}&course=../x`)?.courseSlug,
    null,
  );
});

test("restricted apps match by normalized process name", () => {
  const found = matchBlockedApps(
    ["explorer.exe", "AnyDesk.exe", "zoom.us", "Claude"],
    SECURE_BLOCKED_APPS,
  );
  assert.deepEqual(found.map((app) => app.id).sort(), [
    "anydesk",
    "claude",
    "zoom",
  ]);
  assert.deepEqual(
    matchBlockedApps(["chrome.exe", "Code"], SECURE_BLOCKED_APPS),
    [],
  );
});

test("pre-check blocks, warns and clears", () => {
  assert.equal(evaluateSecurePrecheck(clean, { requireCamera: true }).ok, true);
  const zoom = matchBlockedApps(["zoom"], SECURE_BLOCKED_APPS);
  const warned = evaluateSecurePrecheck(
    { ...clean, apps: zoom },
    { requireCamera: false },
  );
  assert.equal(warned.ok, true);
  assert.equal(warned.warnings.length, 1);
  const obs = matchBlockedApps(["obs64.exe"], SECURE_BLOCKED_APPS);
  const bad = evaluateSecurePrecheck(
    {
      ...clean,
      apps: obs,
      displayCount: 2,
      virtualMachine: true,
      camera: "DENIED",
    },
    { requireCamera: true },
  );
  assert.equal(bad.ok, false);
  assert.equal(bad.blockers.length, 4);
  assert.equal(
    evaluateSecurePrecheck(
      { ...clean, camera: "MISSING" },
      { requireCamera: false },
    ).ok,
    true,
  );
});

test("process list parsers", () => {
  assert.deepEqual(
    parseTasklist(
      '"System","4","Services","0","1,000 K"\r\n"obs64.exe","12","Console","1","9 K"\r\n',
    ),
    ["System", "obs64.exe"],
  );
  assert.deepEqual(parsePsOutput("launchd\n  Finder \n\n"), [
    "launchd",
    "Finder",
  ]);
});

test("virtual machine strings", () => {
  assert.equal(looksVirtual("VMware, Inc.", "VMware7,1"), true);
  assert.equal(looksVirtual("Microsoft Corporation", "Virtual Machine"), true);
  assert.equal(looksVirtual("innotek GmbH", "VirtualBox"), true);
  assert.equal(looksVirtual("Dell Inc.", "XPS 15 9520"), false);
  assert.equal(looksVirtual("Microsoft Corporation", "Surface Pro 9"), false);
  assert.equal(looksVirtual(undefined, ""), false);
});

test("shortcuts: devtools and print blocked, copy and paste left to the quiz hook", () => {
  const key = (
    k: string,
    mods: Partial<{
      control: boolean;
      meta: boolean;
      shift: boolean;
      alt: boolean;
    }> = {},
  ) =>
    isBlockedShortcut({
      key: k,
      control: false,
      meta: false,
      shift: false,
      alt: false,
      ...mods,
    });
  assert.equal(key("F12"), true);
  assert.equal(key("I", { control: true, shift: true }), true);
  assert.equal(key("i", { meta: true, alt: true }), true);
  assert.equal(key("p", { control: true }), true);
  assert.equal(key("c", { control: true }), false);
  assert.equal(key("v", { meta: true }), false);
  assert.equal(key("a"), false);
});

test("typing watch flags chunks and impossible speed, once per cooldown", () => {
  const chunk = new TypingWatch();
  assert.equal(chunk.feed(1, 0), null);
  assert.equal(chunk.feed(120, 500)?.reason, "chunk");
  assert.equal(chunk.feed(120, 900), null);

  const fast = new TypingWatch();
  let finding = null;
  for (let t = 0; t < 3000 && !finding; t += 100) finding = fast.feed(6, t); // 60 chars/s
  assert.equal(finding?.reason, "speed");

  const human = new TypingWatch();
  for (let t = 0; t < 30_000; t += 200) assert.equal(human.feed(1, t), null); // 5 chars/s
});

test("face watch reports each episode once", () => {
  const watch = new FaceWatch();
  const results = [1, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0].map((n) =>
    watch.feed(n),
  );
  assert.deepEqual(results.filter(Boolean), ["FACE_MISSING", "FACE_MISSING"]);
  const crowd = new FaceWatch();
  assert.deepEqual(
    [2, 2, 2, 1, 2, 2].map((n) => crowd.feed(n)).filter(Boolean),
    ["FACE_MULTIPLE", "FACE_MULTIPLE"],
  );
});

test("risk score orders attempts and caps each signal", () => {
  assert.deepEqual(scoreIntegrityRisk({}), {
    score: 0,
    level: "LOW",
    reasons: [],
  });
  const noisy = scoreIntegrityRisk({ WINDOW_BLUR: 100 });
  assert.equal(noisy.score, 15);
  assert.equal(noisy.level, "LOW");
  const heavy = scoreIntegrityRisk({
    BLOCKED_APP: 2,
    SECOND_SCREEN: 1,
    HEARTBEAT_GAP: 3,
    TYPING_BURST: 3,
  });
  assert.equal(heavy.level, "HIGH");
  assert.ok(heavy.score <= 100);
  assert.equal(scoreIntegrityRisk({ CAMERA_OFF: 9, CAMERA_ON: 9 }).score, 0);
});
