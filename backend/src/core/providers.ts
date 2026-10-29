import axios from "axios";
import JSONbig from "json-bigint";
import { assets, Chain, normalized, Transfer } from "./domain";
const parse = JSONbig({ storeAsString: true });
const client = axios.create({
  timeout: 20000,
  maxRedirects: 0,
  maxContentLength: 8 * 1024 * 1024,
  transformResponse: [
    (s: string) => (typeof s === "string" ? parse.parse(s) : s),
  ],
});
const transferTopic =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
let nextCall = 0;
async function request(
  url: string,
  params: any,
  headers: any = {},
): Promise<any> {
  const delay = Math.max(0, nextCall - Date.now());
  nextCall = Date.now() + delay + 400;
  if (delay) await new Promise((r) => setTimeout(r, delay));
  try {
    return (await client.get(url, { params, headers })).data;
  } catch (e: any) {
    throw new Error(
      e.response?.status === 429
        ? "Explorer quota exceeded. Check your plan and retry later."
        : `Explorer request failed${e.response?.status ? ` (HTTP ${e.response.status})` : ""}. Check credentials, plan access and connectivity.`,
    );
  }
}
function raw(v: any): string {
  if (
    (typeof v !== "string" && !Number.isSafeInteger(v)) ||
    !/^\d+$/.test(String(v))
  )
    throw new Error("Explorer returned an unsafe or malformed atomic amount.");
  return BigInt(v).toString();
}
export function receiptTransfers(
  chain: Chain,
  address: string,
  tx: any,
  receipt: any,
): Transfer[] {
  if (!receipt || receipt.status !== "0x1" || !Array.isArray(receipt.logs))
    throw new Error("Missing successful transaction receipt evidence.");
  return receipt.logs
    .filter(
      (l: any) =>
        !l.removed &&
        l.address.toLowerCase() === assets[chain].address.toLowerCase() &&
        l.topics?.length === 3 &&
        l.topics[0] === transferTopic &&
        ("0x" + l.topics[2].slice(-40)).toLowerCase() === address.toLowerCase(),
    )
    .map((l: any) => {
      if (
        !/^0x[0-9a-f]+$/i.test(l.logIndex) ||
        !/^0x[0-9a-f]{64}$/i.test(l.data)
      )
        throw new Error("Malformed transfer log identity.");
      return {
        chain,
        tx: tx.hash,
        event: BigInt(l.logIndex).toString(),
        from: "0x" + l.topics[1].slice(-40),
        to: "0x" + l.topics[2].slice(-40),
        asset: l.address,
        amount: BigInt(l.data).toString(),
        timestamp: Number(tx.timeStamp),
        block: Number(tx.blockNumber),
        evidence: "Successful receipt; at least 12 confirmations",
      };
    });
}
export function solanaTransfers(
  address: string,
  rows: any[],
  details: Map<string, any>,
): Transfer[] {
  const counts = new Map<string, number>();
  for (const r of rows)
    counts.set(r.trans_id, (counts.get(r.trans_id) || 0) + 1);
  return rows
    .filter(
      (r) =>
        r.flow === "in" &&
        r.to_address === address &&
        r.token_address === assets.solana.address,
    )
    .map((r) => {
      const d = details.get(r.trans_id);
      if (Number(d?.status) !== 1)
        throw new Error("Solscan did not prove successful execution.");
      // Refuse ambiguous multi-transfer payloads if this API version omits instruction identity.
      const index = r.instruction_index ?? r.ins_index;
      if (counts.get(r.trans_id)! > 1 && index === undefined)
        throw new Error(
          "Solscan omitted instruction identity for a multi-transfer transaction. Automatic matching stopped safely.",
        );
      return {
        chain: "solana",
        tx: r.trans_id,
        event:
          index === undefined
            ? "single"
            : `${index}:${r.inner_instruction_index ?? r.inner_ins_index ?? -1}`,
        from: r.from_address,
        to: r.to_address,
        asset: r.token_address,
        amount: raw(r.amount),
        timestamp: Number(r.block_time),
        block: Number(r.block_id),
        evidence:
          "Solscan indexed transfer and successful transaction detail; no independent finality proof",
      };
    });
}
export async function fetchTransfers(
  chain: Chain,
  address: string,
  since: Date,
  until: Date,
  key: string,
): Promise<Transfer[]> {
  if (chain === "solana") {
    const rows: any[] = [];
    for (let page = 1; ; page++) {
      if (page > 100)
        throw new Error(
          "Scan exceeds 100 pages; no checkpoint advanced. Shorten active request lifetime or contact the operator.",
        );
      const data = await request(
        "https://pro-api.solscan.io/v2.0/account/transfer",
        {
          address,
          token: assets.solana.address,
          flow: "in",
          from_time: Math.floor(since.getTime() / 1000),
          to_time: Math.floor(until.getTime() / 1000),
          page,
          page_size: 100,
          sort_by: "block_time",
          sort_order: "asc",
        },
        { token: key },
      );
      if (data.success !== true || !Array.isArray(data.data))
        throw new Error(
          "Solscan transfer access denied or response invalid. Check API plan.",
        );
      rows.push(...data.data);
      if (data.data.length < 100) break;
    }
    const details = new Map<string, any>();
    for (const tx of new Set(rows.map((r) => r.trans_id))) {
      const d = await request(
        "https://pro-api.solscan.io/v2.0/transaction/detail",
        { tx },
        { token: key },
      );
      if (!d.success || !d.data)
        throw new Error("Solscan transaction evidence unavailable.");
      details.set(tx, d.data);
    }
    return solanaTransfers(address, rows, details);
  }
  const api = async (params: any) => {
    const d = await request("https://api.etherscan.io/v2/api", {
      chainid: assets[chain].chainId,
      apikey: key,
      ...params,
    });
    if (d.error || (d.status === "0" && d.message !== "No transactions found"))
      throw new Error(
        "Etherscan rejected the scan. Check credentials, chain entitlement and quota.",
      );
    return d;
  };
  const head = await api({ module: "proxy", action: "eth_blockNumber" });
  if (!/^0x[0-9a-f]+$/i.test(head.result))
    throw new Error("Unable to establish chain head.");
  const endblock = Math.max(0, Number(BigInt(head.result)) - 12);
  const start = await api({
    module: "block",
    action: "getblocknobytime",
    timestamp: Math.floor(since.getTime() / 1000),
    closest: "before",
  });
  if (!/^\d+$/.test(String(start.result)))
    throw new Error("Unable to establish scan start block.");
  const records: any[] = [];
  for (let page = 1; ; page++) {
    if (page > 100)
      throw new Error("Scan exceeds 100 pages; no checkpoint advanced.");
    const d = await api({
      module: "account",
      action: "tokentx",
      address,
      contractaddress: assets[chain].address,
      startblock: start.result,
      endblock,
      page,
      offset: 100,
      sort: "asc",
    });
    if (d.status === "0" && d.message === "No transactions found") break;
    if (!Array.isArray(d.result))
      throw new Error("Invalid Etherscan transfer response.");
    records.push(...d.result);
    if (d.result.length < 100) break;
  }
  const txs = new Map<string, any>();
  for (const t of records)
    if (
      normalized(chain, t.to) === normalized(chain, address) &&
      Number(t.timeStamp) <= until.getTime() / 1000
    )
      txs.set(t.hash, t);
  const transfers: Transfer[] = [];
  for (const t of txs.values()) {
    const r = await api({
      module: "proxy",
      action: "eth_getTransactionReceipt",
      txhash: t.hash,
    });
    if (Number(BigInt(r.result?.blockNumber || "0x0")) > endblock) continue;
    transfers.push(...receiptTransfers(chain, address, t, r.result));
  }
  return transfers;
}
