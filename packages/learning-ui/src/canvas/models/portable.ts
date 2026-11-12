// Schemas and pure helpers for the portable ```canvas and ```lab fences.
// Every wrapper uses .passthrough() (the Tolerant Reader pattern) so future
// layout, spacing, or metadata properties do not break older desktop or web builds.
import { z } from "zod";
import type { SliderInput, SliderResult, SliderSpec, SliderValues } from "../renderers/slider/types";
import type { Tone } from "../primitives/tones";

export const MAX_PORTABLE_VERSION = 1;

export const PORTABLE_CANVAS_RENDERERS = [
  "net-step",
  "replay",
  "sequence",
  "state-machine",
  "factor",
  "scene",
  "slider",
  "diagram",
  "addr",
  "packet",
  "sorter",
  "block-map",
  "context-picker",
  "flip-deck",
  "commit-story",
  "phrase-fixer",
  "budget-stack",
  "slot-card",
] as const;

export type PortableCanvasRenderer = (typeof PORTABLE_CANVAS_RENDERERS)[number];

export function isPortableCanvasRenderer(value: unknown): value is PortableCanvasRenderer {
  return typeof value === "string" && (PORTABLE_CANVAS_RENDERERS as readonly string[]).includes(value);
}

/** Optional presentation & layout extensibility bag. Extra keys are tolerated. */
export const presentationSchema = z
  .object({
    spacing: z.enum(["compact", "normal", "loose"]).optional(),
    minHeight: z.number().int().min(80).max(2400).optional(),
    maxWidth: z.number().int().min(240).max(2400).optional(),
    theme: z.enum(["default", "terminal", "muted"]).optional(),
    padding: z.tuple([z.number().min(0).max(120), z.number().min(0).max(120)]).optional(),
  })
  .passthrough();

export type PresentationOptions = z.infer<typeof presentationSchema>;

const text = z.string().min(1);
const toneEnum = z.enum(["accent", "good", "warn", "bad"]);
const actorKindEnum = z.enum([
  "user",
  "phone",
  "server",
  "database",
  "router",
  "cache",
  "queue",
  "cdn",
  "clock",
  "worker",
  "note",
]);

// ------------------------------------------------------------------ 1. replay
export const replayDataSchema = z
  .object({
    title: z.string().optional(),
    purpose: z.string().optional(),
    limits: z.string().optional(),
    steps: z
      .array(
        z
          .object({
            runsOn: z.enum(["lab", "computer"]),
            command: text,
            output: z.string(),
            note: z.string(),
            predict: z
              .object({
                question: text,
                options: z.tuple([text, text, text]),
                correct: z.union([z.literal(0), z.literal(1), z.literal(2)]),
              })
              .passthrough()
              .optional(),
          })
          .passthrough(),
      )
      .min(1)
      .max(40),
  })
  .passthrough();

// ---------------------------------------------------------------- 2. sequence
export const sequenceDataSchema = z
  .object({
    title: text,
    purpose: text,
    summary: text,
    limits: text,
    actors: z
      .array(z.object({ name: text, sub: z.string().optional() }).passthrough())
      .min(2)
      .max(6),
    steps: z
      .array(
        z
          .object({
            from: z.number().int().min(0),
            to: z.number().int().min(0),
            label: text,
            title: text,
            note: text,
            chips: z.array(z.string()).optional(),
            tone: toneEnum.optional(),
            outcome: z.string().optional(),
          })
          .passthrough(),
      )
      .min(1)
      .max(40),
    tryThis: z.array(z.string()).optional(),
  })
  .passthrough()
  .superRefine((spec, ctx) => {
    spec.steps.forEach((step, i) => {
      for (const key of ["from", "to"] as const) {
        if (step[key] >= spec.actors.length) {
          ctx.addIssue({ code: "custom", path: ["steps", i, key], message: "no such actor" });
        }
      }
    });
  });

