import { prisma } from "../../db/prisma.js";
import { type IntegrityEventType, type IntegrityRisk, scoreIntegrityRisk } from "../../shared/api/integrity.js";

/** The review-queue hint for one attempt, computed from its stored events. Never stored, never shown to learners. */
export async function riskForAttempt(attemptId: string): Promise<IntegrityRisk> {
  const grouped = await prisma.integrityEvent.groupBy({ by: ["type"], where: { attemptId }, _count: { _all: true } });
  const counts: Partial<Record<IntegrityEventType, number>> = {};
  for (const row of grouped) counts[row.type] = row._count._all;
  return scoreIntegrityRisk(counts);
}
