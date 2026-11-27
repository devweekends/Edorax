# Edorax learner app: UX audit

Scope: the logged-in learner app in `frontend/` and the reader and quiz pieces in `packages/learning-ui/`. Flows covered: course list, course page, chapter reader (canvases, listen-along audio, quizzes with the Start gate), progress, profile.

How it was done: every flow was read in code on `origin/main` (acba25a9). The learner pages all need the API, so only pages that do not (sign-in) were opened in a local preview. Nothing below was measured on a real phone, so sizes are taken from the class names. Treat them as strong hints, not test results.

Who we design for: second-language learners, mostly on phones, often on weak or metered connections. That means short plain sentences, 44px touch targets, 16px body text, few downloads, and no dead ends.

Ranked by impact on a learner. Each item says where, why it hurts, and the fix.

**Status (2026-11-28).** Items 1, 2 and 3 were fixed in `38246b3c` (new Start gate, result card, unanswered note). Item 4 is partly done: the phone header is now back, title, contents, help and account, each a 44px target, and dark mode is in the account menu. Item 7 is fixed (the error page speaks to the learner, and developer detail shows only in development). The descriptions below are the original findings from before those changes.

## 1. The quiz Start gate is a wall of text, and closing it starts the quiz

- Where: `frontend/src/components/learn/quiz-integrity-panel.tsx` (`IntegrityDialog`).
- Problem: before the first question the learner gets a full-screen dialog with a title, a subtitle, a two-column list of what the mentor can see, and, when the camera is on, a four-fact grid (photo size in pixels, retention days, who sees it). The X button and the Esc key both start the quiz without the camera. The button is labelled "Start quiz" for screen readers but looks like Close.
- Why it hurts: this is the most stressful moment in the course and the text is the longest in the app. A learner who reads English slowly has to decide about a camera from a pixel size. Anyone who dismisses it expecting to cancel is now inside a timed-feeling quiz.
- Fix: three short lines (how many questions, that mentors can see leaving the page, that the camera is optional) and one big Start button. Put the full list behind "What gets noted". Add a real "Not now" that goes back to the chapter. Remove the pixel and retention facts from the first view. Design: `Quiz start` screen in the canvas.

## 2. Quiz result is a thin strip below the questions

- Where: `quiz-chapter-session-client.tsx` (the `scoreSummary` block, header line, footer).
- Problem: after Submit the score appears as small text under the title ("Multiple-choice score 3/5 · 2 to retry") and as a bordered strip at the bottom. The view then jumps to the first missed question. The word "retry" toggles a mode that silently hides the correct questions.
- Why it hurts: the learner does not get a clear "you finished, here is where you stand". The jump looks like the page broke. Hidden questions make "Review all questions" hard to understand.
- Fix: a result card with a big score, one sentence, and one main button ("Retry 2 missed questions"). Review stays one tap away. Perfect score gets a calm celebration with Dot (and only here). Design: `Quiz result`.

## 3. Unanswered questions are handled with a browser `confirm()`

- Where: `submitQuiz` in `quiz-chapter-session-client.tsx`.
- Problem: the text is "N questions are unanswered. Submit anyway? Unanswered questions will be marked incorrect." in the browser's own dialog.
- Why it hurts: native dialogs are in the phone's language, not the course's, are easy to dismiss by mistake, and give no way to jump to the missing question.
- Fix: before submit, show an inline line in the footer: "2 questions are not answered: 3 and 5" with tappable numbers. Submit stays available, with the consequence stated once.

## 4. The reader header is crowded on a phone

- Where: `chapter-reader-shell.tsx` header, with `CheckpointHeaderLabel`, `StudyClock`, `AskHelpDialog`, `TocToggle`, `UserMenuDropdown`.
- Problem: at 390px the one header row holds a sidebar toggle, the breadcrumb, a checkpoint label, the study clock, Ask for help, the contents toggle and the user menu. Theme and focus mode hide under `sm`, so they cannot be reached at all on a phone. The reader is also a fixed `h-[100dvh]` box with its own scroll, so the browser bars never collapse and the page loses height.
- Why it hurts: tap targets collide, the chapter title is cut to nothing, and the controls a phone user needs (contents, help) compete with controls they do not (theme, clock).
- Fix: a header with back, the chapter title and one "More" menu. Contents and Help move to a bottom bar. The study clock goes inside More. Progress stays as a thin line. Design: `Chapter reader`, phone.

