import Link from "next/link";
import type { ReactNode } from "react";
import { LAB_KINDS, type LabKindId } from "@/lib/learn-areas";
import { LAB_SLUGS } from "@/shared/lab/slugs";
import { COBALT, HEADING, INK, LINE, MONO, MUTED, PAPER, TINT, YELLOW } from "./try-it/brand";
import s from "./edorax-landing.module.css";

// Two landing sections after the courses story: the three kinds of hands-on lab, and
// the desktop app that runs the shell labs. Copy for the lab kinds comes from
// LAB_KINDS so it never drifts from the Labs area.

const PANEL: React.CSSProperties = {
  height: "150px",
  background: TINT,
  padding: "18px",
  boxSizing: "border-box",
  display: "flex",
  flexDirection: "column",
  justifyContent: "center",
  gap: "8px",
};

const COUNTS: Record<LabKindId, string> = {
  visual: `${LAB_SLUGS.length} labs`,
  guided: "3 levels",
  shell: "46 labs",
};

const VISUALS: Record<LabKindId, ReactNode> = {
  visual: (
    <div style={PANEL}>
      <svg viewBox="0 0 240 70" width="100%" role="img" aria-label="A board with users, a balancer and two servers, and every check passing" style={{ display: "block" }}>
        <path d="M40 35 H84 M136 35 L160 16 M136 35 L160 54" stroke={INK} strokeWidth="2.5" fill="none" />
        <rect x="4" y="20" width="36" height="30" fill={COBALT} />
        <text x="22" y="39" textAnchor="middle" fontSize="10" fontWeight="700" fill={PAPER}>Users</text>
        <rect x="84" y="20" width="52" height="30" fill="#FFFFFF" stroke={INK} strokeWidth="2" />
        <text x="110" y="39" textAnchor="middle" fontSize="10" fontWeight="700" fill={INK}>Balancer</text>
        <rect x="160" y="4" width="48" height="24" fill="#FFFFFF" stroke={INK} strokeWidth="2" />
        <rect x="160" y="42" width="48" height="24" fill="#FFFFFF" stroke={INK} strokeWidth="2" />
        <circle cx="226" cy="16" r="8" fill="#16794C" />
        <circle cx="226" cy="54" r="8" fill="#16794C" />
      </svg>
      <span style={{ fontSize: "13px", color: MUTED }}>Move parts, press Run, read every check.</span>
    </div>
  ),
  guided: (
    <div style={PANEL}>
      {["Lab 1: tests pass", "Lab 2: tests pass", "Capstone: checked in your repo"].map((t, i) => (
        <div key={t} style={{ display: "flex", alignItems: "center", gap: "8px", background: "#FFFFFF", padding: "6px 10px", fontSize: "13px", fontWeight: 700 }}>
          <span aria-hidden="true" style={{ width: "14px", height: "14px", background: i < 2 ? "#16794C" : "transparent", border: i < 2 ? "none" : `2px solid ${MUTED}`, boxSizing: "border-box" }} />
          {t}
        </div>
      ))}
    </div>
  ),
  shell: (
    <div style={{ ...PANEL, background: INK, fontFamily: MONO, fontSize: "13px", color: "#C9CFF0", gap: "4px" }}>
      <div><span style={{ color: "#7A8BFF" }}>~ $</span> <span style={{ color: PAPER }}>chmod 640 notes.txt</span></div>
      <div><span style={{ color: "#7A8BFF" }}>~ $</span> <span style={{ color: PAPER }}>ls -l notes.txt</span></div>
      <div>-rw-r----- 1 learner learner 88 notes.txt</div>
      <div style={{ color: YELLOW }}>Check: step 3 passed.</div>
    </div>
  ),
};

