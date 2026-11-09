import express from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import helmet from "helmet";
import { pinoHttp } from "pino-http";
import { env, isTest, realtimeOrigins } from "./config/env.js";
import { logger } from "./utils/logger.js";
import { apiLimiter } from "./middlewares/rate-limit.js";
import { errorHandler, notFoundHandler } from "./middlewares/error-handler.js";
import routes from "./routes/index.js";
import { NOTIFICATION_STREAM_PATH } from "./shared/api/notifications.js";

/** Builds the Express app without listening, so tests can drive it with supertest. */
export function createApp() {
  const app = express();

  // Behind the Next.js proxy / a load balancer: trust one hop so req.ip is the client.
  app.set("trust proxy", 1);
  app.disable("x-powered-by");

  // JSON API for other origins: CSP/COEP protect nothing here and would break the
  // few redirects we serve. HSTS belongs to the TLS terminator.
  app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false, hsts: false }));

  // Same-origin traffic arrives through the frontend proxy (no Origin check needed).
  // CORS_ORIGINS is for clients that call the API host directly. The notification stream may also
  // be opened straight from the web app (APP_URL); it authenticates with a ticket, not a cookie.
  app.use(
    cors((req, callback) => {
      const allowed = req.path === NOTIFICATION_STREAM_PATH ? realtimeOrigins : env.CORS_ORIGINS;
      callback(null, {
        origin: (origin, done) => {
          if (!origin || allowed.includes(origin)) return done(null, true);
          done(new Error(`Origin ${origin} is not allowed`));
        },
        credentials: true,
      });
    })
  );

  app.use(express.json({ limit: "1mb" }));
  app.use(cookieParser());

  if (!isTest) {
    // The notification stream is skipped: it stays open for hours and its URL carries a ticket.
    app.use(
      pinoHttp({
        logger,
        autoLogging: { ignore: (req) => req.url === "/health" || !!req.url?.startsWith(NOTIFICATION_STREAM_PATH) },
      })
    );
  }

  app.use(apiLimiter);
  app.use(routes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
