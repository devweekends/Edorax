import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../../src/app.js";
import { prisma } from "../../src/db/prisma.js";
import { earnCredits } from "../../src/services/gamification/credits.js";
import { createCourseFixture } from "../helpers/fixtures.js";

const app = createApp();
let fx: Awaited<ReturnType<typeof createCourseFixture>>;

beforeAll(async () => {
  fx = await createCourseFixture();
});

afterAll(async () => {
  await prisma.rewardInventory.deleteMany({ where: { userId: fx.learner.id } });
  await prisma.unlockedCosmetic.deleteMany({ where: { userId: fx.learner.id } });
  await prisma.creditEntry.deleteMany({ where: { userId: fx.learner.id } });
  await fx.cleanup();
});

const auth = () => ({ Authorization: `Bearer ${fx.learnerToken}` });

describe("rewards marketplace & public career identity", () => {
  it("charges Build Credits on every consumable purchase even after consuming back to zero", async () => {
    await prisma.$transaction((tx) => earnCredits(tx, fx.learner.id, `seed:${fx.tag}`, 600));

    // Buy 1st xp-boost (price: 220) -> 380 left
    const firstBuy = await request(app).post("/api/v1/learner/rewards/xp-boost/purchase").set(auth());
    expect(firstBuy.status).toBe(200);
    expect(firstBuy.body.data).toEqual({ balance: 380, owned: true, quantity: 1 });

    // Consume xp-boost -> quantity drops back to 0 (inventory row pruned)
    const used = await request(app).post("/api/v1/learner/rewards/xp-boost/use").set(auth());
    expect(used.status).toBe(200);
    expect(used.body.data.quantity).toBe(0);

    // Re-buy xp-boost (price: 220) -> must charge another 220 -> 160 left
    const secondBuy = await request(app).post("/api/v1/learner/rewards/xp-boost/purchase").set(auth());
    expect(secondBuy.status).toBe(200);
    expect(secondBuy.body.data).toEqual({ balance: 160, owned: true, quantity: 1 });

    // Third buy with only 160 credits must fail with 400
    const denied = await request(app).post("/api/v1/learner/rewards/xp-boost/purchase").set(auth());
    expect(denied.status).toBe(400);
  });

  it("buys and equips cosmetics idempotently and serves opt-in public profiles", async () => {
    const buy = await request(app).post("/api/v1/learner/rewards/sparkle-trail/purchase").set(auth());
    expect(buy.status).toBe(200);
    expect(buy.body.data).toEqual({ balance: 110, owned: true, quantity: 0 });

    // Re-buying an owned cosmetic is a free no-op
    const rebuy = await request(app).post("/api/v1/learner/rewards/sparkle-trail/purchase").set(auth());
    expect(rebuy.status).toBe(200);
    expect(rebuy.body.data).toEqual({ balance: 110, owned: true, quantity: 0 });

    const equip = await request(app)
      .patch("/api/v1/learner/rewards/active")
      .set(auth())
      .send({ rewardId: "sparkle-trail" });
    expect(equip.status).toBe(200);

    // Opt in to public Career Identity profile and verify unauthenticated /api/v1/public/profiles/:slug
    const settings = await request(app)
      .patch("/api/v1/learner/public-profile")
      .set(auth())
      .send({ profilePublic: true, headline: "Systems Builder", learningInPublic: true });
    expect(settings.status).toBe(200);
    expect(settings.body.data.profilePublic).toBe(true);
    const slug = settings.body.data.publicSlug as string;
    expect(slug).toBeTruthy();

    const pub = await request(app).get(`/api/v1/public/profiles/${slug}`);
    expect(pub.status).toBe(200);
    expect(pub.body.data).toMatchObject({
      slug,
      headline: "Systems Builder",
      learningInPublic: true,
      cosmetic: "sparkle",
    });
  });
});
