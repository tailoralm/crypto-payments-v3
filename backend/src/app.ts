import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { z, ZodError } from "zod";
import db from "./db/knex";
import { AppError } from "./common/types";
import { assets } from "./core/domain";
import {
  fail,
  normalized,
  uuid,
  validAddress,
  walletInput,
} from "./core/domain";
import { settings, saveSettings, available } from "./core/settings";
import * as payments from "./core/payments";
import { dashboard } from "./core/reports";
import { billingView, pdf, emailPayment } from "./core/billing";
import { poll } from "./core/poller";

export const hash = (s: string) =>
  crypto.createHash("sha256").update(s).digest("hex");
const wrap =
  (fn: (req: any, res: Response) => Promise<any>) =>
  (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res)).catch(next);
  };
const authInput = z
  .object({
    email: z
      .email()
      .max(255)
      .transform((v) => v.toLowerCase()),
    password: z
      .string()
      .min(12)
      .max(72)
      .refine(
        (v) => Buffer.byteLength(v, "utf8") <= 72,
        "Password must not exceed 72 UTF-8 bytes.",
      ),
  })
  .strict();
const loginInput = z
  .object({
    email: z
      .email()
      .max(255)
      .transform((v) => v.toLowerCase()),
    password: z.string().min(1).max(72),
  })
  .strict();
