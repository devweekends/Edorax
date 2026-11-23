// Puts MediaPipe's face-detection files where the app can load them offline.
// Run once after `pnpm add -D @mediapipe/tasks-vision`:
//   node scripts/fetch-face-model.mjs [publicDir]      (default: ./public)
// Optional: without these files the quiz works and only the face check is off.
import { cp, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const publicDir = path.resolve(process.argv[2] ?? "public");
const target = path.join(publicDir, "mediapipe");
const pkg = "node_modules/@mediapipe/tasks-vision";
const MODEL =
  "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite";

await mkdir(target, { recursive: true });
await cp(path.join(pkg, "wasm"), path.join(target, "wasm"), {
  recursive: true,
});
await cp(
  path.join(pkg, "vision_bundle.mjs"),
  path.join(target, "vision_bundle.mjs"),
);
const response = await fetch(MODEL);
if (!response.ok) throw new Error(`Model download failed: ${response.status}`);
await writeFile(
  path.join(target, "blaze_face_short_range.tflite"),
  Buffer.from(await response.arrayBuffer()),
);
console.log(`Face files ready in ${target}`);
