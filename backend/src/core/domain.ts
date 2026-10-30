import { z } from "zod";
import { AppError } from "../common/types";

export const chains = ["ethereum", "solana", "bsc"] as const;
export type Chain = (typeof chains)[number];
export const assets: Record<
  Chain,
  { address: string; decimals: number; label: string; chainId?: number }
> = {
  ethereum: {
    address: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
    decimals: 6,
    label: "USDT (Ethereum)",
    chainId: 1,
  },
  solana: {
    address: "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB",
    decimals: 6,
    label: "USDT (Solana)",
  },
  bsc: {
    address: "0x55d398326f99059fF775485246999027B3197955",
    decimals: 18,
    label: "USDT / Binance-Peg BSC-USD",
    chainId: 56,
  },
};
export const statuses = [
  "IN_PROGRESS",
  "SUCCESS",
  "EXPIRED",
  "CANCELED",
] as const;
export function fail(status: number, code: string, message: string): never {
  throw new AppError(status, code, message);
}
export const normalized = (chain: string, address: string): string =>
  chain === "solana" ? address : address.toLowerCase();
export function validAddress(chain: string, address: string): boolean {
  if (chain !== "solana")
    return /^0x[a-fA-F0-9]{40}$/.test(address) && !/^0x0{40}$/i.test(address);
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address)) return false;
  const alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  let n = 0n;
  for (const c of address) n = n * 58n + BigInt(alphabet.indexOf(c));
  let bytes = 0;
  while (n > 0n) {
    bytes++;
    n >>= 8n;
  }
  return bytes + (address.match(/^1*/)?.[0].length || 0) === 32;
}
export function atomic(value: string, decimals: number): string {
  if (!/^(0|[1-9]\d{0,13})(\.\d+)?$/.test(value))
    return fail(
      400,
      "VALIDATION_ERROR",
      "Enter a positive decimal amount with at most 14 whole digits.",
    );
  const [whole, fraction = ""] = value.split(".");
  if (fraction.length > decimals)
    return fail(
      400,
      "VALIDATION_ERROR",
      `This asset supports at most ${decimals} decimal places.`,
    );
  const raw = BigInt(whole + fraction.padEnd(decimals, "0"));
  if (raw <= 0n)
    return fail(400, "VALIDATION_ERROR", "Amount must be greater than zero.");
  return raw.toString();
}
export function decimal(raw: string, decimals: number): string {
  const digits = BigInt(raw)
    .toString()
    .padStart(decimals + 1, "0");
  if (!decimals) return digits;
  return (
    (digits.slice(0, -decimals) + "." + digits.slice(-decimals)).replace(
      /\.?0+$/,
      "",
    ) || "0"
  );
}
export interface Snapshot {
  chain: Chain;
  address: string;
  asset_address: string;
  decimals: number;
  asset_label: string;
  amount: string;
  atomic_amount: string;
}
export interface Transfer {
  chain: Chain;
  tx: string;
  event: string;
  from: string;
  to: string;
  asset: string;
  amount: string;
  timestamp: number;
  block: number;
  evidence: string;
}
export function eligible(p: any, tx: Transfer): boolean {
  const s = p.snapshot as Snapshot;
  return (
    p.status === "IN_PROGRESS" &&
    s.chain === tx.chain &&
    normalized(s.chain, s.address) === normalized(tx.chain, tx.to) &&
    normalized(s.chain, s.asset_address) === normalized(tx.chain, tx.asset) &&
    s.atomic_amount === tx.amount &&
    (!p.expected_from_address ||
      normalized(s.chain, p.expected_from_address) ===
        normalized(tx.chain, tx.from)) &&
    tx.timestamp * 1000 >= new Date(p.created_at).getTime() &&
    tx.timestamp * 1000 < new Date(p.expires_at).getTime()
  );
}
export function paymentUri(s: Snapshot): string {
  return s.chain === "solana"
    ? `solana:${s.address}?amount=${s.amount}&spl-token=${s.asset_address}`
    : `ethereum:${s.asset_address}@${assets[s.chain].chainId}/transfer?address=${s.address}&uint256=${s.atomic_amount}`;
}
export const uuid = z.string().uuid();
export const paymentInput = z
  .object({
    external_order_id: z.string().trim().min(1).max(255).optional(),
    callback_urls: z
      .array(z.string().max(2048))
      .max(5)
      .default([])
      .refine(
        (v) => new Set(v).size === v.length,
        "Duplicate callbacks are not allowed.",
      ),
    publish_billing: z.boolean().default(false),
    amount_mode: z.enum(["exact", "unique"]).default("exact"),
    wallet_id: uuid,
    description: z.string().trim().min(1).max(500),
    value: z.string().max(40),
    expiration_hours: z.number().int().min(1).max(8760).default(24),
    expected_from_address: z.string().max(255).nullable().optional(),
  })
  .strict();
export const walletInput = z
  .object({
    chain: z.enum(chains),
    address: z.string().trim().max(255),
    description: z.string().trim().min(1).max(120),
    is_default: z.boolean().default(false),
  })
  .strict();
export const settingsSchema = z
  .object({
    allowed_callback_origins: z.array(z.string().max(255)).max(100).default([]),
    cloudflare_api_token: z.string().max(2000).nullable().optional(),
    cloudflare_account_id: z.string().max(64).default(""),
    cloudflare_zone_id: z.string().max(64).default(""),
    cloudflare_hostname: z.string().max(253).default(""),
    public_base_url: z
      .union([
        z.literal(""),
        z
          .url()
          .refine((v) => /^https?:\/\//.test(v), "Use an HTTP or HTTPS URL."),
      ])
      .default(""),
    polling_minutes: z.number().int().min(1).max(1440).default(15),
    etherscan_enabled: z.boolean().default(true),
    solscan_enabled: z.boolean().default(true),
    chains: z
      .object({ ethereum: z.boolean(), solana: z.boolean(), bsc: z.boolean() })
      .default({ ethereum: false, solana: false, bsc: false }),
    etherscan_key: z.string().max(500).nullable().optional(),
    solscan_key: z.string().max(500).nullable().optional(),
    smtp_enabled: z.boolean().default(false),
    smtp_host: z.string().max(255).default(""),
    smtp_port: z.number().int().min(1).max(65535).default(587),
    smtp_security: z.enum(["starttls", "tls", "none"]).default("starttls"),
    smtp_user: z.string().max(255).default(""),
    smtp_password: z.string().max(500).nullable().optional(),
    smtp_from: z.string().max(255).default(""),
    rate_limit_enabled: z.boolean().default(true),
    rate_limit_max_requests: z.number().int().min(1).max(10000).default(100),
    rate_limit_window_minutes: z.number().int().min(1).max(1440).default(15),
  })
  .strict();
export const defaultSettings = settingsSchema.parse({});
