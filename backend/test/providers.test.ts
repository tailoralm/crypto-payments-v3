import { test } from "node:test";
import assert from "node:assert/strict";
import nock from "nock";
import { fetchTransfers } from "../src/core/providers";
import { assets } from "../src/core/domain";
const address = "0x1111111111111111111111111111111111111111";
const since = new Date("2026-01-01T00:00:00Z"),
  until = new Date("2026-01-02T00:00:00Z");
test("Etherscan empty scans are distinct from denied access and rate limits", async () => {
  const api = nock("https://api.etherscan.io")
    .get("/v2/api")
    .query((q) => q.action === "eth_blockNumber")
    .reply(200, { result: "0x1000" })
    .get("/v2/api")
    .query((q) => q.action === "getblocknobytime")
    .reply(200, { status: "1", result: "100" })
    .get("/v2/api")
    .query(
      (q) =>
        q.action === "tokentx" && q.chainid === "56" && q.endblock === "4084",
    )
    .reply(200, { status: "0", message: "No transactions found", result: [] });
  assert.deepEqual(
    await fetchTransfers("bsc", address, since, until, "fixture"),
    [],
  );
  assert(api.isDone());
  nock("https://api.etherscan.io")
    .get("/v2/api")
    .query(true)
    .reply(200, { status: "0", message: "NOTOK", result: "Invalid API Key" });
  await assert.rejects(
    fetchTransfers("ethereum", address, since, until, "bad-key"),
    /rejected/,
  );
  nock("https://api.etherscan.io").get("/v2/api").query(true).reply(429, {});
  await assert.rejects(
    fetchTransfers("ethereum", address, since, until, "fixture"),
    /quota/,
  );
});
test("Solscan paginates a fixed time window, preserves large integer values and verifies transaction status", async () => {
  const row = (i: number) => ({
    trans_id: "signature",
    instruction_index: i,
    flow: "in",
    to_address: assets.solana.address,
    from_address: "sender",
    token_address: assets.solana.address,
    amount: "9007199254740993",
    block_time: 1767268800,
    block_id: 100,
  });
  const api = nock("https://pro-api.solscan.io", {
    reqheaders: { token: "fixture" },
  })
    .get("/v2.0/account/transfer")
    .query(
      (q) =>
        q.page === "1" &&
        q.from_time === "1767225600" &&
        q.to_time === "1767312000",
    )
    .reply(200, {
      success: true,
      data: Array.from({ length: 100 }, (_, i) => row(i)),
    })
    .get("/v2.0/account/transfer")
    .query((q) => q.page === "2")
    .reply(200, { success: true, data: [] });
  api
    .get("/v2.0/transaction/detail")
    .query({ tx: "signature" })
    .reply(200, { success: true, data: { status: 1 } });
  const result = await fetchTransfers(
    "solana",
    assets.solana.address,
    since,
    until,
    "fixture",
  );
  assert.equal(result.length, 100);
  assert.equal(result[0].amount, "9007199254740993");
  assert(api.isDone());
});