## 5. Listen-along player: small controls, cramped row

- Where: `frontend/src/components/learn/chapter-audio.tsx`.
- Problem: the play button is `size-10` (40px), the download link is an icon with `p-2` (about 32px), and the speed `<select>` is about 28px high. All of them share one row with the title at phone width.
- Why it hurts: missed taps, and the download (which matters most on weak internet) is the smallest control with no visible label. The idea of "nothing downloads until you press play" is good but is only said after pressing.
- Fix: 48px play button, speed as a tappable chip, and a text button "Save for offline, 4.2 MB" on its own line. Keep the saved position and the error message. Keep `preload="none"`.

## 6. Four font families load on every page

- Where: `frontend/src/app/layout.tsx` (Inter, JetBrains Mono, Space Grotesk, IBM Plex Sans in three weights).
- Problem: Space Grotesk and IBM Plex are used only by the system design lab board, but every route pays for them.
- Why it hurts: extra requests and text that flashes on slow connections.
- Fix: Edorax needs two families (DM Sans for body, Unbounded for headings). Load them with `next/font`, keep JetBrains Mono only where code appears, and load the lab fonts only on the lab route. The theme step swapped Inter for DM Sans and added Unbounded, so the count is still five until the lab fonts move to the lab route. That move is left for the page work.

## 7. The chapter error page talks to developers

- Where: `frontend/src/app/(learn)/courses/[courseSlug]/[chapterSlug]/error.tsx`.
- Problem: one branch tells the learner "An admin should run `pnpm db:ready` and restart the dev server". Another prints `ref: <digest>` in small amber text. The whole card is amber, which reads as a warning, not as "we will fix this".
- Why it hurts: a learner sees an instruction they cannot act on and assumes they broke something.
- Fix: one calm sentence, Try again, Go to the course, Ask your mentor. Show developer text only when `NODE_ENV` is `development`. Dot looks puzzled. Design: `Error`.

## 8. Dot replaces a heavy, talkative mascot that speaks during quizzes

- Where: `frontend/src/components/mascot/*`, rules in `frontend/src/shared/engagement/rules.ts`, mounted in `app/(learn)/layout.tsx`.
- Problem: the current mascot is a rigged character with voice clips (`public/sounds` 1.4 MB, `public/mascots` 1.1 MB). Rules such as `quiz-first-miss` and `quiz-repeat-miss` fire on `quiz_submitted`, so a bubble can appear while the learner is still inside the quiz.
- Why it hurts: weak connections pay for audio and images that are not the lesson, and a comment right after a wrong answer in the middle of a quiz feels like pressure.
- Fix: Dot is one inline SVG, no audio. Rules: one short sentence, silent during a quiz, one nudge then silence, honest praise, no streak shaming. Remove the quiz-time reactions, keep perfect score and retry-passed after the quiz ends.

## 9. Progress page leads with numbers, not with "what next"

- Where: `frontend/src/app/(learn)/(main)/progress/page.tsx`, `components/learn/progress/activity-insights.tsx`.
- Problem: the page opens with four metric cells (including "Scored accuracy"), then insights, then a list titled "Saved without a retry" ("These checks counted on a wrong answer because retry was off"), then per-course cards with nested expanders. Status words such as "Needs review" are small red text.
- Why it hurts: the page is for checking in, but the next step (Continue) is at the bottom of each course card. Words like "scored accuracy" and "closed wrong" are hard for a second-language reader, and red "Needs review" reads as failure.
- Fix: top of the page is the streak, this week, and one Continue button. Courses and modules follow. Rename "Saved without a retry" to "Questions to look at again". Use words like "Getting there" instead of red labels. Design: `Progress`.

## 10. Empty and error states are a grey icon and one line

