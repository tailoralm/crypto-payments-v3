import db from "../db/knex";
import { encrypt, decrypt } from "../common/encryption";
import { defaultSettings, settingsSchema, fail, Chain } from "./domain";
import { z } from "zod";
import { callbackOrigin } from "./outbound";
const secretFields = [
  "etherscan_key",
  "solscan_key",
  "smtp_password",
  "cloudflare_api_token",
  "webhook_secret",
] as const;
export async function settings(secrets = false, query = db): Promise<any> {
  const row = await query("installation").where({ id: 1 }).first();
  const s: any = { ...defaultSettings, ...row.settings };
  for (const k of secretFields) {
    const encrypted = s[k];
    s[k + "_configured"] = !!encrypted;
    if (secrets) {
      try {
        s[k] = encrypted ? decrypt(encrypted) : "";
      } catch {
        s[k] = "";
      }
    } else delete s[k];
  }
  const cf = await query("cloudflare_state").where({ id: 1 }).first();
  s.billing_origin =
    cf?.state?.enabled && cf.state.verified_origin
      ? cf.state.verified_origin
      : s.public_base_url;
  return s;
}
export async function saveSettings(input: unknown): Promise<any> {
  const parsed = settingsSchema.partial().parse(input);
  // Zod defaults also apply inside optional fields; PATCH must keep omitted settings.
  const patch = Object.fromEntries(
    Object.entries(parsed).filter(([key]) =>
      Object.hasOwn(input as object, key),
    ),
  ) as typeof parsed;
  await db.transaction(async (trx) => {
    const row = await trx("installation").where({ id: 1 }).forUpdate().first();
    const merged: any = { ...defaultSettings, ...row.settings, ...patch };
    if (patch.allowed_callback_origins)
      merged.allowed_callback_origins = [
        ...new Set(patch.allowed_callback_origins.map(callbackOrigin)),
      ];
    for (const k of secretFields)
      if (Object.hasOwn(patch, k))
        merged[k] = (patch as any)[k] ? encrypt((patch as any)[k]) : null;
    if (
      merged.smtp_enabled &&
      (!merged.smtp_host || !z.email().safeParse(merged.smtp_from).success)
    )
      fail(
        400,
        "VALIDATION_ERROR",
        "SMTP needs a host and valid sender email.",
      );
    if (merged.public_base_url) {
      const u = new URL(merged.public_base_url);
      if (u.username || u.password || u.search || u.hash || u.pathname !== "/")
        fail(
          400,
          "VALIDATION_ERROR",
          "Public URL must be an origin, without path, credentials or query.",
        );
      merged.public_base_url = u.origin;
    }
    await trx("installation")
      .where({ id: 1 })
      .update({ settings: merged, updated_at: trx.fn.now() });
  });
  return settings();
}
export function available(s: any, chain: Chain): boolean {
  return !!(
    s.chains[chain] &&
    (chain === "solana"
      ? s.solscan_enabled && s.solscan_key_configured
      : s.etherscan_enabled && s.etherscan_key_configured)
  );
}