const cookie = {
  httpOnly: true,
  secure: process.env.COOKIE_SECURE === "true",
  sameSite: "strict" as const,
  path: "/",
  maxAge: 7 * 86400000,
};
async function session(user: any, res: Response): Promise<void> {
  const refresh = crypto.randomBytes(32).toString("hex");
  const id = crypto.randomUUID();
  await db("sessions").insert({
    id,
    user_id: user.id,
    refresh_hash: hash(refresh),
    expires_at: new Date(Date.now() + 7 * 86400000),
  });
  res.cookie("refreshToken", refresh, cookie);
  res.json({
    access_token: jwt.sign(
      { id: user.id, sid: id, email: user.email },
      process.env.JWT_SECRET!,
      { expiresIn: "15m" },
    ),
    expires_in: 900,
  });
}
async function owner(req: any): Promise<string> {
  try {
    const token = req.headers.authorization?.replace(/^Bearer /, "");
    if (!token) throw new Error();
    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as any;
    if (
      !(await db("sessions")
        .where({ id: decoded.sid, user_id: decoded.id })
        .where("expires_at", ">", db.fn.now())
        .first())
    )
      throw new Error();
    return decoded.id;
  } catch {
    return fail(401, "UNAUTHORIZED", "Sign in to continue.");
  }
}
async function apiOwner(req: any): Promise<string> {
  const key = req.headers["x-api-key"];
  if (typeof key !== "string" || key.length > 255)
    fail(401, "INVALID_API_KEY", "A valid X-API-Key is required.");
  const token = await db("api_tokens")
    .where({ token_hash: hash(key) })
    .first();
  if (!token) fail(401, "INVALID_API_KEY", "A valid X-API-Key is required.");
  const s = await settings();
  if (s.rate_limit_enabled) {
    const bucket = "api:" + token.user_id;
    const result = await db.raw(
      `INSERT INTO api_buckets (key, count, reset_at) VALUES (?, 1, now() + (? * interval '1 minute')) ON CONFLICT (key) DO UPDATE SET count = CASE WHEN api_buckets.reset_at <= now() THEN 1 ELSE api_buckets.count + 1 END, reset_at = CASE WHEN api_buckets.reset_at <= now() THEN now() + (? * interval '1 minute') ELSE api_buckets.reset_at END RETURNING count, reset_at`,
      [bucket, s.rate_limit_window_minutes, s.rate_limit_window_minutes],
    );
    if (result.rows[0].count > s.rate_limit_max_requests)
      fail(
        429,
        "RATE_LIMIT_EXCEEDED",
        "API request limit reached. Retry after the configured window.",
      );
  }
  await db("api_tokens")
    .where({ id: token.id })
    .update({ last_used_at: db.fn.now() });
  return token.user_id;
}
export function createApp() {
  const app = express();
  app.set("trust proxy", Number(process.env.TRUST_PROXY_HOPS || 0));
  app.use(helmet({ referrerPolicy: { policy: "no-referrer" } }));
  if (process.env.CORS_ORIGIN)
    app.use(cors({ origin: process.env.CORS_ORIGIN, credentials: true }));
  app.use(express.json({ limit: "32kb" }), cookieParser());
  app.use((_req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    next();
  });
  app.get(
    "/health",
    wrap(async (_req, res) => {
      await db.raw("select 1");
      res.json({ status: "ok", timestamp: new Date().toISOString() });
    }),
  );
  app.get(
    "/auth/setup",
    wrap(async (_req, res) => {
      const user = await db("users").first();
      res.json({ setup_required: !user });
    }),
  );
  const authLimit = rateLimit({
    windowMs: 15 * 60000,
    limit: 30,
    standardHeaders: "draft-7",
    legacyHeaders: false,
  });
  app.post(
    "/auth/register",
    authLimit,
    wrap(async (req, res) => {
      const input = authInput.parse(req.body);
      const setup = process.env.SETUP_TOKEN;
      const supplied = req.headers["x-setup-token"];
      if (
        !setup ||
        typeof supplied !== "string" ||
        !crypto.timingSafeEqual(
          Buffer.from(hash(setup)),
          Buffer.from(hash(supplied)),
        )
      )
        fail(
          403,
          "SETUP_TOKEN_REQUIRED",
          "Enter the SETUP_TOKEN from your installation environment.",
        );
      const user = await db.transaction(async (trx) => {
        await trx("installation").where({ id: 1 }).forUpdate().first();
        if (await trx("users").first())
          fail(
            409,
            "SETUP_COMPLETE",
            "This installation already has an owner. Sign in.",
          );
        const [u] = await trx("users")
          .insert({
            email: input.email,
            password_hash: await bcrypt.hash(input.password, 12),
          })
          .returning(["id", "email"]);
        return u;
      });
      res.status(201);
      await session(user, res);
    }),
  );
  app.post(
    "/auth/login",
    authLimit,
    wrap(async (req, res) => {
      const input = loginInput.parse(req.body);
      const user = await db("users")
        .whereRaw("lower(email) = ?", [input.email])
        .first();
      if (!user || !(await bcrypt.compare(input.password, user.password_hash)))
        fail(401, "UNAUTHORIZED", "Email or password is incorrect.");
      await session(user, res);
    }),
  );
  app.post(
    "/auth/refresh",
    authLimit,
    wrap(async (req, res) => {
      const refresh = req.cookies.refreshToken;
      if (typeof refresh !== "string")
        fail(401, "UNAUTHORIZED", "Session expired. Sign in again.");
      const row = await db.transaction(async (trx) => {
        const s = await trx("sessions")
          .where({ refresh_hash: hash(refresh) })
          .where("expires_at", ">", trx.fn.now())
          .forUpdate()
          .first();
        if (!s) fail(401, "UNAUTHORIZED", "Session expired. Sign in again.");
        await trx("sessions").where({ id: s.id }).del();
        return trx("users").where({ id: s.user_id }).first();
      });
      await session(row, res);
    }),
  );
  app.post(
    "/auth/logout",
    wrap(async (req, res) => {
      if (typeof req.cookies.refreshToken === "string")
        await db("sessions")
          .where({ refresh_hash: hash(req.cookies.refreshToken) })
          .del();
      res.clearCookie("refreshToken", {
        path: "/",
        sameSite: "strict",
        secure: cookie.secure,
      });
      res.json({ message: "Signed out." });
    }),
  );
  app.get(
    "/wallets",
    wrap(async (req, res) => {
      const id = await owner(req);
      res.json(
        await db("wallets")
          .where({ user_id: id })
          .orderBy("created_at", "desc"),
      );
    }),
  );
  app.post(
    "/wallets",
    wrap(async (req, res) => {
      const id = await owner(req);
      const input = walletInput.parse(req.body);
      if (!validAddress(input.chain, input.address))
        fail(
          400,
          "VALIDATION_ERROR",
          "Invalid receiving address for this blockchain.",
        );
      const w = await db.transaction(async (trx) => {
        await trx("installation").where({ id: 1 }).forUpdate().first();
        const norm = normalized(input.chain, input.address);
        if (
          await trx("wallets")
            .where({ chain: input.chain, normalized_address: norm })
            .first()
        )
          fail(
            409,
            "WALLET_EXISTS",
            "This receiving address is already registered, possibly archived.",
          );
        if (input.is_default)
          await trx("wallets")
            .where({ user_id: id })
            .update({ is_default: false });
        const [row] = await trx("wallets")
          .insert({ ...input, user_id: id, normalized_address: norm })
          .returning("*");
        return row;
      });
      res.status(201).json(w);
    }),
  );
  app.patch(
    "/wallets/:id",
    wrap(async (req, res) => {
      const id = await owner(req);
      uuid.parse(req.params.id);
      const input = z
        .object({
          description: z.string().trim().min(1).max(120).optional(),
          is_default: z.boolean().optional(),
        })
        .strict()
        .parse(req.body);
      const w = await db.transaction(async (trx) => {
        await trx("installation").where({ id: 1 }).forUpdate().first();
        if (input.is_default)
          await trx("wallets")
            .where({ user_id: id })
            .update({ is_default: false });
        const [row] = await trx("wallets")
          .where({ id: req.params.id, user_id: id })
          .whereNull("archived_at")
          .update({ ...input, updated_at: trx.fn.now() })
          .returning("*");
        return row;
      });
      if (!w) fail(404, "NOT_FOUND", "Active wallet not found.");
      res.json(w);
    }),
  );
  app.delete(
    "/wallets/:id",
    wrap(async (req, res) => {
      const id = await owner(req);
      uuid.parse(req.params.id);
      const [w] = await db("wallets")
        .where({ id: req.params.id, user_id: id })
        .update({
          archived_at: db.fn.now(),
          is_default: false,
          updated_at: db.fn.now(),
        })
        .returning("*");
      if (!w) fail(404, "NOT_FOUND", "Wallet not found.");
      res.json({ archived: true });
    }),
  );
  app.get(
    "/tokens",
    wrap(async (req, res) => {
      await owner(req);
      res.json(Object.entries(assets).map(([chain, a]) => ({ chain, ...a })));
    }),
  );
  app.get(
    "/configs",
    wrap(async (req, res) => {
      await owner(req);
      res.json(await settings());
    }),
  );
  app.patch(
    "/configs",
    wrap(async (req, res) => {
      await owner(req);
      res.json(await saveSettings(req.body));
    }),
  );
  app.get(
    "/reports/dashboard",
    wrap(async (req, res) => res.json(await dashboard(await owner(req)))),
  );
  app.post(
    "/monitoring/scan",
    wrap(async (req, res) => {
      await owner(req);
      const ran = await poll();
      res.json({
        ran,
        message: ran
          ? "Scan completed. Check wallet monitoring results."
          : "A scan is already running.",
      });
    }),
  );
  for (const prefix of ["", "/api/v1"]) {
    const identify = prefix ? apiOwner : owner;
    app.get(
      prefix + "/payments",
      wrap(async (req, res) =>
        res.json(await payments.listPayments(await identify(req), req.query)),
      ),
    );
    app.post(
      prefix + "/payments",
      wrap(async (req, res) =>
        res
          .status(201)
          .json(await payments.createPayment(await identify(req), req.body)),
      ),
    );
    app.get(
      prefix + "/payments/:id",
      wrap(async (req, res) =>
        res.json(await payments.getPayment(await identify(req), req.params.id)),
      ),
    );
  }
  app.post(
    "/payments/:id/cancel",
    wrap(async (req, res) =>
      res.json(await payments.cancel(await owner(req), req.params.id)),
    ),
  );
  app.get(
    "/payments/:id/billing",
    wrap(async (req, res) =>
      res.json(
        await billingView(
          await payments.getPayment(await owner(req), req.params.id),
        ),
      ),
    ),
  );
  app.get(
    "/payments/:id/pdf",
    wrap(async (req, res) => {
      const p = await payments.getPayment(await owner(req), req.params.id);
      res
        .type("pdf")
        .attachment(p.reference + ".pdf")
        .send(await pdf(p));
    }),
  );
  app.post(
    "/payments/:id/email",
    wrap(async (req, res) => {
      const p = await payments.getPayment(await owner(req), req.params.id);
      const input = z
        .object({ to: z.email().max(255) })
        .strict()
        .parse(req.body);
      res.json(await emailPayment(p, input.to));
    }),
  );
  const publicLimit = rateLimit({
    windowMs: 60000,
    limit: 60,
    standardHeaders: "draft-7",
    legacyHeaders: false,
  });
  app.use("/billing", publicLimit, (_req, res, next) => {
    res.setHeader("X-Robots-Tag", "noindex, nofollow");
    next();
  });
  app.get(
    "/billing/:token",
    wrap(async (req, res) =>
      res.json(
        await billingView(await payments.publicPayment(req.params.token)),
      ),
    ),
  );
  app.get(
    "/billing/:token/pdf",
    wrap(async (req, res) => {
      const p = await payments.publicPayment(req.params.token);
      res
        .type("pdf")
        .attachment(p.reference + ".pdf")
        .send(await pdf(p));
    }),
  );
  app.get(
    "/api-tokens",
    wrap(async (req, res) => {
      const id = await owner(req);
      res.json(
        await db("api_tokens")
          .where({ user_id: id })
          .select("id", "label", "last_used_at", "created_at")
          .orderBy("created_at", "desc"),
      );
    }),
  );
  app.post(
    "/api-tokens",
    wrap(async (req, res) => {
      const id = await owner(req);
      const input = z
        .object({ label: z.string().trim().min(1).max(100) })
        .strict()
        .parse(req.body);
      const token = "cp_" + crypto.randomBytes(32).toString("hex");
      const [row] = await db("api_tokens")
        .insert({ user_id: id, label: input.label, token_hash: hash(token) })
        .returning(["id", "label", "created_at"]);
      res.status(201).json({ ...row, token });
    }),
  );
  app.delete(
    "/api-tokens/:id",
    wrap(async (req, res) => {
      const id = await owner(req);
      uuid.parse(req.params.id);
      await db("api_tokens").where({ id: req.params.id, user_id: id }).del();
      res.json({ revoked: true });
    }),
  );
  app.use((_req, res) =>
    res.status(404).json({
      error: {
        code: "NOT_FOUND",
        message: "Endpoint not found.",
        status: 404,
      },
    }),
  );
  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof ZodError) {
      res.status(400).json({
        error: {
          code: "VALIDATION_ERROR",
          message: err.issues
            .map((i) => `${i.path.join(".") || "Request"}: ${i.message}`)
            .join(" "),
          status: 400,
        },
      });
      return;
    }
    const status =
      err instanceof AppError
        ? err.statusCode
        : err.type === "entity.parse.failed"
          ? 400
          : 500;
    if (status === 500)
      console.error("Request failed:", err.code || err.name || "Error");
    res.status(status).json({
      error: {
        code:
          err instanceof AppError
            ? err.code
            : status === 400
              ? "VALIDATION_ERROR"
              : "INTERNAL_ERROR",
        message:
          err instanceof AppError
            ? err.message
            : status === 400
              ? "Invalid JSON request."
              : "The request failed. Check server logs and try again.",
        status,
      },
    });
  });
  return app;
}
