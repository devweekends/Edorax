import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { RatingHappyDot, RATING_LABELS, StarRatingInput } from "@/components/learn/star-rating";
import { CourseRatingModal } from "@/components/learn/course-rating-modal";
import { CourseRatingCard } from "@/components/learn/course-rating-card";
import { ChapterCompleteCelebrationModal } from "@/components/learn/chapter-complete-celebration-modal";
import { playRatingPromptSound, playRatingStarSound, playRatingSubmitSound } from "@/lib/rating-sound";

vi.mock("@/server/actions/course-rating", () => ({
  saveCourseRatingAction: vi.fn(),
  dismissCourseRatingAction: vi.fn(),
}));

describe("course rating UI & sound effects", () => {
  it("keeps zero stars simple without rendering Dot", () => {
    const dotHtml = renderToStaticMarkup(createElement(RatingHappyDot, { rating: 0 }));
    expect(dotHtml).toBe("");

    const modalHtml = renderToStaticMarkup(
      createElement(CourseRatingModal, {
        open: true,
        onClose: () => undefined,
        courseSlug: "system-design",
        courseTitle: "System Design",
        badgeLabel: "Halfway milestone",
        dismissLabel: "Not now",
      }),
    );
    expect(modalHtml).toContain("How is System Design going?");
    expect(modalHtml).toContain("Halfway milestone");
    expect(modalHtml).toContain("Tap a star to rate");
    expect(modalHtml).toContain("Not now");
    expect(modalHtml).not.toContain("rating-happy-dot");
    expect(modalHtml).not.toContain("Dot, cheer");

    const cardHtml = renderToStaticMarkup(
      createElement(CourseRatingCard, {
        courseSlug: "system-design",
        courseTitle: "System Design",
        initialRating: null,
      }),
    );
    expect(cardHtml).not.toContain("rating-happy-dot");
  });

  it("renders Happy Dot yipping for every star rating (1 through 5)", () => {
    for (const stars of [1, 2, 3, 4, 5]) {
      const html = renderToStaticMarkup(createElement(RatingHappyDot, { rating: stars }));
      expect(html).toContain('data-testid="rating-happy-dot"');
      expect(html).toContain("dot-yip");
      expect(html).toContain('aria-label="Dot, cheer"');
      expect(html).toContain(RATING_LABELS[stars]!);
    }
  });

  it("renders StarRatingInput radio buttons and sound toggle cleanly", () => {
    const html = renderToStaticMarkup(
      createElement(StarRatingInput, { value: 4, onChange: () => undefined, size: "lg" }),
    );
    expect(html).toContain('aria-label="4 stars — Really good"');
    expect(html).toContain('aria-checked="true"');

    // Sound helpers safely no-op in non-browser/SSR environments without throwing.
    expect(() => {
      playRatingPromptSound();
      playRatingStarSound(0);
      playRatingStarSound(5);
      playRatingSubmitSound();
    }).not.toThrow();
  });

  it("does not ask for a course rating inside the chapter-end celebration modal", () => {
    const html = renderToStaticMarkup(
      createElement(ChapterCompleteCelebrationModal, {
        open: true,
        onClose: () => undefined,
        courseCompleted: 5,
        courseTotal: 5,
      }),
    );
    expect(html).toContain("You completed the course");
    expect(html).not.toContain("Submit review");
    expect(html).not.toContain("How was the course?");
  });
});
