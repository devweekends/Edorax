import Link from "next/link";
import {
  ArrowLeft,
  BarChart3,
  BookOpen,
  MessageSquareText,
  ShieldCheck,
  Users,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { CourseMenteesView } from "@/shared/api/teach";

export function MenteesHeader({ view }: { view: CourseMenteesView }) {
  const { course, summary } = view;
  return (
    <header>
      <Link
        href="/courses"
        className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" /> Your courses
      </Link>
      <div className="mt-3 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate text-sm font-medium text-muted-foreground">
              {course.title}
            </p>
            <Badge
              variant={course.status === "PUBLISHED" ? "secondary" : "outline"}
              className="capitalize"
            >
              {course.status.toLowerCase()}
            </Badge>
          </div>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">
            Mentees
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Monitor this cohort, respond to learners, and open a complete
            evaluation when evidence needs review.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href={`/courses/${course.slug}/edit`}
            className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
          >
            <BookOpen /> Course
          </Link>
          <Link
            href={`/review?courseId=${course.id}`}
            className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
          >
            <MessageSquareText /> Reviews
            {summary.pendingReviews ? ` (${summary.pendingReviews})` : ""}
          </Link>
          <Link
            href={`/courses/${course.slug}/reports`}
            className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
          >
            <BarChart3 /> Reports
          </Link>
          <Link
            href={`/courses/${course.slug}/integrity`}
            className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
          >
            <ShieldCheck /> Integrity
          </Link>
          <a
            href="#invite-mentees"
            className={cn(buttonVariants({ size: "sm" }))}
          >
            <Users /> Invite learners
          </a>
        </div>
      </div>
    </header>
  );
}
