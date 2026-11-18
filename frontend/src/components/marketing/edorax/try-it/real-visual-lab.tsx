"use client";

import { HldBoard, type RunScore } from "@buildment/learning-ui/labs/HldBoard";
import { getLabSpec } from "@buildment/learning-ui/labs/registry";

export const LANDING_LAB_SLUG = "hld-m4-three-tiers";

/**
 * The real visual lab, opened full screen from the landing page. This module pulls in
 * the board and its drawing library, so it is only ever loaded when a visitor presses
 * Launch visual lab.
 */
export default function RealVisualLab({ onClose, onRunDone }: { onClose: () => void; onRunDone: (score: RunScore) => void }) {
  const spec = getLabSpec(LANDING_LAB_SLUG);
  if (!spec || spec.family !== "hld") return null;
  return <HldBoard spec={spec} initialFullscreen onExitFullscreen={onClose} onRunDone={onRunDone} />;
}
