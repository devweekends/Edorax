import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { base64, prepareScript, wrapped } from "@/lib/browser-lab/prepare";

describe("browser lab scripts", () => {
  it("runs a script exactly as written, whatever quotes it holds", () => {
    const script = `printf '%s|%s\\n' "it's" 'a "test" $HOME'; echo ünïcode`;
    expect(execFileSync("bash", ["-c", wrapped(script)], { encoding: "utf8" })).toBe(`it's|a "test" $HOME\nünïcode\n`);
  });

  it("encodes text outside ASCII", () => {
    expect(Buffer.from(base64("né ✓"), "base64").toString("utf8")).toBe("né ✓");
  });

  it("keeps only safe characters of the machine name", () => {
    expect(prepareScript("box1; rm -rf /")).toContain("hostname box1rm-rf\n");
    expect(prepareScript("!!")).toContain("hostname lab\n");
  });

  it("gives root the usual prompt", () => {
    expect(prepareScript("box1")).toContain(String.raw`"PS1='\u@\h:\w\\$ '"`);
  });
});
