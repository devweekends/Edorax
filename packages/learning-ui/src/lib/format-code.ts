import type { Plugin } from "prettier";

export type FormatCodeResult =
  | { ok: true; code: string; cursorOffset?: number; changed: boolean }
  | { ok: false; error: string };

const FORMATTABLE_LANGUAGES = new Set([
  "javascript",
  "js",
  "jsx",
  "typescript",
  "ts",
  "tsx",
  "json",
]);

/** Returns true when client-side Prettier formatting is configured for the given language. */
export function canFormatLanguage(language: string | undefined): boolean {
  if (!language) return false;
  return FORMATTABLE_LANGUAGES.has(language.trim().toLowerCase());
}

function unwrap<T>(mod: T | { default: T }): T {
  return mod && typeof mod === "object" && "default" in mod ? mod.default : mod;
}

function parserFor(language: string): "babel" | "typescript" | "json" {
  if (language === "json") return "json";
  if (language === "typescript" || language === "ts" || language === "tsx") return "typescript";
  return "babel";
}

function firstErrorLine(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  const line = raw
    .split(/\r?\n/)
    .find((entry) => entry.trim().length > 0)
    ?.trim();
  return line || "Check code syntax and try again.";
}

/**
 * Formats source code on demand using lazy-loaded standalone Prettier.
 * Never throws: returns either the formatted source or a single-line syntax error.
 */
export async function formatCode(
  source: string,
  options?: { language?: string; cursorOffset?: number }
): Promise<FormatCodeResult> {
  const language = (options?.language ?? "javascript").trim().toLowerCase();
  if (!canFormatLanguage(language)) {
    return {
      ok: false,
      error: `Formatting is not supported for ${language || "this language"}.`,
    };
  }

  const parser = parserFor(language);

  try {
    const [prettierMod, estreeMod, langPlugin] = await Promise.all([
      import("prettier/standalone"),
      import("prettier/plugins/estree"),
      parser === "typescript"
        ? import("prettier/plugins/typescript").then((m) => unwrap(m) as unknown as Plugin)
        : import("prettier/plugins/babel").then((m) => unwrap(m) as unknown as Plugin),
    ]);

    const prettier = unwrap(prettierMod);
    const plugins: Plugin[] = [
      langPlugin,
      unwrap(estreeMod) as unknown as Plugin,
    ];

    const sharedOptions = {
      parser,
      plugins,
      tabWidth: 2,
      useTabs: false,
      semi: true,
      singleQuote: false,
      trailingComma: "es5" as const,
      printWidth: 80,
    };

    if (typeof options?.cursorOffset === "number") {
      const clampedInput = Math.max(0, Math.min(options.cursorOffset, source.length));
      const res = await prettier.formatWithCursor(source, {
        ...sharedOptions,
        cursorOffset: clampedInput,
      });
      const code = res.formatted.endsWith("\n") ? res.formatted.slice(0, -1) : res.formatted;
      const cursorOffset = Math.max(0, Math.min(res.cursorOffset, code.length));
      return {
        ok: true,
        code,
        cursorOffset,
        changed: code !== source,
      };
    }

    const formatted = await prettier.format(source, sharedOptions);
    const code = formatted.endsWith("\n") ? formatted.slice(0, -1) : formatted;
    return {
      ok: true,
      code,
      changed: code !== source,
    };
  } catch (err) {
    return {
      ok: false,
      error: firstErrorLine(err),
    };
  }
}
