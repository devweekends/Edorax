import type { JsxComponentDescriptor } from "@mdxeditor/editor";
import { createFlowDescriptor, createTextDescriptor } from "./editor-descriptor-utils";

export const contentBlockDescriptors: JsxComponentDescriptor[] = [
  createFlowDescriptor("Step", [{ name: "title" }, { name: "description" }, { name: "content" }], true),
  createFlowDescriptor("MermaidDiagram", [{ name: "title" }, { name: "chart", required: true }, { name: "legend" }]),
  createFlowDescriptor("StateMachine", [{ name: "title" }, { name: "chart", required: true }, { name: "legend" }]),
  createFlowDescriptor("EntityDiagram", [{ name: "title" }, { name: "chart", required: true }, { name: "legend" }]),
  createFlowDescriptor(
    "ComparePanel",
    [
      { name: "title" },
      { name: "leftLabel" },
      { name: "leftContent" },
      { name: "rightLabel" },
      { name: "rightContent" },
    ],
    false
  ),
  createFlowDescriptor(
    "CompareColumn",
    [{ name: "label", required: true }, { name: "content" }],
    false
  ),
  createFlowDescriptor("FileTree", [{ name: "title" }, { name: "root" }], false),
  createFlowDescriptor(
    "FileTreeItem",
    [
      { name: "path", required: true },
      { name: "highlight", type: "expression" },
      { name: "new", type: "expression" },
    ],
    false
  ),
  createFlowDescriptor("TerminalBlock", [{ name: "title" }, { name: "cwd" }], false),
  createFlowDescriptor("TerminalLine", [{ name: "type" }, { name: "content" }], false),
  createFlowDescriptor("DiffBlock", [
    { name: "title" },
    { name: "language" },
    { name: "before" },
    { name: "after" },
  ]),
  createFlowDescriptor("ArchitectureDiagram", [{ name: "title" }], false),
  createFlowDescriptor("ArchNode", [{ name: "layer", required: true }, { name: "label" }], false),
  createFlowDescriptor("TraceRequest", [{ name: "title" }], false),
  createFlowDescriptor("InteractiveCanvas", [{ name: "slug", required: true }]),
  createFlowDescriptor(
    "TraceStep",
    [
      { name: "actor" },
      { name: "label", required: true },
      { name: "detail" },
      { name: "status", type: "expression" },
    ],
    false
  ),
  createFlowDescriptor("FaqGroup", [{ name: "title" }], false),
  createFlowDescriptor(
    "FaqItem",
    [{ name: "question", required: true }, { name: "answer" }],
    false
  ),
  createFlowDescriptor("CheckpointIntro", [{ name: "title" }, { name: "content" }], false),
  createFlowDescriptor("GoDeeper", [{ name: "title" }], true),
  createFlowDescriptor("BigWordAlert", [
    { name: "term", required: true },
    { name: "plainEnglish", required: true },
    { name: "whyItMatters" },
  ], false),
  createFlowDescriptor("InterestingRead", [
    { name: "title", required: true },
    { name: "hook", required: true },
    { name: "readMinutes", type: "number" },
    { name: "body" },
  ], false),
  createFlowDescriptor("RealWorldEvent", [
    { name: "title", required: true },
    { name: "when", required: true },
    { name: "summary", required: true },
    { name: "lesson" },
  ], false),
  createFlowDescriptor("ApiRequestPanel", [{ name: "title" }], false),
  createFlowDescriptor("ApiRequest", [
    { name: "method", required: true },
    { name: "url", required: true },
    { name: "description" },
    { name: "responseStatus", type: "number" },
    { name: "requestBody", type: "expression" },
    { name: "responseBody", type: "expression" },
    { name: "headers", type: "expression" },
  ], false),
  createTextDescriptor("GlossaryTerm", [
    { name: "term", required: true },
    { name: "definition", required: true },
  ]),
];