export function HandsOnLabs() {
  return (
    <section id="labs" style={{ width: "100%" }}>
      <div className={s.pad} style={{ maxWidth: "1200px", margin: "0 auto", padding: "88px 24px", boxSizing: "border-box" }}>
        <h2 className={s.h2} style={{ margin: 0, fontFamily: HEADING, fontWeight: 700, fontSize: "36px", lineHeight: 1.15, letterSpacing: "-0.02em", maxWidth: "720px" }}>
          Hands-on labs. Learn it by breaking it.
        </h2>
        <p style={{ margin: "16px 0 0", color: MUTED, maxWidth: "600px" }}>
          Three kinds of lab, from no code at all to a real Linux machine. Every lab checks your work and tells you what is still missing.
        </p>
        <div className={s.rail} style={{ marginTop: "48px", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(300px, 100%), 1fr))", gap: "16px" }}>
          {LAB_KINDS.map((kind) => (
            <Link key={kind.id} href={kind.href} style={{ border: `1px solid ${LINE}`, background: "#FFFFFF", color: INK, textDecoration: "none", display: "flex", flexDirection: "column" }}>
              {VISUALS[kind.id]}
              <div style={{ padding: "20px", display: "flex", flexDirection: "column", gap: "8px", flex: 1 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "12px" }}>
                  <h3 style={{ margin: 0, fontFamily: HEADING, fontWeight: 700, fontSize: "19px", letterSpacing: "-0.02em" }}>{kind.name}</h3>
                  <span style={{ fontSize: "14px", fontWeight: 700, color: COBALT, whiteSpace: "nowrap" }}>{COUNTS[kind.id]}</span>
                </div>
                <p style={{ margin: 0, fontSize: "15px", lineHeight: 1.5, color: MUTED }}>{kind.summary}</p>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

const APP_POINTS = [
  ["Real machines", "Each shell lab starts a clean Linux machine or container in Docker. Break it, then reset in one click."],
  ["Checked by tests", "Press Check and a test looks at the machine itself, then says what is done and what is missing."],
  ["Your courses too", "Read lessons in the app with the same diagrams and quizzes, and open a terminal beside any lesson."],
] as const;

export function DesktopApp() {
  return (
    <section id="desktop" style={{ width: "100%", background: "#FFFFFF", borderTop: `1px solid ${LINE}`, borderBottom: `1px solid ${LINE}` }}>
      <div className={s.pad} style={{ maxWidth: "1200px", margin: "0 auto", padding: "88px 24px", boxSizing: "border-box", display: "flex", flexWrap: "wrap", gap: "48px", alignItems: "center" }}>
        <div style={{ flex: "1 1 420px", minWidth: 0 }}>
          <div style={{ fontSize: "13px", fontWeight: 700, color: COBALT, letterSpacing: "0.06em", textTransform: "uppercase" }}>The Edorax desktop app</div>
          <h2 className={s.h2} style={{ margin: "10px 0 0", fontFamily: HEADING, fontWeight: 700, fontSize: "36px", lineHeight: 1.15, letterSpacing: "-0.02em" }}>
            A real terminal on your own computer.
          </h2>
          <p style={{ margin: "16px 0 0", color: MUTED, maxWidth: "520px" }}>
            The shell labs need a real machine, so they run in the free desktop app. Sign in with your Edorax account and your progress follows you.
          </p>
          <ul style={{ margin: "28px 0 0", padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: "16px" }}>
            {APP_POINTS.map(([title, body]) => (
              <li key={title} style={{ display: "flex", gap: "14px" }}>
                <span aria-hidden="true" style={{ flex: "none", width: "10px", height: "10px", marginTop: "9px", background: YELLOW, borderRadius: "50%" }} />
                <span>
                  <strong style={{ display: "block" }}>{title}</strong>
                  <span style={{ fontSize: "16px", color: MUTED }}>{body}</span>
                </span>
              </li>
            ))}
          </ul>
          <div style={{ marginTop: "32px", display: "flex", flexWrap: "wrap", alignItems: "center", gap: "14px 20px" }}>
            <Link href="/labs/shell#download" style={{ display: "inline-block", background: COBALT, color: PAPER, textDecoration: "none", fontWeight: 700, padding: "14px 26px" }}>
              Get the desktop app
            </Link>
            <span style={{ fontSize: "15px", color: MUTED }}>Windows, macOS (Apple silicon) and Linux. Early release.</span>
          </div>
        </div>
        <AppWindow />
      </div>
    </section>
  );
}

const SHELL_TOPICS = [["Linux", 19], ["Docker", 8], ["Ansible", 9], ["Kubernetes", 10]] as const;

// A drawn picture of the app, not a screenshot, so it stays sharp and light.
function AppWindow() {
  return (
    <div role="img" aria-label="The desktop app: shell lab topics with a Check button on the left, and a terminal on the right" style={{ flex: "1 1 460px", minWidth: 0, border: `2px solid ${INK}`, background: PAPER, boxShadow: `8px 8px 0 ${YELLOW}` }}>
      <div aria-hidden="true" style={{ display: "flex", alignItems: "center", gap: "6px", padding: "8px 12px", background: INK }}>
        {[0, 1, 2].map((i) => (
          <span key={i} style={{ width: "9px", height: "9px", borderRadius: "50%", background: "#3A4270" }} />
        ))}
        <span style={{ marginLeft: "10px", fontSize: "12px", color: "#9AA2C7" }}>Edorax</span>
      </div>
      <div aria-hidden="true" className={s.appBody} style={{ display: "grid", gridTemplateColumns: "minmax(0, 0.9fr) minmax(0, 1.1fr)", minHeight: "260px" }}>
        <div style={{ padding: "18px", borderRight: `1px solid ${LINE}`, display: "flex", flexDirection: "column", gap: "8px" }}>
          <div style={{ fontSize: "12px", fontWeight: 700, color: COBALT, letterSpacing: "0.06em", textTransform: "uppercase" }}>Shell labs</div>
          {SHELL_TOPICS.map(([name, count], i) => (
            <div key={name} style={{ display: "flex", justifyContent: "space-between", gap: "8px", padding: "7px 10px", fontSize: "13px", fontWeight: 700, background: i === 0 ? INK : "#FFFFFF", color: i === 0 ? PAPER : INK }}>
              <span>{name}</span>
              <span style={{ fontWeight: 400, color: i === 0 ? "#C9CFF0" : MUTED }}>{count} labs</span>
            </div>
          ))}
          <div style={{ marginTop: "auto", display: "flex", gap: "8px" }}>
            <span style={{ background: "#16794C", color: PAPER, fontSize: "13px", fontWeight: 700, padding: "6px 14px" }}>Check</span>
            <span style={{ border: `1px solid ${LINE}`, background: "#FFFFFF", fontSize: "13px", fontWeight: 700, padding: "5px 12px" }}>Reset</span>
          </div>
        </div>
        <div style={{ background: INK, color: "#C9CFF0", fontFamily: MONO, fontSize: "12.5px", lineHeight: 1.6, padding: "14px" }}>
          <div><span style={{ color: "#7A8BFF" }}>~ $</span> <span style={{ color: PAPER }}>whoami</span></div>
          <div>learner</div>
          <div><span style={{ color: "#7A8BFF" }}>~ $</span> <span style={{ color: PAPER }}>sudo useradd -m sara</span></div>
          <div><span style={{ color: "#7A8BFF" }}>~ $</span> <span style={{ color: PAPER }}>id sara</span></div>
          <div>uid=1001(sara) gid=1001(sara)</div>
          <div style={{ color: YELLOW }}>Check: step 2 passed.</div>
        </div>
      </div>
    </div>
  );
}
