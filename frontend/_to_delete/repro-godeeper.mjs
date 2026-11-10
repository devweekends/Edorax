import { compile } from "@mdx-js/mdx";
import remarkGfm from "remark-gfm";
import rehypePrettyCode from "rehype-pretty-code";

const SRC = `<GoDeeper title="Go deeper: the nine parts in a few lines">

The **client** and the **daemon** are two programs. The daemon, \`dockerd\`, builds and starts.

The map shows the path of a command. With the \`live-restore\` setting, containers keep running.

</GoDeeper>
`;

const INDENTED = `<GoDeeper title="Go deeper">
  The **client** and the **daemon** are two programs, \`dockerd\` builds.

  The map shows the path of a command.
</GoDeeper>
`;

const opts = {
  theme: { light: "github-light", dark: "github-dark" },
  defaultLang: { block: "plaintext", inline: "" },
  bypassInlineCode: true,
  keepBackground: false,
  grid: true,
};

const cases = [
  ["blank-line  | gfm only", SRC, { remarkPlugins: [remarkGfm], rehypePlugins: [] }],
  ["blank-line  | gfm+pretty", SRC, { remarkPlugins: [remarkGfm], rehypePlugins: [[rehypePrettyCode, opts]] }],
  ["indented    | gfm only", INDENTED, { remarkPlugins: [remarkGfm], rehypePlugins: [] }],
  ["indented    | gfm+pretty", INDENTED, { remarkPlugins: [remarkGfm], rehypePlugins: [[rehypePrettyCode, opts]] }],
];

for (const [label, src, plugins] of cases) {
  try { await compile(src, plugins); console.log(label, "=> OK"); }
  catch (e) { console.log(label, "=> FAILED:", e.message); console.log(e.stack.split("\n").slice(1,5).join("\n")); }
}
