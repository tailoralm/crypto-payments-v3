import { test, mock } from "node:test";
import assert from "node:assert/strict";
import {
  callbackOrigin,
  permittedUrl,
  publicAddress,
  resolvePublic,
} from "../src/core/outbound";
import { signature } from "../src/core/events";
import crypto from "node:crypto";
import https from "node:https";
import dns from "node:dns/promises";
import { EventEmitter } from "node:events";
import { sendPublic } from "../src/core/outbound";
test("callback origins normalize precisely and refuse deceptive URLs", () => {
  assert.equal(
    callbackOrigin("Store.Example.com"),
    "https://store.example.com",
  );
  assert.equal(
    permittedUrl("https://store.example.com:443/hooks?a=1", [
      "https://store.example.com",
    ]).pathname,
    "/hooks",
  );
  for (const url of [
    "http://store.example.com",
    "https://store.example.com:444/",
    "https://user@store.example.com/",
    "https://store.example.com/#x",
    "https://store.example.com.attacker.com/",
    "https://sub.store.example.com/",
  ])
    assert.throws(() => permittedUrl(url, ["https://store.example.com"]));
  assert.throws(() => callbackOrigin("https://store.example.com/path"));
});
test("destination validation rejects non-public IPv4, IPv6, mapped addresses and mixed DNS", async () => {
  for (const address of [
    "127.0.0.1",
    "10.0.0.1",
    "169.254.169.254",
    "192.168.1.1",
    "100.64.0.1",
    "198.18.0.1",
    "192.0.2.1",
    "0.0.0.0",
    "255.255.255.255",
    "::1",
    "::ffff:127.0.0.1",
    "::ffff:8.8.8.8",
    "fe80::1",
    "fc00::1",
    "2001:db8::1",
    "2001:1::1",
    "2002:7f00:1::1",
    "3fff::1",
  ])
    assert.equal(publicAddress(address), false, address);
  for (const address of [
    "8.8.8.8",
    "1.1.1.1",
    "2606:4700:4700::1111",
    "2001:4860:4860::8888",
  ])
    assert.equal(publicAddress(address), true, address);
  let calls = 0;
  const lookup = (async () => {
    calls++;
    return calls === 1
      ? [{ address: "8.8.8.8", family: 4 }]
      : [{ address: "127.0.0.1", family: 4 }];
  }) as any;
  await resolvePublic("receiver.example", lookup);
  await assert.rejects(resolvePublic("receiver.example", lookup), /non-public/);
  await assert.rejects(
    resolvePublic("receiver.example", (async () => [
      { address: "8.8.8.8", family: 4 },
      { address: "::1", family: 6 },
    ]) as any),
    /non-public/,
  );
});
test("webhook signatures authenticate the exact timestamp and raw JSON body", () => {
  const body = '{"event_id":"stable","value":"1.000001"}',
    time = "1793380000",
    secret = "secret";
  assert.equal(
    signature(secret, time, body),
    crypto
      .createHmac("sha256", secret)
      .update(time + "." + body)
      .digest("hex"),
  );
  assert.notEqual(
    signature(secret, time, body),
    signature(secret, time, body + " "),
  );
  assert.notEqual(
    signature(secret, time, body),
    signature(secret, "1793380001", body),
  );
});
test("outbound HTTPS pins vetted DNS answers without resolving twice or following redirects", async () => {
  let resolves = 0,
    requests = 0;
  const lookup = mock.method(dns, "lookup", async () => {
    resolves++;
    return [{ address: "8.8.8.8", family: 4 }];
  });
  const request = mock.method(https, "request", ((
    _u: any,
    options: any,
    callback: any,
  ) => {
    requests++;
    assert.equal(options.agent, false);
    options.lookup(
      "receiver.example",
      {},
      (err: any, address: string, family: number) => {
        assert.equal(err, null);
        assert.equal(address, "8.8.8.8");
        assert.equal(family, 4);
      },
    );
    options.lookup(
      "receiver.example",
      { all: true },
      (err: any, rows: any[]) => {
        assert.equal(err, null);
        assert.deepEqual(rows, [{ address: "8.8.8.8", family: 4 }]);
      },
    );
    const req = new EventEmitter() as any;
    req.end = () => {
      callback({ statusCode: 301, destroy: () => {} });
      queueMicrotask(() => req.emit("close"));
    };
    req.destroy = () => {};
    return req;
  }) as any);
  try {
    assert.equal(
      await sendPublic("https://receiver.example/hooks", "{}", {}, [
        "https://receiver.example",
      ]),
      301,
    );
    assert.equal(resolves, 1);
    assert.equal(requests, 1);
  } finally {
    request.mock.restore();
    lookup.mock.restore();
  }
});
