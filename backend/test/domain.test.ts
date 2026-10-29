import { test } from "node:test";
import assert from "node:assert/strict";
import {
  atomic,
  decimal,
  eligible,
  assets,
  paymentUri,
  validAddress,
  Snapshot,
} from "../src/core/domain";
import { receiptTransfers, solanaTransfers } from "../src/core/providers";
const snapshot: Snapshot = {
  chain: "ethereum",
  address: "0x1111111111111111111111111111111111111111",
  asset_address: assets.ethereum.address,
  decimals: 6,
  asset_label: "USDT",
  amount: "8.780001",
  atomic_amount: "8780001",
};
const intention = {
  status: "IN_PROGRESS",
  snapshot,
  created_at: "2026-01-01T12:00:00Z",
  expires_at: "2026-01-01T13:00:00Z",
  expected_from_address: null,
};
const tx = {
  chain: "ethereum" as const,
  tx: "hash",
  event: "0",
  from: "0x2222222222222222222222222222222222222222",
  to: snapshot.address,
  asset: assets.ethereum.address,
  amount: "8780001",
  timestamp: Date.parse("2026-01-01T12:30:00Z") / 1000,
  block: 123,
  evidence: "test",
};
test("atomic conversion preserves all 18 decimals and rejects invalid representations", () => {
  assert.equal(
    atomic("12345678901234.123456789012345678", 18),
    "12345678901234123456789012345678",
  );
  assert.equal(decimal("1000000000000000001", 18), "1.000000000000000001");
  for (const value of ["0", "-1", "1e4", "01", "NaN", "0.0000001"])
    assert.throws(() => atomic(value, 6));
});
test("matches exact full amount, chain, destination, contract, sender and time window", () => {
  assert.equal(eligible(intention, tx), true);
  for (const diff of [
    { amount: "8780000" },
    { chain: "bsc" },
    { to: tx.from },
    { asset: tx.from },
    { timestamp: tx.timestamp - 3600 },
    { timestamp: Date.parse(intention.expires_at) / 1000 },
  ])
    assert.equal(eligible(intention, { ...tx, ...diff } as any), false);
  assert.equal(
    eligible({ ...intention, expected_from_address: tx.to }, tx),
    false,
  );
  for (const status of ["SUCCESS", "EXPIRED", "CANCELED"])
    assert.equal(eligible({ ...intention, status }, tx), false);
});
test("address validation and Solana comparisons preserve case", () => {
  assert(validAddress("solana", assets.solana.address));
  assert(!validAddress("solana", "O".repeat(44)));
  assert(!validAddress("ethereum", "0x" + "0".repeat(40)));
  const s = {
    ...snapshot,
    chain: "solana",
    asset_address: assets.solana.address,
    address: assets.solana.address,
  };
  assert(
    !eligible(
      { ...intention, snapshot: s },
      {
        ...tx,
        chain: "solana",
        to: s.address.toLowerCase(),
        asset: s.asset_address,
      },
    ),
  );
});
test("wallet QR payload contains exact recipient, network, contract and atomic amount", () => {
  assert.equal(
    paymentUri(snapshot),
    `ethereum:${snapshot.asset_address}@1/transfer?address=${snapshot.address}&uint256=8780001`,
  );
  assert.equal(
    paymentUri({
      ...snapshot,
      chain: "solana",
      asset_address: assets.solana.address,
    }),
    `solana:${snapshot.address}?amount=8.780001&spl-token=${assets.solana.address}`,
  );
});
test("EVM receipts distinguish separate logs and reject failed execution", () => {
  const topic =
    "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
  const log = {
    address: assets.ethereum.address,
    topics: [
      topic,
      "0x" + tx.from.slice(2).padStart(64, "0"),
      "0x" + tx.to.slice(2).padStart(64, "0"),
    ],
    data: "0x" + BigInt(tx.amount).toString(16).padStart(64, "0"),
    logIndex: "0x1",
  };
  const result = receiptTransfers(
    "ethereum",
    tx.to,
    { hash: "h", timeStamp: tx.timestamp, blockNumber: "123" },
    { status: "0x1", logs: [log, { ...log, logIndex: "0x2" }] },
  );
  assert.deepEqual(
    result.map((t) => t.event),
    ["1", "2"],
  );
  assert.equal(result[0].amount, tx.amount);
  assert.throws(() =>
    receiptTransfers("ethereum", tx.to, {}, { status: "0x0", logs: [log] }),
  );
});
test("Solana success evidence and multi-transfer ambiguity fail safely", () => {
  const row = {
    trans_id: "sig",
    flow: "in",
    to_address: assets.solana.address,
    from_address: "sender",
    token_address: assets.solana.address,
    amount: "9007199254740993",
    block_time: 100,
    block_id: 10,
  };
  const details = new Map([["sig", { status: 1 }]]);
  assert.equal(
    solanaTransfers(assets.solana.address, [row], details)[0].amount,
    row.amount,
  );
  assert.throws(() =>
    solanaTransfers(assets.solana.address, [row, row], details),
  );
  assert.throws(() =>
    solanaTransfers(
      assets.solana.address,
      [row],
      new Map([["sig", { status: 0 }]]),
    ),
  );
});