// ----------------------------------------------------------- 3. state-machine
export const stateMachineDataSchema = z
  .object({
    title: text,
    purpose: text,
    summary: text,
    limits: text,
    states: z
      .array(
        z
          .object({
            id: text,
            name: text,
            sub: z.string().optional(),
            col: z.number().int().min(0).max(5),
            row: z.number().int().min(0).max(5),
          })
          .passthrough(),
      )
      .min(2)
      .max(12),
    edges: z
      .array(
        z
          .object({
            from: text,
            to: text,
            label: text,
            kind: z.enum(["transition", "rejected"]).optional(),
          })
          .passthrough(),
      )
      .min(1)
      .max(24),
    steps: z
      .array(
        z
          .object({
            state: text,
            edge: z.number().int().min(0).optional(),
            title: text,
            note: text,
            chips: z.array(z.string()).optional(),
            tone: toneEnum.optional(),
            outcome: z.string().optional(),
          })
          .passthrough(),
      )
      .min(1)
      .max(40),
    tryThis: z.array(z.string()).optional(),
  })
  .passthrough()
  .superRefine((spec, ctx) => {
    const stateIds = new Set(spec.states.map((s) => s.id));
    spec.edges.forEach((edge, i) => {
      if (!stateIds.has(edge.from)) ctx.addIssue({ code: "custom", path: ["edges", i, "from"], message: `unknown state "${edge.from}"` });
      if (!stateIds.has(edge.to)) ctx.addIssue({ code: "custom", path: ["edges", i, "to"], message: `unknown state "${edge.to}"` });
    });
    spec.steps.forEach((step, i) => {
      if (!stateIds.has(step.state)) ctx.addIssue({ code: "custom", path: ["steps", i, "state"], message: `unknown state "${step.state}"` });
      if (step.edge !== undefined && step.edge >= spec.edges.length) {
        ctx.addIssue({ code: "custom", path: ["steps", i, "edge"], message: "edge index out of range" });
      }
    });
  });

// ------------------------------------------------------------------ 4. factor
export const factorDataSchema = z
  .object({
    title: text,
    purpose: text,
    whatThisShows: text,
    options: z.array(z.object({ id: text, name: text }).passthrough()).min(2).max(5),
    criteria: z
      .array(
        z
          .object({
            id: text,
            name: text,
            weight: z.number(),
            scores: z.record(z.string(), z.number()),
          })
          .passthrough(),
      )
      .min(1)
      .max(10),
    weightLevels: z.array(z.object({ value: z.number(), label: text }).passthrough()).min(2).max(6),
    scoreScale: z.object({ min: z.number(), max: z.number() }).passthrough(),
    unit: text,
    tryThis: z.array(z.string()).default([]),
    limits: text,
  })
  .passthrough();

// ------------------------------------------------------------------- 5. scene
const sceneEventSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("fly"), at: z.number(), dur: z.number(), from: text, to: text, label: text, tone: toneEnum.optional() }).passthrough(),
  z.object({ kind: z.literal("say"), at: z.number(), actor: text, text: z.string(), tone: toneEnum.optional() }).passthrough(),
  z.object({ kind: z.literal("mark"), at: z.number(), actor: text, tone: toneEnum }).passthrough(),
  z.object({ kind: z.literal("tag"), at: z.number(), row: z.union([z.literal(0), z.literal(1)]), value: z.number(), label: text, tone: toneEnum.optional() }).passthrough(),
  z.object({ kind: z.literal("retone"), at: z.number(), label: text, tone: toneEnum }).passthrough(),
  z.object({ kind: z.literal("line"), at: z.number(), value: z.number(), label: text }).passthrough(),
  z.object({ kind: z.literal("wait"), at: z.number(), dur: z.number(), actor: text, label: text, doneLabel: text, total: z.number().optional() }).passthrough(),
  z.object({ kind: z.literal("verdict"), at: z.number(), text: text, tone: toneEnum }).passthrough(),
]);

export const sceneDataSchema = z
  .object({
    title: text,
    purpose: text,
    limits: text,
    hint: z.string().optional(),
    scene: z
      .object({
        width: z.number().min(200).max(1200),
        height: z.number().min(100).max(1200),
        actors: z
          .array(
            z
              .object({
                id: text,
                label: text,
                kind: actorKindEnum.optional(),
                sub: z.string().optional(),
                x: z.number(),
                y: z.number(),
              })
              .passthrough(),
          )
          .min(1),
        strip: z
          .object({
            y: z.number(),
            from: z.number(),
            to: z.number(),
            unit: z.string(),
            caption: z.string(),
            every: z.number().positive(),
          })
          .passthrough()
          .optional(),
        events: z.array(sceneEventSchema),
        loop: z.number().positive(),
      })
      .passthrough(),
  })
  .passthrough();

