import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { FEEDBACK_AUDIO, isSoundEnabled, playFeedback } from "../../../src/lib/sound-feedback";

describe("sound-feedback", () => {
  beforeEach(() => {
    vi.stubGlobal("window", {
      matchMedia: () => ({ matches: false }),
      AudioContext: undefined,
      webkitAudioContext: undefined,
    });
    vi.stubGlobal("localStorage", {
      getItem: () => null,
      setItem: () => {},
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("maps every feedback kind to a replaceable path", () => {
    const kinds = [
      "tick",
      "check",
      "submit",
      "notification",
      "success",
      "celebration",
      "completion",
      "error",
    ] as const;
    for (const kind of kinds) {
      expect(FEEDBACK_AUDIO[kind]).toMatch(/^\/sounds\/.+\.(mp3|ogg|wav)$/);
    }
  });

  it("dedupes identical feedback within a short window", () => {
    const play = vi.fn().mockResolvedValue(undefined);
    const Audio = vi.fn(function () {
      return { volume: 1, play };
    });
    vi.stubGlobal("Audio", Audio);

    let now = 1_000;
    vi.spyOn(Date, "now").mockImplementation(() => now);

    playFeedback("tick");
    playFeedback("tick");
    expect(Audio).toHaveBeenCalledTimes(1);

    now += 200;
    playFeedback("tick");
    expect(Audio).toHaveBeenCalledTimes(2);
  });

  it("keeps sound on when the device asks for reduced motion", () => {
    vi.stubGlobal("window", { matchMedia: () => ({ matches: true }), AudioContext: undefined, webkitAudioContext: undefined });
    expect(isSoundEnabled()).toBe(true);
  });
});
