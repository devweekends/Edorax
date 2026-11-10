"use client";

import { Component, type ReactNode } from "react";

type Props = { name?: string; children: ReactNode };
type State = { message: string | null };

/**
 * Keeps one failing block from blanking a whole chapter. Every uppercase MDX
 * component is wrapped in this boundary by compile.tsx, so a throw renders an
 * inline card naming the block instead of taking out the page. Errors raised
 * while MDX itself compiles happen before any block renders; the
 * chapter-level boundary around <MDXRemote> catches those.
 */
export class MdxBlockBoundary extends Component<Props, State> {
  state: State = { message: null };

  static getDerivedStateFromError(error: unknown): State {
    return { message: error instanceof Error ? error.message : String(error) };
  }

  render() {
    if (this.state.message === null) return this.props.children;
    return (
      <div
        role="alert"
        className="my-6 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive"
      >
        <p className="font-medium">
          This block could not be displayed{this.props.name ? ` (${this.props.name})` : ""}.
        </p>
        <p className="mt-1 break-words font-mono text-xs opacity-80">{this.state.message}</p>
      </div>
    );
  }
}
