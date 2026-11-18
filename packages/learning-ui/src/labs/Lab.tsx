import type { ReactNode } from "react";
import { validateLabSpec, type LabSpec } from "./types";
import { HldBoard } from "./HldBoard";
import type { ChallengeReport } from "./challenge";
import type { Board } from "./types";
import { getLabSpec } from "./registry";
import { BuildBoard } from "./net/BuildBoard";
import { NetBoard } from "./net/NetBoard";
import { PlanBoard } from "./net/PlanBoard";
import { PortablePresentationFrame } from "../canvas/InteractiveCanvas";
import { MAX_PORTABLE_VERSION, presentationSchema } from "../canvas/models/portable";
import { CourseLabLauncher } from "./CourseLabLauncher";

export function resolveLab(slug: unknown): { spec: LabSpec } | null {
  if (typeof slug !== "string") return null;
  const spec = getLabSpec(slug);
  return spec ? { spec } : null;
}

export function labView(spec: LabSpec): "hld-board" | "net-board" | "net-plan" | "net-build" | "db-placeholder" {
  if (spec.family === "hld") return "hld-board";
  if (spec.family === "net" && spec.mode === "build") return "net-build";
  if (spec.family === "net") return spec.mode === "plan" ? "net-plan" : "net-board";
  return "db-placeholder";
}

function LabFrame({
  eyebrow,
  title,
  purpose,
  limits,
  children,
}: {
  eyebrow: string;
  title: string;
  purpose: string;
  limits: string;
  children: ReactNode;
}) {
  return (
    <figure className="not-prose my-8">
      <figcaption className="mb-3">
        <div className="text-[11px] font-bold uppercase tracking-wider text-sky-400">{eyebrow}</div>
        <div className="text-xl font-bold text-foreground mt-0.5">{title}</div>
        <p className="text-sm text-muted-foreground mt-1 leading-relaxed">{purpose}</p>
      </figcaption>
      {children}
      <p className="mt-2 text-xs text-muted-foreground">{limits}</p>
    </figure>
  );
}

function normalizeInlineLabSpec(raw: unknown): { ok: true; spec: LabSpec } | { ok: false; problems: string[] } {
  if (!raw || typeof raw !== "object") {
    return { ok: false, problems: ["spec must be an object"] };
  }
  const obj = raw as Record<string, unknown>;
  const candidate = {
    ...obj,
    slug: typeof obj.slug === "string" && obj.slug.trim() ? obj.slug : "portable-lab",
    title: typeof obj.title === "string" ? obj.title : "",
    purpose: typeof obj.purpose === "string" ? obj.purpose : "",
    limits: typeof obj.limits === "string" ? obj.limits : "",
    hints: Array.isArray(obj.hints) ? obj.hints.map(String) : [],
  } as unknown as LabSpec;

  if (candidate.family !== "hld" && candidate.family !== "net" && candidate.family !== "db") {
    return { ok: false, problems: [`unknown lab family "${String(obj.family)}"`] };
  }
  try {
    const problems = validateLabSpec(candidate);
    if (problems.length > 0) return { ok: false, problems };
    return { ok: true, spec: candidate };
  } catch (err) {
    return { ok: false, problems: [err instanceof Error ? err.message : String(err)] };
  }
}

export function Lab({
  spec,
  slug,
  version,
  presentation,
  courseMode = false,
  onRunComplete,
}: {
  spec?: LabSpec | null;
  slug?: unknown;
  version?: unknown;
  presentation?: unknown;
  /** Course readers use a compact launcher; galleries and previews keep the full inline board. */
  courseMode?: boolean;
  /** For an hld lab: called once when a run finishes, with the report the board shows. */
  onRunComplete?: (report: ChallengeReport, board: Board, load: number) => void;
}) {
  const pres = presentationSchema.safeParse(presentation);
  const presOptions = pres.success ? pres.data : undefined;

  if (typeof version === "number" && version > MAX_PORTABLE_VERSION) {
    return (
      <div
        role="note"
        className="not-prose my-8 rounded-xl border border-dashed border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground"
      >
        {`This interactive lab uses format version ${version} (this app supports up to v${MAX_PORTABLE_VERSION}). Update the app to interact with this board, or read the surrounding explanation.`}
      </div>
    );
  }

  let resolvedSpec: LabSpec | null | undefined = null;
  if (spec != null) {
    const checked = normalizeInlineLabSpec(spec);
    if (!checked.ok) {
      if (process.env.NODE_ENV !== "production") {
        console.warn("[lab] spec rejected:", checked.problems);
      }
      resolvedSpec = null;
    } else {
      resolvedSpec = checked.spec;
    }
  } else {
    resolvedSpec = resolveLab(slug)?.spec;
  }

  if (!resolvedSpec) {
    return (
      <div
        role="note"
        className="not-prose my-8 rounded-xl border border-dashed border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground"
      >
        This lab is not available right now. The text around it explains the same idea.
      </div>
    );
  }

  const eyebrow =
    resolvedSpec.family === "hld" && resolvedSpec.challenge
      ? "Visual challenge"
      : resolvedSpec.family === "net"
        ? resolvedSpec.mode === "fault"
          ? "Fix it"
          : resolvedSpec.mode === "plan"
            ? "Plan it"
            : resolvedSpec.mode === "build"
              ? "Build it"
              : "Explore"
        : "Explore";

  if (courseMode && resolvedSpec.family === "hld") {
    return (
      <PortablePresentationFrame presentation={presOptions}>
        <CourseLabLauncher spec={resolvedSpec} />
      </PortablePresentationFrame>
    );
  }

  return (
    <PortablePresentationFrame presentation={presOptions}>
      <LabFrame eyebrow={eyebrow} title={resolvedSpec.title} purpose={resolvedSpec.purpose} limits={resolvedSpec.limits}>
        {resolvedSpec.family === "hld" ? (
          <HldBoard spec={resolvedSpec} onRunComplete={onRunComplete} />
        ) : resolvedSpec.family === "net" ? (
          resolvedSpec.mode === "plan" && resolvedSpec.plan ? (
            <PlanBoard plan={resolvedSpec.plan} solution={resolvedSpec.solution} />
          ) : resolvedSpec.mode === "build" ? (
            <BuildBoard spec={resolvedSpec} />
          ) : (
            <NetBoard spec={resolvedSpec} />
          )
        ) : (
          <p className="text-sm text-muted-foreground">The schema board loads in the full lab.</p>
        )}
      </LabFrame>
    </PortablePresentationFrame>
  );
}