// ----------------------------------------------------------------- 6. diagram
export const diagramDataSchema = z
  .object({
    diagram: z.enum(["flow", "sequence", "state", "layers", "timeline", "comparison", "tree", "architecture"]),
    source: text,
  })
  .passthrough();

// --------------------------------------------- 7. declarative slider & math
export const portableSliderDataSchema = z
  .object({
    title: text,
    purpose: text,
    intro: text,
    inputs: z
      .array(
        z
          .object({
            id: text,
            label: text,
            min: z.number(),
            max: z.number(),
            step: z.number().positive(),
            default: z.number(),
            unit: z.string().default(""),
          })
          .passthrough(),
      )
      .min(1)
      .max(6),
    formulas: z.record(z.string(), z.union([z.string(), z.number()])).default({}),
    stats: z
      .array(
        z
          .object({
            label: text,
            value: text,
            detail: z.string().optional(),
          })
          .passthrough(),
      )
      .min(1)
      .max(6),
    barsTitle: z.string().optional(),
    bars: z
      .array(
        z
          .object({
            label: text,
            /** Either a formula/input variable name or a numeric expression. */
            value: z.union([z.string(), z.number()]),
            display: text,
            /** Optional tone ("good", "warn", "bad", "accent") or expression like "{safe ? 'good' : 'bad'}". */
            tone: z.string().optional(),
          })
          .passthrough(),
      )
      .optional(),
    barMax: z.number().positive().optional(),
    summary: text,
    changeTemplate: z.string().optional(),
    tryThis: z.array(z.string()).default([]),
    limits: text,
  })
  .passthrough();

export type PortableSliderData = z.infer<typeof portableSliderDataSchema>;

// Safe, zero-eval recursive descent expression parser for declarative sliders.
// Supports numbers, identifiers, +, -, *, /, %, (), <, <=, >, >=, ==, !=, &&, ||, ? :,
// and math helpers: min, max, round, floor, ceil, abs, clamp.
type Token =
  | { kind: "num"; value: number }
  | { kind: "id"; value: string }
  | { kind: "op"; value: string };

function tokenizeExpr(expr: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < expr.length) {
    const ch = expr[i]!;
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    const two = expr.slice(i, i + 2);
    if (["<=", ">=", "==", "!=", "&&", "||"].includes(two)) {
      tokens.push({ kind: "op", value: two });
      i += 2;
      continue;
    }
    if ("+-*/%()?:,<>".includes(ch)) {
      tokens.push({ kind: "op", value: ch });
      i++;
      continue;
    }
    if (/[0-9.]/.test(ch)) {
      let numStr = "";
      while (i < expr.length && /[0-9._]/.test(expr[i]!)) {
        if (expr[i] !== "_") numStr += expr[i];
        i++;
      }
      const parsed = Number(numStr);
      tokens.push({ kind: "num", value: Number.isFinite(parsed) ? parsed : 0 });
      continue;
    }
    if (/[a-zA-Z_]/.test(ch)) {
      let id = "";
      while (i < expr.length && /[a-zA-Z0-9_]/.test(expr[i]!)) {
        id += expr[i];
        i++;
      }
      tokens.push({ kind: "id", value: id });
      continue;
    }
    i++;
  }
  return tokens;
}

