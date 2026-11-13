import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  course: { findUnique: vi.fn(), updateMany: vi.fn() },
}));
const products = vi.hoisted(() => ({ create: vi.fn(), update: vi.fn() }));

vi.mock("../../../../src/db/prisma.js", () => ({ prisma: db }));
vi.mock("../../../../src/services/payments/polar.js", () => ({
  getPolarClient: () => ({ products }),
}));
vi.mock("../../../../src/utils/logger.js", () => ({ logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() } }));

import { ensureCoursePolarProduct } from "../../../../src/services/payments/course-product.js";

const course = { id: "course_1", slug: "system-design", title: "System Design", description: "Design big systems.", priceCents: 1000, currency: "USD" };

describe("ensureCoursePolarProduct", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    products.update.mockResolvedValue({});
  });

  it("reuses the product saved on the course without calling Polar", async () => {
    db.course.findUnique.mockResolvedValue({ polarProductId: "prod_saved" });
    await expect(ensureCoursePolarProduct(course)).resolves.toBe("prod_saved");
    expect(products.create).not.toHaveBeenCalled();
  });

  it("creates a private one-time product named after the course and saves its id", async () => {
    db.course.findUnique.mockResolvedValue({ polarProductId: null });
    products.create.mockResolvedValue({ id: "prod_new" });
    db.course.updateMany.mockResolvedValue({ count: 1 });

    await expect(ensureCoursePolarProduct(course)).resolves.toBe("prod_new");
    expect(products.create).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "System Design",
        visibility: "private",
        recurring_interval: null,
        prices: [{ amount_type: "fixed", price_amount: 1000, price_currency: "usd" }],
        metadata: { courseId: "course_1", courseSlug: "system-design" },
      })
    );
    expect(db.course.updateMany).toHaveBeenCalledWith({
      where: { id: "course_1", polarProductId: null },
      data: { polarProductId: "prod_new" },
    });
  });

  it("keeps the product another checkout saved first and archives its own duplicate", async () => {
    db.course.findUnique.mockResolvedValueOnce({ polarProductId: null }).mockResolvedValueOnce({ polarProductId: "prod_first" });
    products.create.mockResolvedValue({ id: "prod_duplicate" });
    db.course.updateMany.mockResolvedValue({ count: 0 });

    await expect(ensureCoursePolarProduct(course)).resolves.toBe("prod_first");
    expect(products.update).toHaveBeenCalledWith("prod_duplicate", { is_archived: true });
  });
});
