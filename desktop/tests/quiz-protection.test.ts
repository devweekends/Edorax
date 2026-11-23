import assert from "node:assert/strict";
import test from "node:test";
import {
  INTEGRITY_NOTES_LINE,
  INTEGRITY_ONLINE_WINDOW_MS,
  INTEGRITY_QUIZ_RULES,
  INTEGRITY_SECURE_RULES,
  scoreIntegrityRisk,
} from "../../server/src/shared/api/integrity";

test("quiz rules and notice text are plain sentences without semicolons", () => {
  const text = [
    ...INTEGRITY_QUIZ_RULES,
    ...INTEGRITY_SECURE_RULES,
    INTEGRITY_NOTES_LINE,
  ];
  assert.ok(text.length >= 8);
  for (const line of text) assert.equal(line.includes(";"), false, line);
  assert.equal(INTEGRITY_NOTES_LINE, "Notes are viewed by your mentor.");
  assert.equal(
    text.join(" ").toLowerCase().includes("change your score"),
    false,
  );
});

test("online window is a few seconds, not minutes", () => {
  assert.ok(
    INTEGRITY_ONLINE_WINDOW_MS >= 10_000 &&
      INTEGRITY_ONLINE_WINDOW_MS <= 60_000,
  );
});

test("copy and screenshot attempts raise the review priority", () => {
  const quiet = scoreIntegrityRisk({});
  const noisy = scoreIntegrityRisk({
    COPY_BLOCKED: 3,
    SCREENSHOT_KEY: 2,
    WINDOW_BLUR: 4,
  });
  assert.ok(noisy.score > quiet.score);
  assert.ok(noisy.reasons.some((reason) => reason.type === "SCREENSHOT_KEY"));
});
