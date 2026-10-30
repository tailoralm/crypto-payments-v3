import dns from "node:dns/promises";
import https from "node:https";
import net from "node:net";
import { fail } from "./domain";

export function callbackUrl(value: string): URL {
  if (
    /[\u0000-\u0020\u007f\\#]/.test(value) ||
    /^https:\/\/[^/]*@/i.test(value)
  )
    fail(
      400,
      "INVALID_CALLBACK",
      "Callback URLs cannot contain whitespace, userinfo, backslashes or fragments.",
    );
  let u: URL;
  try {
    u = new URL(value);
  } catch {
    return fail(400, "INVALID_CALLBACK", "Enter a valid HTTPS callback URL.");
  }
  if (u.protocol !== "https:" || u.port || u.username || u.password || u.hash)
    fail(
      400,
      "INVALID_CALLBACK",
      "Callbacks require HTTPS port 443 without credentials or fragments.",
    );
  return u;
}
export function callbackOrigin(value: string): string {
  const u = callbackUrl(value.includes("://") ? value : `https://${value}`);
  if (u.pathname !== "/" || u.search)
    fail(400, "INVALID_CALLBACK", "Allowed callback entries must be origins.");
  return u.origin;
}
export function permittedUrl(value: string, origins: string[]): URL {
  const u = callbackUrl(value);
  if (!origins.includes(u.origin))
    fail(
      400,
      "CALLBACK_BLOCKED",
      "Callback origin is no longer allowed. Update Settings and retry.",
    );
  return u;
}
// An allowlist of globally routable ranges is safer than accepting unknown IPv6 space.
export function publicAddress(address: string): boolean {
  if (net.isIPv4(address)) {
    const [a, b, c] = address.split(".").map(Number);
    return !(
      a === 0 ||
      a === 10 ||
      a === 127 ||
      a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && (b === 0 || b === 168 || (b === 88 && c === 99))) ||
      (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
      (a === 203 && b === 0 && c === 113)
    );
  }
  if (!net.isIPv6(address)) return false;
  const blocked = new net.BlockList();
  blocked.addSubnet("2001::", 23, "ipv6");
  blocked.addSubnet("2001:db8::", 32, "ipv6");
  blocked.addSubnet("2002::", 16, "ipv6");
  blocked.addSubnet("3fff::", 20, "ipv6");
  const global = new net.BlockList();
  global.addSubnet("2000::", 3, "ipv6");
  return global.check(address, "ipv6") && !blocked.check(address, "ipv6");
}
export async function resolvePublic(
  host: string,
  lookup = dns.lookup,
): Promise<{ address: string; family: number }[]> {
  const name = host.replace(/^\[|\]$/g, "");
  let timer: NodeJS.Timeout | undefined;
  const rows = net.isIP(name)
    ? [{ address: name, family: net.isIP(name) }]
    : await Promise.race([
        lookup(name, { all: true, verbatim: true }),
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(
            () => reject(new Error("Destination DNS lookup timed out.")),
            10000,
          );
        }),
      ]).finally(() => clearTimeout(timer));
  if (!rows.length || rows.some((r) => !publicAddress(r.address)))
    throw new Error("Destination resolves to a non-public address.");
  return rows;
}
export async function sendPublic(
  url: string,
  body: string,
  headers: Record<string, string>,
  origins: string[],
): Promise<number> {
  const u = permittedUrl(url, origins);
  const deadline = Date.now() + 10000;
  const rows = await resolvePublic(u.hostname);
  return new Promise((resolve, reject) => {
    const req = https.request(
      u,
      {
        method: "POST",
        agent: false,
        headers: {
          ...headers,
          "Content-Type": "application/json",
          "Content-Length": String(Buffer.byteLength(body)),
        },
        lookup: ((_host: string, options: any, cb: any) =>
          options?.all
            ? cb(null, rows)
            : cb(null, rows[0].address, rows[0].family)) as any,
      },
      (res) => {
        const status = res.statusCode || 0;
        res.destroy();
        resolve(status);
      },
    );
    const timeout = setTimeout(
      () => req.destroy(new Error("Callback timed out.")),
      Math.max(1, deadline - Date.now()),
    );
    req.on("close", () => clearTimeout(timeout));
    req.on("error", reject);
    req.end(body);
  });
}
