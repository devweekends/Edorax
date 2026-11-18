import Link from "next/link";
import { ChoiceGroup } from "./choice-group";
import { Dot } from "@/components/brand/dot";
import { RotatingHeadline } from "./try-it/rotating-headline";
import { TryIt } from "./try-it/try-it";
import { DesktopApp, HandsOnLabs } from "./labs-and-desktop";
import { AreaShowcase } from "./area-showcase";
import { Wordmark } from "@/components/brand/wordmark";
import s from "./edorax-landing.module.css";

// The Edorax home page. Static markup with inline brand values so it matches the
// approved design one to one; only the hero's try-it panel and the leaderboard
// choice are interactive. Font variables (--font-unbounded, --font-dm-sans) are defined
// globally in layout.tsx.

function AccountLink({ dashboardHref }: { dashboardHref: string | null }) {
  return <Link href={dashboardHref ?? "/login"} style={{ color: "#0A0F2C", textDecoration: "none", fontWeight: 700, padding: "12px 0", whiteSpace: "nowrap" }}>{dashboardHref ? "Dashboard" : "Sign in"}</Link>;
}

// Courses are public, so the nav links to the catalog on every screen size, phones included.
function CoursesNavLink() {
  return <Link href="/catalog" style={{ color: "#0A0F2C", textDecoration: "none", fontWeight: 700, padding: "12px 0", whiteSpace: "nowrap" }}>Courses</Link>;
}

function LabsNavLink() {
  return <Link href="/labs" className={s.navLink} style={{ color: "#0A0F2C", textDecoration: "none", fontWeight: 700, padding: "12px 0", whiteSpace: "nowrap" }}>Labs</Link>;
}

function CatalogLink() {
  return <Link href="/catalog" style={{ display: "inline-block", color: "#F6F7FB", textDecoration: "none", fontWeight: 700, padding: "14px 28px", border: "2px solid #F6F7FB" }}>Browse courses</Link>;
}

