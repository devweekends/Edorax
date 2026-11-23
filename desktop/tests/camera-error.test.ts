import assert from "node:assert/strict";
import { test } from "node:test";
import { describeCameraError } from "../src/ui/learning/quiz/secure/camera-error";

function domError(name: string) {
  const error = new Error("x");
  error.name = name;
  return error;
}

test("a blocked camera points the learner to their privacy settings", () => {
  for (const name of ["NotAllowedError", "SecurityError"])
    assert.match(describeCameraError(domError(name)), /privacy settings/);
});

test("a missing camera and a busy camera get different words", () => {
  assert.match(describeCameraError(domError("NotFoundError")), /No camera/);
  assert.match(describeCameraError(domError("OverconstrainedError")), /No camera/);
  assert.match(describeCameraError(domError("NotReadableError")), /Another app/);
});

test("anything else still gives a plain sentence", () => {
  assert.equal(describeCameraError(new Error("boom")), "The camera could not start.");
  assert.equal(describeCameraError("oops"), "The camera could not start.");
});