export function evaluateFormula(expr: string | number, env: Record<string, number>): number {
  if (typeof expr === "number") return Number.isFinite(expr) ? expr : 0;
  const tokens = tokenizeExpr(expr);
  let pos = 0;

  const peek = () => tokens[pos];
  const consume = () => tokens[pos++];
  const matchOp = (op: string) => {
    if (peek()?.kind === "op" && peek()?.value === op) {
      pos++;
      return true;
    }
    return false;
  };

  function parseTernary(): number {
    const cond = parseOr();
    if (matchOp("?")) {
      const truthy = parseTernary();
      matchOp(":");
      const falsy = parseTernary();
      return cond !== 0 ? truthy : falsy;
    }
    return cond;
  }

  function parseOr(): number {
    let left = parseAnd();
    while (matchOp("||")) {
      const right = parseAnd();
      left = left !== 0 || right !== 0 ? 1 : 0;
    }
    return left;
  }

  function parseAnd(): number {
    let left = parseCompare();
    while (matchOp("&&")) {
      const right = parseCompare();
      left = left !== 0 && right !== 0 ? 1 : 0;
    }
    return left;
  }

  function parseCompare(): number {
    let left = parseAdd();
    while (true) {
      const tok = peek();
      if (tok?.kind === "op" && ["<", "<=", ">", ">=", "==", "!="].includes(tok.value)) {
        pos++;
        const right = parseAdd();
        if (tok.value === "<") left = left < right ? 1 : 0;
        else if (tok.value === "<=") left = left <= right ? 1 : 0;
        else if (tok.value === ">") left = left > right ? 1 : 0;
        else if (tok.value === ">=") left = left >= right ? 1 : 0;
        else if (tok.value === "==") left = Math.abs(left - right) < 1e-9 ? 1 : 0;
        else if (tok.value === "!=") left = Math.abs(left - right) >= 1e-9 ? 1 : 0;
      } else {
        break;
      }
    }
    return left;
  }

  function parseAdd(): number {
    let left = parseMul();
    while (true) {
      if (matchOp("+")) left += parseMul();
      else if (matchOp("-")) left -= parseMul();
      else break;
    }
    return left;
  }

  function parseMul(): number {
    let left = parseUnary();
    while (true) {
      if (matchOp("*")) left *= parseUnary();
      else if (matchOp("/")) {
        const denom = parseUnary();
        left = denom === 0 ? 0 : left / denom;
      } else if (matchOp("%")) {
        const denom = parseUnary();
        left = denom === 0 ? 0 : left % denom;
      } else break;
    }
    return left;
  }

  function parseUnary(): number {
    if (matchOp("-")) return -parseUnary();
    if (matchOp("+")) return parseUnary();
    return parsePrimary();
  }

  function parsePrimary(): number {
    if (matchOp("(")) {
      const val = parseTernary();
      matchOp(")");
      return val;
    }
    const tok = consume();
    if (!tok) return 0;
    if (tok.kind === "num") return tok.value;
    if (tok.kind === "id") {
      if (matchOp("(")) {
        const args: number[] = [];
        if (!matchOp(")")) {
          args.push(parseTernary());
          while (matchOp(",")) args.push(parseTernary());
          matchOp(")");
        }
        const fn = tok.value;
        if (fn === "min") return args.length ? Math.min(...args) : 0;
        if (fn === "max") return args.length ? Math.max(...args) : 0;
        if (fn === "round") return Math.round(args[0] ?? 0);
        if (fn === "floor") return Math.floor(args[0] ?? 0);
        if (fn === "ceil") return Math.ceil(args[0] ?? 0);
        if (fn === "abs") return Math.abs(args[0] ?? 0);
        if (fn === "clamp") return Math.min(args[2] ?? 100, Math.max(args[1] ?? 0, args[0] ?? 0));
        return 0;
      }
      return env[tok.value] ?? 0;
    }
    return 0;
  }

  const out = parseTernary();
  return Number.isFinite(out) ? out : 0;
}

/**
 * Interpolates `{expr}` or `{cond ? 'yes' : 'no'}` or `{var:comma}` using the computed environment.
 */
