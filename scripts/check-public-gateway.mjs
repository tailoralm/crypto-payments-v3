import assert from "node:assert/strict";
import http from "node:http";
const origin = process.env.GATEWAY_URL || "http://frontend:8081";
const get = (path) =>
  new Promise((resolve, reject) => {
    const req = http.get(origin + path, (res) => {
      let body = "";
      res.on("data", (c) => (body += c));
      res.on("end", () => resolve({ status: res.statusCode, body }));
    });
    req.on("error", reject);
  });
for (const route of [
  "/",
  "/login",
  "/dashboard",
  "/settings",
  "/wallets",
  "/api/configs",
  "/api/auth/setup",
  "/api/auth/login",
  "/api/api-tokens",
  "/api/payments",
  "/api/recovery/scan",
  "//api/configs",
  "/api/../api/configs",
  "/api/%63onfigs",
  "/api/api/v1/payments/../../configs",
  "/api/api/v1/payments%2f..%2fconfigs",
  "/api\\configs",
  "/api//configs",
  "/api/configs?x=/api/v1/payments",
]) {
  assert.equal((await get(route)).status, 404, route);
}
const bill = await get("/bill/" + "a".repeat(64));
assert.equal(bill.status, 200);
for (const match of bill.body.matchAll(/(?:src|href)="([^"/]+\.(?:js|css))"/g))
  assert.equal((await get("/" + match[1])).status, 200, match[1]);
assert.equal((await get("/api/billing/" + "a".repeat(64))).status, 404);
assert.equal((await get("/api/api/v1/payments")).status, 401);
assert.equal((await get("/api/public-ready")).status, 200);
console.log(
  "Public gateway: allowed assets/readiness, authenticated integration routes, and administrative bypass checks passed.",
);