- Where: progress (`No progress to show yet`), course page (`You don't have access`, `Payment required`), catalog (`No published courses yet.`), `canvas/InteractiveCanvas.tsx` (`CanvasUnavailable`).
- Problem: a lock or book icon, one `text-sm` line, one small button. The progress empty state says "Assigned courses will appear here", which is wrong for someone who enrolled themselves.
- Why it hurts: dead ends. The learner does not know what to do next, and the tone is cold.
- Fix: one component with Dot, a one-line reason, and one next action. The canvas fallback keeps its quiet note (it already says the text carries the idea). Design: `Empty and error states`.

## 11. Developer notes shown as learner copy

- Where: `catalog/page.tsx` ("Paid courses use a checkout stub until Stripe is connected."), `quiz-chapter-session-client.tsx` ("instant short answers use your OpenRouter key and count when correct.").
- Why it hurts: it exposes internal setup to learners and adds a long sentence to the quiz header.
- Fix: remove the Stripe line. Say "Short answers are checked instantly when you add your own AI key in Settings" only where it applies, once, inside the question.

## 12. Course cards: a small button inside a card, and 12px labels

- Where: `components/learn/catalog-course-card.tsx`, `catalog/page.tsx`.
- Problem: only the "View details" button is a link; the cover and title are not. The meta line (difficulty, hours, "Enrolled") is 12px, difficulty in uppercase.
- Why it hurts: a big card with a small target, and uppercase small text is the hardest to read in a second language.
- Fix: the whole card is the link, meta at 14px in sentence case, a clear progress line for enrolled courses, price or "Free" as plain text. Design: `Course list`.

## 13. Quiz options use the wrong ARIA and 14px text

- Where: `packages/learning-ui/src/components/learn/quiz-options.tsx`.
- Problem: a `ul role="listbox"` holds `li` items that wrap `button role="option"`. A listbox must contain options directly, so screen readers read it badly. Single-choice questions are not announced as a radio group. Option text is `text-sm`.
- Why it hurts: assistive technology users get a broken control, and 14px answer text is small for the part of the page that matters most.
- Fix: `radiogroup` with radios for single answer and checkboxes for multiple, text at 16px, whole row as the target. Correct and wrong answers keep their icon so colour is not the only signal.

## 14. Colours and tiny text are hard-coded, not tokens

- Where: across `frontend/src` and `packages/learning-ui/src`: about 1,465 uses of fixed palette classes (`emerald-`, `amber-`, `violet-`, `red-`, `neutral-` and so on) and about 198 uses of 9 to 11px text. Examples: `nav-bar.tsx` badge (`bg-neutral-900`), quiz progress bar (`dark:bg-emerald-500`), module gate (`violet-`), error page (`amber-`).
- Why it hurts: the rebrand reaches only part of the app, and the 11px text is below a comfortable size for anyone reading a second language.
- Fix: this work swaps the tokens, so everything that uses `primary`, `muted`, `border` and `card` becomes Edorax at once. The fixed colours are a follow-up sweep, page by page, together with the minimum text size (12px floor, 14px for content).

## 15. Settings and profile: long single column with a cover photo

- Where: `settings/profile/page.tsx`, `components/auth/profile-settings-hero.tsx`.
- Problem: a hero built from the featured course cover (an image download), then profile, AI key, game preferences and password in one long column.
- Why it hurts: an image on the page that is only decoration, and the learner has to scroll past the AI key and game options to reach the password.
- Fix: a plain header with name and photo, a short list of sections (Profile, Study goals, AI key, Password) as a tabbed or anchored list. Drop the cover image.

## What already works (keep it)

- Audio does not download until the learner presses play, and the position is remembered.
- Interactive canvases render their starting state on the server, so they are readable before scripts arrive.
- Reader text is about 18px with a 40rem line, a good width for reading.
- Quiz drafts are saved to local storage, so a lost connection does not lose answers.
- Info tips are popovers, so they work on touch.
- The chapter error page already offers a way forward (try again, next lesson, ask mentor). Only its tone and wording need work.

## Suggested order of work

1. Tokens, fonts and logo (done on this branch).
2. Quiz: Start gate, result card, inline unanswered notice, ARIA fix (items 1, 2, 3, 13).
3. Reader header and audio player (items 4, 5).
4. Empty and error states with Dot, mascot swap (items 7, 8, 10).
5. Course list card and progress page (items 9, 12).
6. Copy cleanup, hard-coded colour sweep, lab fonts, profile (items 6, 11, 14, 15).
