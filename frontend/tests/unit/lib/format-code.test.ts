import { describe, expect, it } from "vitest";
import { canFormatLanguage, formatCode } from "@buildment/learning-ui/lib/format-code";

describe("canFormatLanguage", () => {
  it("supports JavaScript, TypeScript, and JSON aliases case-insensitively", () => {
    expect(canFormatLanguage("javascript")).toBe(true);
    expect(canFormatLanguage("JS")).toBe(true);
    expect(canFormatLanguage("TypeScript")).toBe(true);
    expect(canFormatLanguage("json")).toBe(true);
    expect(canFormatLanguage("python")).toBe(false);
    expect(canFormatLanguage(undefined)).toBe(false);
  });
});

describe("formatCode", () => {
  it("formats JavaScript cleanly with 2-space indent and no trailing blank line", async () => {
    const res = await formatCode("const a=1;function add(x,y){return x+y}");
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.changed).toBe(true);
    expect(res.code).toBe("const a = 1;\nfunction add(x, y) {\n  return x + y;\n}");
    expect(res.code.endsWith("\n")).toBe(false);
  });

  it("reports changed: false when already formatted", async () => {
    const clean = "const x = 1;";
    const res = await formatCode(clean, { language: "javascript" });
    expect(res).toEqual({ ok: true, code: clean, changed: false });
  });

  it("returns an updated cursor offset when requested", async () => {
    const res = await formatCode("const a=1;const b=2;", { language: "javascript", cursorOffset: 10 });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(typeof res.cursorOffset).toBe("number");
    expect(res.cursorOffset).toBeGreaterThanOrEqual(0);
    expect(res.cursorOffset).toBeLessThanOrEqual(res.code.length);
  });

  it("formats TypeScript and JSON", async () => {
    const tsRes = await formatCode("type User={id:number;name:string}", { language: "typescript" });
    expect(tsRes.ok).toBe(true);
    if (tsRes.ok) {
      expect(tsRes.code).toBe("type User = { id: number; name: string };");
    }

    const jsonRes = await formatCode('{"a":1,"b":[2,3]}', { language: "json" });
    expect(jsonRes.ok).toBe(true);
    if (jsonRes.ok) {
      expect(jsonRes.code).toBe('{ "a": 1, "b": [2, 3] }');
    }
  });

  it("returns a concise single-line error on syntax errors without throwing", async () => {
    const res = await formatCode("function broken( { return 1; }");
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.length).toBeGreaterThan(0);
    expect(res.error.includes("\n")).toBe(false);
  });

  it("rejects unsupported languages cleanly", async () => {
    const res = await formatCode("print('hi')", { language: "python" });
    expect(res.ok).toBe(false);
  });
});
