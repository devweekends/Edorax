import express from "express";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { requireInstructorWithdrawals } from "../../src/middlewares/instructor-withdrawals.js";

const app = express();
app.post("/withdraw", requireInstructorWithdrawals, (_req, res) => res.sendStatus(204));
app.use((error: { statusCode: number }, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  res.sendStatus(error.statusCode);
});

afterEach(() => vi.unstubAllEnvs());

describe("instructor withdrawal feature flag", () => {
  it("blocks requests even if an environment variable tries to enable it", async () => {
    vi.stubEnv("INSTRUCTOR_WITHDRAWALS_ENABLED", "true");
    expect((await request(app).post("/withdraw")).status).toBe(404);
  });
});
