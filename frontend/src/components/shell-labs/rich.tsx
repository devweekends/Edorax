import { Fragment } from "react";

/** `code` and **bold** in lab text. Nothing else is rendered, so lab text can never inject HTML. */
export function Rich({ text }: { text: string }) {
  return (
    <>
      {text.split(/(`[^`]+`|\*\*[^*]+\*\*)/g).map((part, index) =>
        part.startsWith("`") && part.endsWith("`") && part.length > 2 ? (
          <code key={index} className="rounded-sm bg-secondary px-1 py-0.5 font-mono text-[0.9em] text-foreground">
            {part.slice(1, -1)}
          </code>
        ) : part.startsWith("**") && part.endsWith("**") && part.length > 4 ? (
          <strong key={index}>{part.slice(2, -2)}</strong>
        ) : (
          <Fragment key={index}>{part}</Fragment>
        ),
      )}
    </>
  );
}