export function EdoraxLanding({ dashboardHref = null }: { dashboardHref?: string | null }) {
  return (
    <div className={s.root} style={{ width: "100%", boxSizing: "border-box", background: "#F6F7FB", color: "#0A0F2C", fontFamily: "var(--font-dm-sans), system-ui, sans-serif", fontSize: "18px", lineHeight: "1.55" }}>
      <header style={{ width: "100%" }}>
        <div className={s.header} style={{ maxWidth: "1200px", margin: "0 auto", padding: "20px 24px", boxSizing: "border-box", display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: "16px" }}>
          <a href="#top" aria-label="Edorax home" style={{ display: "flex", alignItems: "center", textDecoration: "none" }}>
            <Wordmark tone="light" height={30} />
          </a>
          <nav aria-label="Main" className={s.nav} style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "8px 28px", fontSize: "16px" }}>
            <a href="#areas" className={s.navLink} style={{ color: "#0A0F2C", textDecoration: "none", padding: "12px 0" }}>Ways to learn</a>
            <a href="#how" className={s.navLink} style={{ color: "#0A0F2C", textDecoration: "none", padding: "12px 0" }}>How it works</a>
            <a href="#desktop" className={s.navLink} style={{ color: "#0A0F2C", textDecoration: "none", padding: "12px 0" }}>Desktop app</a>
            <a href="#dot" className={s.navLink} style={{ color: "#0A0F2C", textDecoration: "none", padding: "12px 0" }}>Meet Dot</a>
            <a href="#topics" className={s.navLink} style={{ color: "#0A0F2C", textDecoration: "none", padding: "12px 0" }}>What you can learn</a>
            <CoursesNavLink />
            <LabsNavLink />
            <AccountLink dashboardHref={dashboardHref} />
            <a href="#try" className={`${s.navCta} ${s.hideSm}`} style={{ background: "#2434E0", color: "#F6F7FB", textDecoration: "none", fontWeight: "700", padding: "12px 22px" }}>Try it now</a>
          </nav>
        </div>
      </header>
      <section id="top" style={{ width: "100%" }}>
        <div className={s.hero} style={{ maxWidth: "1200px", margin: "0 auto", padding: "40px 24px 96px", boxSizing: "border-box", display: "flex", flexWrap: "wrap", alignItems: "center", gap: "56px" }}>
          <div style={{ flex: "1 1 480px", minWidth: "0" }}>
            <RotatingHeadline className={s.h1} style={{ margin: "0", fontFamily: "var(--font-unbounded), sans-serif", fontWeight: "700", fontSize: "54px", lineHeight: "1.1", letterSpacing: "-0.035em" }} />
            <p style={{ margin: "24px 0 0", fontSize: "20px", color: "#46507A", maxWidth: "520px" }}>Courses you read, play, hear and prove. Labs you build and break. Try each kind right here in two minutes, no account needed.</p>
            <div className={s.hideSm} style={{ marginTop: "36px", display: "flex", flexWrap: "wrap", gap: "14px" }}>
              <a href="#try" style={{ background: "#2434E0", color: "#F6F7FB", textDecoration: "none", fontWeight: "700", padding: "15px 28px" }}>Start trying</a>
              <a href="#labs" style={{ color: "#0A0F2C", textDecoration: "none", fontWeight: "700", padding: "13px 26px", border: "2px solid #0A0F2C" }}>See the labs</a>
            </div>
          </div>
          <TryIt />
        </div>
      </section>
      <section id="how" style={{ width: "100%", background: "#FFFFFF", borderTop: "1px solid #DCE0F2", borderBottom: "1px solid #DCE0F2" }}>
        <div className={s.pad} style={{ maxWidth: "1200px", margin: "0 auto", padding: "88px 24px", boxSizing: "border-box" }}>
          <h2 className={s.h2} style={{ margin: "0", fontFamily: "var(--font-unbounded), sans-serif", fontWeight: "700", fontSize: "36px", lineHeight: "1.15", letterSpacing: "-0.02em", maxWidth: "680px" }}>One chapter, four ways in.</h2>
          <p style={{ margin: "16px 0 0", color: "#46507A", maxWidth: "560px" }}>Read it, play with it, listen to it, prove it. Use all four, or only the ones that suit your day.</p>
          <div className={s.rail} style={{ marginTop: "48px", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(250px, 100%), 1fr))", gap: "20px" }}>
            <div style={{ border: "1px solid #DCE0F2", display: "flex", flexDirection: "column" }}>
              <div style={{ height: "170px", background: "#E8EBFF", padding: "22px", boxSizing: "border-box", display: "flex", flexDirection: "column", justifyContent: "center", gap: "10px" }}>
                <div style={{ fontSize: "12px", fontWeight: "700", color: "#2434E0", letterSpacing: "0.06em", textTransform: "uppercase" }}>Starts with why</div>
                <div style={{ fontFamily: "var(--font-unbounded), sans-serif", fontWeight: "700", fontSize: "16px", lineHeight: "1.35" }}>Why does a video buffer at night but not in the morning?</div>
                <div style={{ height: "8px", width: "80%", background: "#FFFFFF" }} />
                <div style={{ height: "8px", width: "60%", background: "#FFFFFF" }} />
              </div>
              <div style={{ padding: "22px" }}>
                <h3 style={{ margin: "0", fontFamily: "var(--font-unbounded), sans-serif", fontWeight: "700", fontSize: "20px", letterSpacing: "-0.02em" }}>Read</h3>
                <p style={{ margin: "8px 0 0", fontSize: "16px", color: "#46507A" }}>A question from your own life first, then the idea that answers it.</p>
              </div>
            </div>
            <div style={{ border: "1px solid #DCE0F2", display: "flex", flexDirection: "column" }}>
              <div style={{ height: "170px", background: "#E8EBFF", padding: "18px", boxSizing: "border-box", display: "flex", flexDirection: "column", justifyContent: "center", gap: "8px" }}>
                <svg viewBox="0 0 260 90" width="100%" role="img" aria-label="Diagram: you, then DNS, then the server, with a packet travelling between them" style={{ display: "block" }}>
                  <path d="M46 45 H110 M170 45 H196" stroke="#0A0F2C" strokeWidth="3" />
                  <circle cx="28" cy="45" r="22" fill="#2434E0" />
                  <text x="28" y="50" textAnchor="middle" fontWeight="700" fontSize="12" fill="#F6F7FB" style={{ fontFamily: "var(--font-dm-sans), sans-serif" }}>You</text>
                  <rect x="110" y="24" width="60" height="42" fill="#FFFFFF" stroke="#0A0F2C" strokeWidth="3" />
                  <text x="140" y="50" textAnchor="middle" fontWeight="700" fontSize="12" fill="#0A0F2C" style={{ fontFamily: "var(--font-dm-sans), sans-serif" }}>DNS</text>
                  <rect x="196" y="24" width="60" height="42" fill="#0A0F2C" />
                  <text x="226" y="50" textAnchor="middle" fontWeight="700" fontSize="12" fill="#F6F7FB" style={{ fontFamily: "var(--font-dm-sans), sans-serif" }}>Server</text>
                  <circle cx="78" cy="45" r="8" fill="#FFC933" stroke="#0A0F2C" strokeWidth="2" />
                </svg>
                <div style={{ fontSize: "13px", color: "#46507A" }}>Drag the yellow packet and watch where it goes.</div>
              </div>
              <div style={{ padding: "22px" }}>
                <h3 style={{ margin: "0", fontFamily: "var(--font-unbounded), sans-serif", fontWeight: "700", fontSize: "20px", letterSpacing: "-0.02em" }}>Play</h3>
                <p style={{ margin: "8px 0 0", fontSize: "16px", color: "#46507A" }}>Live diagrams and small labs you can poke at, so the words turn into something you have seen.</p>
              </div>
            </div>
            <div style={{ border: "1px solid #DCE0F2", display: "flex", flexDirection: "column" }}>
              <div style={{ height: "170px", background: "#E8EBFF", padding: "20px", boxSizing: "border-box", display: "flex", flexDirection: "column", justifyContent: "center", gap: "14px" }}>
                <div style={{ fontSize: "15px", lineHeight: "1.5" }}>The server replies with an <span style={{ background: "#FFC933", padding: "0 3px" }}>address</span> your phone can use.</div>
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <div style={{ width: "36px", height: "36px", borderRadius: "50%", background: "#2434E0", display: "flex", alignItems: "center", justifyContent: "center", flex: "none" }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M8 5v14l11-7z" fill="#F6F7FB" />
                    </svg>
                  </div>
                  <div style={{ flex: "1", height: "6px", borderRadius: "3px", background: "#FFFFFF" }}>
                    <div style={{ width: "40%", height: "6px", borderRadius: "3px", background: "#2434E0" }} />
                  </div>
                  <span style={{ fontSize: "13px", fontWeight: "700" }}>1.5x</span>
                </div>
              </div>
              <div style={{ padding: "22px" }}>
                <h3 style={{ margin: "0", fontFamily: "var(--font-unbounded), sans-serif", fontWeight: "700", fontSize: "20px", letterSpacing: "-0.02em" }}>Listen</h3>
                <p style={{ margin: "8px 0 0", fontSize: "16px", color: "#46507A" }}>Every chapter can be heard, word by word, at any speed from 0.75x to 4x.</p>
              </div>
            </div>
            <div style={{ border: "1px solid #DCE0F2", display: "flex", flexDirection: "column" }}>
              <div style={{ height: "170px", background: "#E8EBFF", padding: "20px", boxSizing: "border-box", display: "flex", flexDirection: "column", justifyContent: "center", gap: "8px" }}>
                <div aria-hidden="true" style={{ height: "26px", background: "#FFFFFF" }} />
                <div aria-hidden="true" style={{ height: "26px", background: "#FFFFFF" }} />
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px", marginTop: "4px" }}>
                  <span style={{ fontSize: "13px", color: "#46507A" }}>Hidden until you start</span>
                  <span style={{ background: "#FFC933", fontSize: "14px", fontWeight: "700", padding: "6px 16px" }}>Start</span>
                </div>
              </div>
              <div style={{ padding: "22px" }}>
                <h3 style={{ margin: "0", fontFamily: "var(--font-unbounded), sans-serif", fontWeight: "700", fontSize: "20px", letterSpacing: "-0.02em" }}>Prove</h3>
                <p style={{ margin: "8px 0 0", fontSize: "16px", color: "#46507A" }}>A short quiz with no timer. Questions stay hidden until you press Start, so the result is yours.</p>
              </div>
            </div>
          </div>
        </div>
      </section>
      <HandsOnLabs />
      <DesktopApp />
      <AreaShowcase />
      <section id="dot" style={{ width: "100%", borderTop: "1px solid #DCE0F2" }}>
        <div className={s.pad} style={{ maxWidth: "1200px", margin: "0 auto", padding: "88px 24px", boxSizing: "border-box" }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "24px", alignItems: "flex-end", justifyContent: "space-between" }}>
            <div style={{ flex: "1 1 460px", minWidth: "0" }}>
              <h2 className={s.h2} style={{ margin: "0", fontFamily: "var(--font-unbounded), sans-serif", fontWeight: "700", fontSize: "36px", lineHeight: "1.15", letterSpacing: "-0.02em" }}>Meet Dot. It notices when you need a hand.</h2>
              <p style={{ margin: "16px 0 0", color: "#46507A", maxWidth: "560px" }}>Dot never nags and never blames. It shows up at the right moment, says one short thing, and gets out of your way.</p>
            </div>
          </div>
          <div className={s.railTab} style={{ marginTop: "48px", display: "grid", gridTemplateColumns: "repeat(5, minmax(0, 1fr))", gap: "16px" }}>
            <div style={{ background: "#FFFFFF", border: "1px solid #DCE0F2", padding: "22px 18px", display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", gap: "10px" }}>
              <Dot mood="think" size={112} />
              <div style={{ fontWeight: "700", fontSize: "16px" }}>When you are stuck</div>
              <div style={{ fontSize: "14px", lineHeight: "1.45", color: "#46507A" }}>&quot;Want a hint? Just a small one.&quot;</div>
            </div>
            <div style={{ background: "#FFFFFF", border: "1px solid #DCE0F2", padding: "22px 18px", display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", gap: "10px" }}>
              <Dot mood="determined" size={112} />
              <div style={{ fontWeight: "700", fontSize: "16px" }}>When a quiz goes badly</div>
              <div style={{ fontSize: "14px", lineHeight: "1.45", color: "#46507A" }}>&quot;Two ideas to look at again. Then try once more.&quot;</div>
            </div>
            <div style={{ background: "#FFFFFF", border: "1px solid #DCE0F2", padding: "22px 18px", display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", gap: "10px" }}>
              <Dot mood="wave" size={112} />
              <div style={{ fontWeight: "700", fontSize: "16px" }}>When you come back</div>
              <div style={{ fontSize: "14px", lineHeight: "1.45", color: "#46507A" }}>&quot;Welcome back. Five minutes picks it up again.&quot;</div>
            </div>
            <div style={{ background: "#FFFFFF", border: "1px solid #DCE0F2", padding: "22px 18px", display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", gap: "10px" }}>
              <Dot mood="wink" size={112} />
              <div style={{ fontWeight: "700", fontSize: "16px" }}>When it finally clicks</div>
              <div style={{ fontSize: "14px", lineHeight: "1.45", color: "#46507A" }}>&quot;That took a few tries. It will stick now.&quot;</div>
            </div>
            <div style={{ background: "#FFFFFF", border: "1px solid #DCE0F2", padding: "22px 18px", display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", gap: "10px" }}>
              <Dot mood="cheer" size={112} />
              <div style={{ fontWeight: "700", fontSize: "16px" }}>When you finish</div>
              <div style={{ fontSize: "14px", lineHeight: "1.45", color: "#46507A" }}>&quot;Lesson done. Next one is ready when you are.&quot;</div>
            </div>
          </div>
          <div style={{ marginTop: "40px", background: "#FFFFFF", border: "1px solid #DCE0F2", padding: "28px", boxSizing: "border-box" }}>
            <div style={{ fontFamily: "var(--font-unbounded), sans-serif", fontWeight: "700", fontSize: "20px", letterSpacing: "-0.02em" }}>Stuck? You choose how much help you get.</div>
            <div className={`${s.rail} ${s.railHalf}`} style={{ marginTop: "24px", display: "flex", gap: "16px", alignItems: "flex-end" }}>
              <div style={{ flex: "1 1 0", minWidth: "0", display: "flex", flexDirection: "column", gap: "10px" }}>
                <div style={{ fontWeight: "700", fontSize: "16px" }}>1. A nudge</div>
                <div style={{ fontSize: "14px", color: "#46507A" }}>Which part matters most?</div>
                <div style={{ height: "40px", borderRadius: "8px", background: "#DCE0F2" }} />
              </div>
              <div style={{ flex: "1 1 0", minWidth: "0", display: "flex", flexDirection: "column", gap: "10px" }}>
                <div style={{ fontWeight: "700", fontSize: "16px" }}>2. A hint</div>
                <div style={{ fontSize: "14px", color: "#46507A" }}>The idea, not the answer.</div>
                <div style={{ height: "70px", borderRadius: "8px", background: "#7A8BFF" }} />
              </div>
              <div style={{ flex: "1 1 0", minWidth: "0", display: "flex", flexDirection: "column", gap: "10px" }}>
                <div style={{ fontWeight: "700", fontSize: "16px" }}>3. An example</div>
                <div style={{ fontSize: "14px", color: "#46507A" }}>A similar one, solved.</div>
                <div style={{ height: "100px", borderRadius: "8px", background: "#2434E0" }} />
              </div>
              <div style={{ flex: "1 1 0", minWidth: "0", display: "flex", flexDirection: "column", gap: "10px" }}>
                <div style={{ fontWeight: "700", fontSize: "16px" }}>4. Come back later</div>
                <div style={{ fontSize: "14px", color: "#46507A" }}>It waits at the end.</div>
                <div style={{ height: "130px", borderRadius: "8px", background: "#FFC933" }} />
              </div>
            </div>
          </div>
        </div>
      </section>
      <section id="topics" style={{ width: "100%", background: "#FFFFFF", borderTop: "1px solid #DCE0F2", borderBottom: "1px solid #DCE0F2" }}>
        <div className={s.pad} style={{ maxWidth: "1200px", margin: "0 auto", padding: "88px 24px", boxSizing: "border-box" }}>
          <h2 className={s.h2} style={{ margin: "0", fontFamily: "var(--font-unbounded), sans-serif", fontWeight: "700", fontSize: "36px", lineHeight: "1.15", letterSpacing: "-0.02em", maxWidth: "720px" }}>How things work. And how people work.</h2>
          <p style={{ margin: "16px 0 0", color: "#46507A", maxWidth: "600px" }}>Tech skills and human skills, side by side. Here are a few of the questions courses start from, and more are on the way.</p>
          <div className={s.rail} style={{ marginTop: "48px", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(260px, 100%), 1fr))", gap: "16px" }}>
            <div style={{ minHeight: "168px", background: "#2434E0", color: "#F6F7FB", padding: "24px", boxSizing: "border-box", display: "flex", flexDirection: "column", justifyContent: "space-between", gap: "18px" }}>
              <span style={{ fontFamily: "var(--font-unbounded), sans-serif", fontWeight: "700", fontSize: "18px", lineHeight: "1.35", letterSpacing: "-0.01em" }}>Why does a video buffer at night but play fine in the morning?</span>
              <span style={{ fontSize: "14px", color: "#DCE0FF" }}>Networks</span>
            </div>
            <div style={{ minHeight: "168px", background: "#F6F7FB", border: "1px solid #DCE0F2", padding: "24px", boxSizing: "border-box", display: "flex", flexDirection: "column", justifyContent: "space-between", gap: "18px" }}>
              <span style={{ fontFamily: "var(--font-unbounded), sans-serif", fontWeight: "700", fontSize: "18px", lineHeight: "1.35", letterSpacing: "-0.01em" }}>How do you say no to your manager without burning the bridge?</span>
              <span style={{ fontSize: "14px", color: "#46507A" }}>Communication</span>
            </div>
            <div style={{ minHeight: "168px", background: "#F6F7FB", border: "1px solid #DCE0F2", padding: "24px", boxSizing: "border-box", display: "flex", flexDirection: "column", justifyContent: "space-between", gap: "18px" }}>
              <span style={{ fontFamily: "var(--font-unbounded), sans-serif", fontWeight: "700", fontSize: "18px", lineHeight: "1.35", letterSpacing: "-0.01em" }}>What happens when ten thousand people press the same button at once?</span>
              <span style={{ fontSize: "14px", color: "#46507A" }}>Systems</span>
            </div>
            <div style={{ minHeight: "168px", background: "#FFC933", color: "#0A0F2C", padding: "24px", boxSizing: "border-box", display: "flex", flexDirection: "column", justifyContent: "space-between", gap: "18px" }}>
              <span style={{ fontFamily: "var(--font-unbounded), sans-serif", fontWeight: "700", fontSize: "18px", lineHeight: "1.35", letterSpacing: "-0.01em" }}>How do you explain your work so people remember it?</span>
              <span style={{ fontSize: "14px" }}>Speaking</span>
            </div>
            <div style={{ minHeight: "168px", background: "#F6F7FB", border: "1px solid #DCE0F2", padding: "24px", boxSizing: "border-box", display: "flex", flexDirection: "column", justifyContent: "space-between", gap: "18px" }}>
              <span style={{ fontFamily: "var(--font-unbounded), sans-serif", fontWeight: "700", fontSize: "18px", lineHeight: "1.35", letterSpacing: "-0.01em" }}>Why do some apps feel cheap even when they work fine?</span>
              <span style={{ fontSize: "14px", color: "#46507A" }}>Product</span>
            </div>
            <div style={{ minHeight: "168px", background: "#0A0F2C", color: "#F6F7FB", padding: "24px", boxSizing: "border-box", display: "flex", flexDirection: "column", justifyContent: "space-between", gap: "18px" }}>
              <span style={{ fontFamily: "var(--font-unbounded), sans-serif", fontWeight: "700", fontSize: "18px", lineHeight: "1.35", letterSpacing: "-0.01em" }}>What do you say in an interview when you have no idea?</span>
              <span style={{ fontSize: "14px", color: "#C9CFF0" }}>Interviews</span>
            </div>
            <div style={{ minHeight: "168px", background: "#E8EBFF", padding: "24px", boxSizing: "border-box", display: "flex", flexDirection: "column", justifyContent: "space-between", gap: "18px" }}>
              <span style={{ fontFamily: "var(--font-unbounded), sans-serif", fontWeight: "700", fontSize: "18px", lineHeight: "1.35", letterSpacing: "-0.01em" }}>How do you ask for help without feeling stupid?</span>
              <span style={{ fontSize: "14px", color: "#46507A" }}>Learning</span>
            </div>
            <div style={{ minHeight: "168px", background: "#F6F7FB", border: "1px solid #DCE0F2", padding: "24px", boxSizing: "border-box", display: "flex", flexDirection: "column", justifyContent: "space-between", gap: "18px" }}>
              <span style={{ fontFamily: "var(--font-unbounded), sans-serif", fontWeight: "700", fontSize: "18px", lineHeight: "1.35", letterSpacing: "-0.01em" }}>Why does one resume get the call and another does not?</span>
              <span style={{ fontSize: "14px", color: "#46507A" }}>Career</span>
            </div>
          </div>
        </div>
      </section>
      <section style={{ width: "100%", background: "#0A0F2C", color: "#F6F7FB" }}>
        <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "64px 24px", boxSizing: "border-box", display: "flex", flexWrap: "wrap", gap: "32px 48px", alignItems: "center" }}>
          <h2 style={{ margin: "0", flex: "1 1 320px", minWidth: "0", fontFamily: "var(--font-unbounded), sans-serif", fontWeight: "700", fontSize: "28px", lineHeight: "1.2", letterSpacing: "-0.02em" }}>Made for phones and slow connections.</h2>
          <div style={{ flex: "2 1 560px", minWidth: "0", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(170px, 100%), 1fr))", gap: "24px" }}>
            <div>
              <div style={{ fontFamily: "var(--font-unbounded), sans-serif", fontWeight: "700", fontSize: "26px", color: "#FFC933" }}>1 MB</div>
              <div style={{ marginTop: "4px", fontSize: "15px", color: "#C9CFF0" }}>about four minutes of narration</div>
            </div>
            <div>
              <div style={{ fontFamily: "var(--font-unbounded), sans-serif", fontWeight: "700", fontSize: "26px", color: "#FFC933" }}>0.75x to 4x</div>
              <div style={{ marginTop: "4px", fontSize: "15px", color: "#C9CFF0" }}>listen at your own speed</div>
            </div>
            <div>
              <div style={{ fontFamily: "var(--font-unbounded), sans-serif", fontWeight: "700", fontSize: "26px", color: "#FFC933" }}>Offline</div>
              <div style={{ marginTop: "4px", fontSize: "15px", color: "#C9CFF0" }}>progress saves and syncs later</div>
            </div>
          </div>
        </div>
      </section>
      <section style={{ width: "100%" }}>
        <div className={s.pad} style={{ maxWidth: "1200px", margin: "0 auto", padding: "88px 24px", boxSizing: "border-box", display: "flex", flexWrap: "wrap", gap: "48px", alignItems: "center" }}>
          <div style={{ flex: "1 1 420px", minWidth: "0" }}>
            <h2 className={s.h2} style={{ margin: "0", fontFamily: "var(--font-unbounded), sans-serif", fontWeight: "700", fontSize: "36px", lineHeight: "1.15", letterSpacing: "-0.02em" }}>Compete if you like. Or don&apos;t.</h2>
            <p style={{ margin: "16px 0 0", color: "#46507A", maxWidth: "500px" }}>Streaks and points help on the days you need a push. Leaderboards are your choice: your cohort, only your own last week, or nothing at all.</p>
          </div>
          <div style={{ flex: "1 1 460px", minWidth: "0", background: "#FFFFFF", border: "1px solid #DCE0F2", padding: "24px", boxSizing: "border-box", display: "flex", flexDirection: "column", gap: "22px" }}>
            <div>
              <div style={{ fontSize: "14px", fontWeight: "700" }}>Show me</div>
              <ChoiceGroup />
            </div>
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "14px", color: "#46507A" }}>
                <span>12 day streak</span>
                <span>+50 XP on last week</span>
              </div>
              <div style={{ marginTop: "10px", display: "flex", gap: "8px" }}>
                <div style={{ flex: "1", display: "flex", flexDirection: "column", alignItems: "center", gap: "6px" }}>
                  <div style={{ width: "100%", maxWidth: "28px", height: "56px", borderRadius: "8px", background: "#2434E0" }} />
                  <span style={{ fontSize: "12px", color: "#46507A" }}>M</span>
                </div>
                <div style={{ flex: "1", display: "flex", flexDirection: "column", alignItems: "center", gap: "6px" }}>
                  <div style={{ width: "100%", maxWidth: "28px", height: "56px", borderRadius: "8px", background: "#2434E0" }} />
                  <span style={{ fontSize: "12px", color: "#46507A" }}>T</span>
                </div>
                <div style={{ flex: "1", display: "flex", flexDirection: "column", alignItems: "center", gap: "6px" }}>
                  <div style={{ width: "100%", maxWidth: "28px", height: "56px", borderRadius: "8px", background: "#2434E0" }} />
                  <span style={{ fontSize: "12px", color: "#46507A" }}>W</span>
                </div>
                <div style={{ flex: "1", display: "flex", flexDirection: "column", alignItems: "center", gap: "6px" }}>
                  <div style={{ width: "100%", maxWidth: "28px", height: "56px", borderRadius: "8px", background: "#2434E0" }} />
                  <span style={{ fontSize: "12px", color: "#46507A" }}>T</span>
                </div>
                <div style={{ flex: "1", display: "flex", flexDirection: "column", alignItems: "center", gap: "6px" }}>
                  <div style={{ width: "100%", maxWidth: "28px", height: "56px", borderRadius: "8px", background: "#2434E0" }} />
                  <span style={{ fontSize: "12px", color: "#46507A" }}>F</span>
                </div>
                <div style={{ flex: "1", display: "flex", flexDirection: "column", alignItems: "center", gap: "6px" }}>
                  <div style={{ width: "100%", maxWidth: "28px", height: "56px", borderRadius: "8px", background: "#FFC933" }} />
                  <span style={{ fontSize: "12px", color: "#46507A" }}>S</span>
                </div>
                <div style={{ flex: "1", display: "flex", flexDirection: "column", alignItems: "center", gap: "6px" }}>
                  <div style={{ width: "100%", maxWidth: "28px", height: "56px", borderRadius: "8px", background: "#DCE0F2" }} />
                  <span style={{ fontSize: "12px", color: "#46507A" }}>S</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
      <section style={{ width: "100%", background: "#2434E0", color: "#F6F7FB" }}>
        <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "72px 24px", boxSizing: "border-box", display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: "40px" }}>
          <div style={{ flex: "1 1 420px", minWidth: "0" }}>
            <h2 className={s.h2} style={{ margin: "0", fontFamily: "var(--font-unbounded), sans-serif", fontWeight: "700", fontSize: "40px", lineHeight: "1.12", letterSpacing: "-0.03em" }}>Answer one question. See where it takes you.</h2>
            <p style={{ margin: "16px 0 0", fontSize: "19px", color: "#EEF0FF", maxWidth: "480px" }}>Make an account only when you want to keep your progress.</p>
            <div style={{ marginTop: "32px", display: "flex", flexWrap: "wrap", gap: "14px" }}>
              <a href="#try" style={{ display: "inline-block", background: "#FFC933", color: "#0A0F2C", textDecoration: "none", fontWeight: "700", padding: "16px 30px" }}>Try it now</a>
              <CatalogLink />
            </div>
          </div>
          <div style={{ flex: "none" }}>
            <Dot mood="cheer" size={200} />
          </div>
        </div>
      </section>
      <footer style={{ width: "100%", background: "#0A0F2C", color: "#C9CFF0" }}>
        <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "44px 24px 36px", boxSizing: "border-box", display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: "24px" }}>
          <div>
            <Wordmark tone="dark" height={26} />
          </div>
          <nav aria-label="Footer" style={{ display: "flex", flexWrap: "wrap", gap: "4px 28px", fontSize: "15px" }}>
            <a href="#areas" style={{ color: "#C9CFF0", textDecoration: "none", padding: "10px 0" }}>Ways to learn</a>
            <a href="#how" style={{ color: "#C9CFF0", textDecoration: "none", padding: "10px 0" }}>How it works</a>
            <a href="#labs" style={{ color: "#C9CFF0", textDecoration: "none", padding: "10px 0" }}>Hands-on labs</a>
            <a href="#desktop" style={{ color: "#C9CFF0", textDecoration: "none", padding: "10px 0" }}>Desktop app</a>
            <a href="#dot" style={{ color: "#C9CFF0", textDecoration: "none", padding: "10px 0" }}>Meet Dot</a>
            <a href="#topics" style={{ color: "#C9CFF0", textDecoration: "none", padding: "10px 0" }}>What you can learn</a>
            <Link href="/catalog" style={{ color: "#C9CFF0", textDecoration: "none", padding: "10px 0" }}>Courses</Link>
            <Link href="/labs" style={{ color: "#C9CFF0", textDecoration: "none", padding: "10px 0" }}>Labs</Link>
            <Link href="/learn" style={{ color: "#C9CFF0", textDecoration: "none", padding: "10px 0" }}>All areas</Link>
            <span style={{ padding: "10px 0" }}>edorax.com</span>
          </nav>
        </div>
      </footer>
    </div>
  );
}
