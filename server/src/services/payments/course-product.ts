import { prisma } from "../../db/prisma.js";
import { logger } from "../../utils/logger.js";
import { getPolarClient } from "./polar.js";

export type CourseForProduct = {
  id: string;
  slug: string;
  title: string;
  description?: string | null;
  priceCents: number;
  currency: string;
};

/**
 * The Polar product for a course, created on its first checkout so no course has to be set up
 * in the Polar dashboard. The id is saved on the course and reused after that.
 *
 * The product's own price is only a label: every checkout pins the learner's amount due as an
 * ad-hoc price, so a later course price change or coupon never needs the product updated.
 */
export async function ensureCoursePolarProduct(course: CourseForProduct): Promise<string> {
  const saved = await prisma.course.findUnique({ where: { id: course.id }, select: { polarProductId: true } });
  if (saved?.polarProductId) return saved.polarProductId;

  const polar = getPolarClient();
  const product = await polar.products.create({
    name: course.title,
    description: course.description?.slice(0, 1000) || null,
    // Private: reachable only through checkouts the server creates, never listed publicly.
    visibility: "private",
    recurring_interval: null,
    prices: [
      {
        amount_type: "fixed",
        price_amount: Math.max(course.priceCents, 50),
        price_currency: course.currency.trim().toLowerCase() as "usd",
      },
    ],
    metadata: { courseId: course.id, courseSlug: course.slug },
  });

  // Two first checkouts at once can both create a product; the first one saved wins.
  const claimed = await prisma.course.updateMany({
    where: { id: course.id, polarProductId: null },
    data: { polarProductId: product.id },
  });
  if (claimed.count) return product.id;

  const winner = await prisma.course.findUnique({ where: { id: course.id }, select: { polarProductId: true } });
  await polar.products.update(product.id, { is_archived: true }).catch((error: unknown) => {
    logger.warn({ err: error, productId: product.id, courseId: course.id }, "could not archive duplicate Polar product");
  });
  if (!winner?.polarProductId) throw new Error("The course's Polar product could not be saved.");
  return winner.polarProductId;
}