export function interpolateTemplate(template: string, env: Record<string, number>): string {
  return template.replace(/\{([^{}]+)\}/g, (_match, rawInner: string) => {
    const inner = rawInner.trim();
    // Check for string ternary: cond ? 'a' : 'b' or cond ? "a" : "b"
    const ternaryMatch = /^(.+?)\?\s*(['"])([\s\S]*?)\2\s*:\s*(['"])([\s\S]*?)\4$/.exec(inner);
    if (ternaryMatch) {
      const condVal = evaluateFormula(ternaryMatch[1]!, env);
      return condVal !== 0 ? ternaryMatch[3]! : ternaryMatch[5]!;
    }
    const [exprPart, formatPart] = inner.split(":").map((s) => s.trim());
    const val = evaluateFormula(exprPart ?? "0", env);
    if (formatPart === "comma") return val.toLocaleString("en-US");
    if (formatPart && /^fixed\((\d+)\)$/.test(formatPart)) {
      const digits = Number(/^fixed\((\d+)\)$/.exec(formatPart)![1]);
      return val.toFixed(digits);
    }
    return Number.isInteger(val) ? String(val) : String(Math.round(val * 100) / 100);
  });
}

function computeEnv(data: PortableSliderData, values: SliderValues): Record<string, number> {
  const env: Record<string, number> = { ...values };
  for (const [key, expr] of Object.entries(data.formulas ?? {})) {
    env[key] = evaluateFormula(expr, env);
  }
  return env;
}

export function buildSliderSpec(data: PortableSliderData): SliderSpec {
  const inputs: SliderInput[] = data.inputs.map((inp) => ({
    id: inp.id,
    label: inp.label,
    min: inp.min,
    max: inp.max,
    step: inp.step,
    default: inp.default,
    unit: inp.unit ?? "",
  }));

  const compute = (values: SliderValues): SliderResult => {
    const env = computeEnv(data, values);
    const stats = data.stats.map((st) => ({
      label: st.label,
      value: interpolateTemplate(st.value, env),
      ...(st.detail ? { detail: interpolateTemplate(st.detail, env) } : {}),
    }));
    const bars = data.bars?.map((b) => {
      const rawTone = b.tone ? interpolateTemplate(b.tone, env).trim() : undefined;
      const validTone =
        rawTone === "good" || rawTone === "warn" || rawTone === "bad" || rawTone === "accent"
          ? (rawTone as Tone)
          : undefined;
      return {
        label: b.label,
        value: evaluateFormula(b.value, env),
        display: interpolateTemplate(b.display, env),
        ...(validTone ? { tone: validTone } : {}),
      };
    });
    return {
      stats,
      ...(bars ? { bars } : {}),
      ...(data.barMax !== undefined ? { barMax: data.barMax } : {}),
      summary: interpolateTemplate(data.summary, env),
    };
  };

  const describeChange = (before: SliderValues, after: SliderValues): string => {
    const afterEnv = computeEnv(data, after);
    if (data.changeTemplate) {
      return interpolateTemplate(data.changeTemplate, afterEnv);
    }
    const changedInput = inputs.find((inp) => before[inp.id] !== after[inp.id]);
    if (!changedInput) return interpolateTemplate(data.summary, afterEnv);
    const bVal = before[changedInput.id];
    const aVal = after[changedInput.id];
    const unit = changedInput.unit ? ` ${changedInput.unit}` : "";
    return `${changedInput.label} moved from ${bVal}${unit} to ${aVal}${unit}. ${interpolateTemplate(data.summary, afterEnv)}`;
  };

  return {
    kind: "slider",
    title: data.title,
    purpose: data.purpose,
    intro: data.intro,
    inputs,
    compute,
    describeChange,
    ...(data.barsTitle ? { barsTitle: data.barsTitle } : {}),
    tryThis: data.tryThis ?? [],
    limits: data.limits,
  };
}

// --------------------------------------------- 8. factory & domain primitives
export const sorterDataSchema = z
  .object({
    title: text,
    purpose: z.string().default(""),
    limits: text,
    buckets: z.array(z.object({ id: text, label: text, sub: z.string() }).passthrough()).min(2),
    cards: z
      .array(
        z.object({ id: text, text: text, answer: text, why: z.record(z.string(), z.string()) }).passthrough(),
      )
      .min(1),
    deckLabel: text,
    prompt: text,
    hint: text,
    endNote: text,
    verdicts: z.object({ clean: text, one: text, many: text }).passthrough().optional(),
  })
  .passthrough();

export const blockMapDataSchema = z
  .object({
    title: text,
    purpose: z.string().default(""),
    limits: text,
    blocks: z.array(z.record(z.string(), z.unknown())).min(1),
    // Chapters author links as { from, to }. BlockMap draws MapLink tuples,
    // so convert here: spreading an object into linkKey(...) would throw.
    links: z
      .array(z.object({ from: text, to: text }).passthrough())
      .optional()
      .transform((entries) => entries?.map((entry): [string, string] => [entry.from, entry.to])),
    height: z.number().positive(),
    defaultSelected: text,
    cloudLabel: text,
  })
  .passthrough();

export const contextPickerDataSchema = z
  .object({
    title: text,
    purpose: z.string().default(""),
    limits: text,
    question: text,
    factors: z.array(z.record(z.string(), z.unknown())).min(1),
    options: z.array(z.record(z.string(), z.unknown())).min(2),
    rules: z.array(z.record(z.string(), z.unknown())),
    fallback: z.object({ pick: text, why: text }).passthrough(),
    start: z.record(z.string(), z.string()),
    hint: text,
  })
  .passthrough();

export const flipDeckDataSchema = z
  .object({
    title: text,
    purpose: z.string().default(""),
    limits: text,
    verdicts: z.array(z.object({ id: text, label: text }).passthrough()).min(2),
    cards: z
      .array(z.object({ id: text, front: text, answer: text, back: text, source: text }).passthrough())
      .min(1),
    deckLabel: text,
    prompt: text,
    hint: text,
    endNote: text,
  })
  .passthrough();

export const commitStoryDataSchema = z
  .object({
    title: text,
    purpose: z.string().default(""),
    limits: text,
    histories: z.tuple([z.record(z.string(), z.unknown()), z.record(z.string(), z.unknown())]),
    hint: text,
  })
  .passthrough();

export const phraseFixerDataSchema = z
  .object({
    title: text,
    purpose: z.string().default(""),
    limits: text,
    segments: z.array(z.record(z.string(), z.unknown())).min(1),
    cardLabel: text,
    prompt: text,
    hint: text,
    endNote: text,
    verdicts: z.object({ found: text, skipped: text }).passthrough().optional(),
  })
  .passthrough();

export const budgetStackDataSchema = z
  .object({
    title: text,
    purpose: z.string().default(""),
    limits: text,
    blocks: z.array(z.record(z.string(), z.unknown())).min(1),
    unit: text,
    budget: z.number().positive(),
    minBudget: z.number().positive(),
    maxBudget: z.number().positive(),
    stepBudget: z.number().positive(),
    budgetLabel: text,
    goalProof: z.number().int().min(1),
    hint: text,
    endNote: text,
    verdicts: z.object({ met: text, short: text }).passthrough().optional(),
  })
  .passthrough();

export const slotCardDataSchema = z
  .object({
    title: text,
    purpose: z.string().default(""),
    limits: text,
    before: z.string(),
    slots: z.array(z.object({ id: text, label: text }).passthrough()).min(1),
    between: z.array(z.string()),
    chips: z
      .array(z.object({ id: text, text: text, slot: z.string().nullable(), why: text }).passthrough())
      .min(1),
    cardLabel: text,
    prompt: text,
    hint: text,
    endNote: text,
    verdicts: z.object({ clean: text, one: text, many: text }).passthrough().optional(),
  })
  .passthrough();

export const addrDataSchema = z
  .object({
    title: text,
    purpose: text,
    limits: text,
    mode: z.enum([
      "byte",
      "address",
      "drill",
      "allocate",
      "prefix",
      "classify",
      "mask-and",
      "split",
      "overlap",
      "v6",
    ]),
    config: z.record(z.string(), z.unknown()).optional(),
  })
  .passthrough();

export const packetDataSchema = z
  .object({
    title: text,
    purpose: text,
    limits: text,
    config: z.record(z.string(), z.unknown()),
  })
  .passthrough();

export function parsePortable<T extends z.ZodType>(
  schema: T,
  data: unknown,
): { ok: true; value: z.infer<T> } | { ok: false; problems: string[] } {
  const parsed = schema.safeParse(data);
  if (parsed.success) return { ok: true, value: parsed.data };
  return {
    ok: false,
    problems: parsed.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`),
  };
}
