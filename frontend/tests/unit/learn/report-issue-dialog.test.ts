import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/server/actions/lesson-report", () => ({
  reportLessonIssue: vi.fn(),
}));

import { ReportIssueDialog } from "@/components/help/report-issue-dialog";

describe("ReportIssueDialog", () => {
  it("renders a minimal icon-only report button without a visible text label", () => {
    const html = renderToStaticMarkup(
      createElement(ReportIssueDialog, {
        courseId: "course-1",
        chapterId: "chapter-1",
        chapterTitle: "01.01 Introduction",
      })
    );

    expect(html).toContain('aria-label="Report an issue with this lesson"');
    expect(html).toContain('title="Report an issue with this lesson"');
    // Minimal icon trigger only — no visible "Report" button text before the dialog opens.
    expect(html).not.toContain(">Report</span>");
  });
});
