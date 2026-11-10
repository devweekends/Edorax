import { describe, it } from "vitest";
import { compile } from "@mdx-js/mdx";
import remarkGfm from "remark-gfm";
import { readerRemarkPlugins } from "@/shared/mdx/reader-plugins";
import { rehypePrettyCodePlugins } from "@/mdx/rehype-pretty-code-config";
import { restoreInteractiveBlockTags } from "@/shared/mdx/restore-block-tags";
import { transformVisualFences } from "@/mdx/transform-visual-fences";
import { chapterBodyForReader } from "@/shared/lib/mdx-frontmatter";

const SRC = `<GoDeeper title="Go deeper: the nine parts in a few lines">

The **client** and the **daemon** are two programs. The daemon, \`dockerd\`, builds and starts.

The map shows the path of a command. With the \`live-restore\` setting, containers keep running.

</GoDeeper>
`;

describe("godeeper repro", () => {
  it("compiles", async () => {
    const transformed = transformVisualFences(chapterBodyForReader(SRC));
    const mdxSource = restoreInteractiveBlockTags(transformed);
    console.log("--- SOURCE AFTER TRANSFORM ---\n" + mdxSource + "\n--- END ---");
    try {
      await compile(mdxSource, {
        remarkPlugins: [remarkGfm, ...readerRemarkPlugins],
        rehypePlugins: rehypePrettyCodePlugins,
      });
      console.log("COMPILE OK");
    } catch (e) {
      console.log("COMPILE FAILED:", (e as Error).message);
      console.log((e as Error).stack);
    }
  });
});
