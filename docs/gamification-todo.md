# Gamification high-level to-do (working plan)

Source: `Buildment_Gamification_Design_Concepts.pdf` concept book + researched models
(Duolingo leagues/personal-records, PUBG seasonal tiers, Pluralsight mastery-gating) + Devmaxx
competitor signal.

## Status vs upstream (2026-10-31)
- **Phase 1 (league) largely landed upstream** in PR #161 `feat(leaderboard): multi-category hub with
  weekly leagues`: cross-course weekly league, Bronze→Diamond tiers, top 10% promote / bottom 20%
  demote at Monday 00:00 UTC, per-course board kept, hub UI + categories, privacy, "beat your best".
  Files: `services/gamification/league.ts`, `leaderboard-categories.ts`, `shared/gamification/leagues.ts`,
  migration `leaderboard_leagues`.
- **Two divergences from this plan's choices were shipped:**
  - Grouping is **tier-based (percentile)**, not the planned ~30-person random same-pace cohorts
    (they explicitly chose tiers over cohorts).
  - **Achievement promotion was not built** — only competitive percentile (top 10% / bottom 20%);
    no escalating XP-target promotion path.
- **Still open:** Phase 2 career ladder, Phase 3 Build Credits/marketplace, Phase 4 daily/monthly/
  recovery/mascot-loading + a dedicated **My Records** surface, Phase 5 share/experiments.

## Core decisions (locked)
- **Two layers**: a short-horizon **league** + a permanent **career ladder**, plus a **rewards** loop.
- **League = Duolingo-style, cross-course**: score is a learner's weekly XP across all their courses
  (summed once, no double-count); cohorts of ~30 formed by **random, roughly same-pace** matching;
  weekly reset Monday 00:00 UTC; promotion/demotion.
- **Achievement promotion** kept: promote via a *published escalating weekly target* OR *top-N of
  cohort*; **one promotion per week, at most one tier** (no double-jump); target escalates/anchored to
  prevent inflation.
- **Career = permanent, mastery-gated**: Intern → Junior → Mid → Senior → Staff → Principal, **never
  demoted**, advances on verified mastery (completions, quiz quality, mentor-approved work), not XP.
  **Demotion never touches the career level.**
- **Rewards**: lifetime XP never spent; Build Credits spendable on cosmetics (mascot collections /
  themes); **base mascot reactions stay free**; purchasing never boosts XP or career.
- **Privacy invariants stay**: opt-in, `gamificationHidden`, per-read eligibility, masked names.

## Decisions (resolved 2026-10-31)
- **Sparse cohorts**: allow partial cohorts with a minimum (e.g. ~5 actives) — no "not started".
- **Scope default**: the cross-course league is the **default**; the per-course board stays available
  where an org wants course-internal rankings.
- **Privacy**: masked names (first + last initial); no new exposure on the cross-course cohort.
- **Career naming**: fixed **Intern → Principal** first; org-configurable titles later.
- **Credits**: **earn-only** first; defer real-money purchasing.
- **Friction**: positive-only for an LMS (mentor grading is already the checkpoint) — no hearts.
- **Recovery**: League Shield / recovery quest **included**, ships with the league work.
- **Daily quests + monthly badge**: in scope, flag-gated.
- **Shareable cards**: only after the in-app profile lands.
- **Profile sharing:** **one shared profile page** (`/u/<slug>`) for both the signed-in owner (private
  context, owner-only affordances + private fields) and the public (read-only); permissions differ by
  viewer, not by having two separate profile pages.
- **My Records**: read-only, in scope.

## Phase 0 — Foundation
- [ ] Confirm the two-layer model as source of truth (decisions above are the locked scope)
- [ ] Feature-flag inventory: `GAMIFICATION_LEAGUE_TIERS`, `GAMIFICATION_CAREER_LEVELS`,
      `GAMIFICATION_CREDITS`, `GAMIFICATION_RECOVERY` (each `null` when off)

## Phase 1 — League (cross-course, Duolingo-style) — ✅ MAJORITY LANDED UPSTREAM (PR #161)
- [x] **Landed:** cross-course weekly league (global XP across all courses), weekly reset Monday 00:00
      UTC, tiers (Bronze→Diamond), top 10% / bottom 20% promotion & demotion, per-course board
      retained, hub UI + categories (`weekly_xp/global`, `all_time_xp/global`, `speed/global`,
      `streak/global`), privacy + "beat your best" bar.
- [ ] **Gap vs plan:** grouping is **tier-based**, not the planned ~30-person random same-pace cohorts
      (decide whether to adopt the shipped tiers or add real cohorts).
- [ ] **Gap vs plan:** **achievement promotion** (published escalating weekly-XP target) not built —
      only competitive percentile.
- [ ] Decouple from career: league demotion touches the league tier only; a permanent career ladder
      (Phase 2) does not exist yet, so nothing to decouple from today.
- [ ] Dashboard/league UI + tests: hub UI and `leaderboard-hub.test.ts` landed; confirm the rest.

## Phase 2 — Career ladder (permanent)
- [ ] **Define "mastery" in code** (verified signals advancing each tier) — do first; avoids inflation
- [ ] Career service + `GAMIFICATION_CAREER_LEVELS`; derive on read, record tier-up once
      (reuse `level_up` + mascot)
- [ ] `GamificationSummary.career` in `shared/api/gamification.ts` + `sync-shared`; profile career line
- [ ] Permanence: no demotion path; document `gamificationHidden` behaviour
- [ ] Tests: tier gating on mastery (not XP), once-only promotion, master-on-ledger

## Phase 3 — Rewards (Build Credits + marketplace)
- [ ] Build Credits wallet (permanent, spendable) separate from XP; **earn-only** (real-money
      purchasing deferred); earn rules (promotion bonus, course completion, quests)
- [ ] Rewards marketplace: mascot collections / themes in credits; **base reactions free**
- [ ] Enforce "purchasing never boosts XP / career"

## Phase 4 — Supporting loops & polish
- [ ] Daily quests → chests → XP-boost (mini dose loop)
- [ ] Monthly badge (quest-points + themed badge)
- [ ] **Recovery**: League Shield / recovery quest — **included** (ships with the league work)
- [ ] **My Records (personal bests)**: longest streak + best weekly XP/chapters are computed in the hub
      (PR #161); still missing a dedicated profile "My Records" surface + most-XP-in-a-day / best league
      finish lines; "New record!" celebration; read-only recognition
- [ ] Mascot loading/companion (Dot with a mood during skeleton loads)
- [ ] Weekly recap / Monday ritual surface
- [ ] Notifications: "last chance to promote", streak/recovery nudges

## Phase 5 — Share & validate
- [x] **Public Career Identity page (built):** opt-in `profilePublic` + unique `publicSlug`, `UserProfile.headline`
      + `learningInPublic`, unauth `GET /api/v1/public/profiles/:slug` (safe fields only; XP/league/streak
      suppressed when `gamificationHidden`), `/u/[slug]` page + mascot wearing the equipped cosmetic +
      Intern→Principal path, generated OG image (`/u/[slug]/opengraph-image`). Settings tab in
      `settings/profile` (enable, headline, copy link, view).
- [ ] **Shared profile page — one page for owner and public (role-aware).** The same `/u/[slug]` is the
      single profile surface, exactly as profiles were shared before; what you can do/see changes by viewer:
      - **Owner (signed in, viewing own profile):** sees the same page **plus owner-only affordances** —
        inline Edit (headline + visibility), Share, and private fields (e.g. Build Credits) that never
        render for anyone else. The owner can **always open their own page even when `profilePublic` is
        off** (private preview with an "only you can see this — publish to share" banner); the public
        gets 404 in that state.
      - **Public / other signed-in users:** the read-only card + Share only.
      - Field-level allowlist; `gamificationHidden` still suppresses XP/league/streak for everyone.
      - `/me` (or "Your profile") resolves to the owner's `/u/<slug>`.
      - Make the shared page the **front door**; the `settings/profile` → Public tab stays as the advanced
        editor (not a separate profile). Collapse the current split (public `/u/[slug]` vs settings editor).
- [ ] Accessibility + reduced-motion on the shared profile page.
- [ ] Opt-in shareable cards labelled cohort / category / global (if decided)
- [ ] Experiments: weekly-goal completion, week-4 retention, post-demotion return, reward redemption
      vs non-gamified control
- [ ] Per-app gates (`typecheck`/`lint`/`test`/`build`) + `sync-shared:check` on every merge

## Sequence
Phases 1 and 2 are independent and can run in parallel. Phase 3 needs Phase 2's "mastery = value"
definition to stay honest. Phase 4 slots after 1–2 land. Phase 5 is measurement and facing outward.

## Concept book review — gap analysis (2026-11-03)
Reviewed all 20 pages of `Buildment_Gamification_Design_Concepts_images/`. Status vs the shipped code:

| # | Concept | Status | Notes |
|---|---|---|---|
| 2 | Three loops (week / journey / rewards) | ✅ Done | League + career + rewards all exist |
| 12 | Reward economy (permanent XP vs spendable credits) | ✅ Done | XP permanent; credits wallet; +90 course, +45 promotion |
| 13 | Marketplace | ✅ Done | 12 cosmetics + consumables (beyond the concept's 4) |
| 15 | Career Identity profile | ✅ Done | + Records, Achievements (one-year depth, credit rewards), activity heatmap |
| 9 | Recovery — League Shield | ✅ Done | Shield consumable auto-consumed at reset to hold tier |
| 8 | League journey + separate identity | 🟡 Partial | Current tier + career path shown; no "Beginner" tier, XP thresholds, or explicit "Silver this week · Senior overall" |
| 6 | Winnable leaderboard / fairness | 🟡 Partial | Ranks + "beat your best" exist; no "why this feels fair / promotion secured" state |
| 11 | Category weekly track (routed XP) | 🟡 Partial | Hub has categories; no "choose a weekly track" + XP routing rule |
| 14 | Mascot family (8 reactions) | 🟡 Partial | Dot moods exist; the 8 named reactions + 0.8–2s motion/audio/reduced-motion not formalized |
| 16 | Share-card formats (3 branded) | 🟡 Partial | Share + OG image + per-achievement text; not the 3 generated card images |
| 17 | XP microinteraction | 🟡 Partial | XP awarding exists; subtle "+20 XP, 1.5s, return focus" UI not verified |
| 19 | Mobile fast screens | 🟡 Partial | Responsive exists; not the dedicated League/Rewards mobile layouts |
| 4/5 | Dashboard A/B (calm / arcade) | 🟡 Partial | Functional dashboard, not the exact layouts |
| 7 | **Achievement promotion (published weekly XP goal)** | ❌ Missing | Only percentile promotion (known Phase 1 gap) |
| 10 | **Monday ritual / weekly recap** | ❌ Missing | No promotion celebration + next-goal screen |
| 18 | **Weekly missions (quest board)** | ❌ Missing | No effort-based mission → credit loop |
| 9 | Recovery quest / pause week | ❌ Missing | Shield only |
| 20 | Experiments / measurement | ❌ Missing | Not built |

### Prioritized next work
- **P0:** (1) achievement promotion — published weekly XP target as an alternate promotion path; (2)
  Monday ritual / weekly recap (promotion result + credits + next goal); (3) weekly missions (quest →
  credits).
- **P1:** category weekly track (pick one, route XP, no double-count); league journey view with XP
  thresholds + separate identity; leaderboard "fair / promotion secured" state.
- **P2:** 3 branded share cards; mascot family reactions + motion/reduced-motion; XP microinteraction;
  recovery quest / pause week; dedicated mobile League/Rewards; experiments vs non-gamified control.

### Already solid
Leagues + tiers, career ladder, Build Credits economy, marketplace (incl. League Shield), the Career
Identity shared profile, Records, Achievements, and the activity heatmap.