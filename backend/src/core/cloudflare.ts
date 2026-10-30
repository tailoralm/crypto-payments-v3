import crypto from "node:crypto";
import { spawn, ChildProcess } from "node:child_process";
import https from "node:https";
import axios from "axios";
import db from "../db/knex";
import { settings } from "./settings";
import { encrypt, decrypt } from "../common/encryption";
import { fail } from "./domain";
import { resolvePublic } from "./outbound";

const client = axios.create({
  baseURL: "https://api.cloudflare.com/client/v4",
  timeout: 15000,
  maxRedirects: 0,
  proxy: false,
});
let child: ChildProcess | undefined,
  stopping = false,
  timer: NodeJS.Timeout | undefined,
  failures = 0;
let connectorState = "STOPPED";
const intentionalStops = new WeakSet<ChildProcess>();
async function row(): Promise<any> {
  return db("cloudflare_state").where({ id: 1 }).first();
}
async function write(patch: any, provisioning = false): Promise<void> {
  await db.transaction(async (trx) => {
    const r = await trx("cloudflare_state")
      .where({ id: 1 })
      .forUpdate()
      .first();
    if (provisioning && r.state.provisioning_canceled)
      fail(
        409,
        "PROVISIONING_CANCELED",
        "Cloudflare provisioning was disabled.",
      );
    await trx("cloudflare_state")
      .where({ id: 1 })
      .update({ state: { ...r.state, ...patch } });
  });
}
export async function status(): Promise<any> {
  const r = await row();
  const { connector_token, challenge, ...safe } = r.state;
  return { ...safe, connector: connectorState };
}
export async function readiness(): Promise<any> {
  const r = await row();
  return { service: "cryptopay-public", challenge: r.state.challenge || null };
}
async function api(
  s: any,
  method: string,
  path: string,
  data?: unknown,
): Promise<any> {
  try {
    const r = await client.request({
      method,
      url: path,
      data,
      headers: { Authorization: `Bearer ${s.cloudflare_api_token}` },
    });
    if (!r.data.success) throw new Error();
    return r.data.result;
  } catch (e: any) {
    throw Object.assign(
      new Error(
        `Cloudflare operation failed${e.response?.status ? ` (HTTP ${e.response.status})` : ""}. Check token permissions, account, zone and connectivity.`,
      ),
      { httpStatus: e.response?.status },
    );
  }
}
async function halt(): Promise<void> {
  clearTimeout(timer);
  connectorState = "STOPPED";
  if (!child) return;
  const old = child;
  intentionalStops.add(old);
  child = undefined;
  await new Promise<void>((resolve) => {
    const kill = setTimeout(() => old.kill("SIGKILL"), 5000);
    old.once("exit", () => {
      clearTimeout(kill);
      resolve();
    });
    old.kill("SIGTERM");
  });
  connectorState = "STOPPED";
}
async function connect(): Promise<void> {
  const r = await row();
  if (stopping || !r.state.enabled || !r.state.connector_token || child) return;
  let token: string;
  try {
    token = decrypt(r.state.connector_token);
  } catch {
    connectorState = "CREDENTIAL_ERROR";
    return;
  }
  connectorState = "CONNECTING";
  const proc = spawn(
    process.env.CLOUDFLARED_PATH || "/usr/local/bin/cloudflared",
    ["tunnel", "--no-autoupdate", "--metrics", "127.0.0.1:20241", "run"],
    { env: { PATH: process.env.PATH, TUNNEL_TOKEN: token }, stdio: "ignore" },
  );
  child = proc;
  let ended = false;
  const done = () => {
    if (ended) return;
    ended = true;
    if (child === proc) child = undefined;
    connectorState = "DISCONNECTED";
    if (!stopping && !intentionalStops.has(proc))
      timer = setTimeout(
        () =>
          void connect().catch(() => {
            connectorState = "ERROR";
          }),
        Math.min(60000, 1000 * 2 ** Math.min(failures++, 6)),
      );
  };
  proc.once("error", done);
  proc.once("exit", done);
}
export function startTunnelSupervisor(): () => Promise<void> {
  stopping = false;
  void connect().catch(() => {
    connectorState = "ERROR";
  });
  const health = setInterval(async () => {
    if (!child) return;
    try {
      const r = await fetch("http://127.0.0.1:20241/ready", {
        signal: AbortSignal.timeout(2000),
      });
      if (r.ok) {
        connectorState = "CONNECTED";
        failures = 0;
      } else connectorState = "DEGRADED";
    } catch {
      connectorState = "CONNECTING";
    }
  }, 5000);
  return async () => {
    stopping = true;
    clearInterval(health);
    await halt();
  };
}
async function check(): Promise<void> {
  const r = await row(),
    state = r.state;
  if (!state.enabled || !state.hostname)
    fail(409, "TUNNEL_DISABLED", "Provision or enable the tunnel first.");
  const rows = await resolvePublic(state.hostname);
  const body = await new Promise<string>((resolve, reject) => {
    const req = https.get(
      `https://${state.hostname}/api/public-ready`,
      {
        agent: false,
        lookup: ((_h: string, o: any, cb: any) =>
          o?.all
            ? cb(null, rows)
            : cb(null, rows[0].address, rows[0].family)) as any,
      },
      (res) => {
        if (res.statusCode !== 200) {
          res.destroy();
          reject(new Error("Public gateway is not ready."));
          return;
        }
        let text = "";
        res.on("data", (chunk) => {
          text += chunk;
          if (text.length > 4096)
            res.destroy(new Error("Unexpected readiness response."));
        });
        res.on("end", () => resolve(text));
        res.on("error", reject);
      },
    );
    const timeout = setTimeout(
      () => req.destroy(new Error("Public readiness timed out.")),
      10000,
    );
    req.on("close", () => clearTimeout(timeout));
    req.on("error", reject);
  });
  let payload: any;
  try {
    payload = JSON.parse(body);
  } catch {
    throw new Error("Public readiness returned an invalid response.");
  }
  if (
    payload.challenge !== state.challenge ||
    payload.service !== "cryptopay-public"
  )
    throw new Error(
      "Public readiness challenge did not match this installation.",
    );
  await write(
    {
      verified_origin: `https://${state.hostname}`,
      phase: "READY",
      error: null,
    },
    true,
  );
}
export async function action(
  name: "provision" | "reconnect" | "check" | "disable" | "remove",
): Promise<any> {
  if (name === "disable") {
    await write({
      enabled: false,
      provisioning_canceled: true,
      phase: "DISABLED",
    });
    await halt();
    return status();
  }
  const connection = await db.client.acquireConnection();
  let locked = false;
  try {
    locked = (
      await connection.query("SELECT pg_try_advisory_lock(763392) AS locked")
    ).rows[0].locked;
    if (!locked)
      fail(
        409,
        "CLOUDFLARE_BUSY",
        "A Cloudflare operation is already running.",
      );
    if (name === "check") {
      await check();
      return status();
    }
    if (name === "reconnect") {
      await halt();
      await connect();
      return status();
    }
    const s = await settings(true),
      r = await row();
    let state = r.state;
    if (!s.cloudflare_api_token)
      fail(409, "CLOUDFLARE_CONFIG", "Save a Cloudflare API token first.");
    if (name === "remove") {
      await write({ enabled: false, phase: "REMOVING" });
      await halt();
      if (state.dns_id) {
        let record;
        try {
          record = await api(
            s,
            "GET",
            `/zones/${state.zone_id}/dns_records/${state.dns_id}`,
          );
        } catch (e: any) {
          if (e.httpStatus !== 404) throw e;
        }
        if (
          record &&
          (record.comment !== `CryptoPay ${r.installation_id}` ||
            record.content !== `${state.tunnel_id}.cfargotunnel.com`)
        )
          fail(
            409,
            "RESOURCE_CONFLICT",
            "DNS ownership changed. Remove it manually after review.",
          );
        if (record)
          await api(
            s,
            "DELETE",
            `/zones/${state.zone_id}/dns_records/${state.dns_id}`,
          );
        await write({ dns_id: null });
      }
      if (state.tunnel_id) {
        let tunnel;
        try {
          tunnel = await api(
            s,
            "GET",
            `/accounts/${state.account_id}/cfd_tunnel/${state.tunnel_id}`,
          );
        } catch (e: any) {
          if (e.httpStatus !== 404) throw e;
        }
        if (tunnel && tunnel.name !== `cryptopay-${r.installation_id}`)
          fail(409, "RESOURCE_CONFLICT", "Tunnel ownership changed.");
        if (tunnel)
          await api(
            s,
            "DELETE",
            `/accounts/${state.account_id}/cfd_tunnel/${state.tunnel_id}`,
          );
      }
      await db("cloudflare_state")
        .where({ id: 1 })
        .update({ state: { phase: "DISABLED", enabled: false } });
      return status();
    }
    if (
      !/^[a-f0-9]{32}$/i.test(s.cloudflare_account_id) ||
      !/^[a-f0-9]{32}$/i.test(s.cloudflare_zone_id) ||
      !/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(
        s.cloudflare_hostname,
      )
    )
      fail(
        400,
        "CLOUDFLARE_CONFIG",
        "Provide valid account/zone IDs and a lowercase DNS hostname.",
      );
    if (
      state.tunnel_id &&
      (state.account_id !== s.cloudflare_account_id ||
        state.zone_id !== s.cloudflare_zone_id ||
        state.hostname !== s.cloudflare_hostname)
    )
      fail(
        409,
        "RESOURCE_CONFLICT",
        "Remove the existing tunnel before changing account, zone or hostname.",
      );
    await write({ provisioning_canceled: false, phase: "VALIDATING" });
    const save = (patch: any) => write(patch, true);
    const invoke = async (method: string, path: string, data?: unknown) => {
      if ((await row()).state.provisioning_canceled)
        fail(
          409,
          "PROVISIONING_CANCELED",
          "Cloudflare provisioning was disabled.",
        );
      const result = await api(s, method, path, data);
      if ((await row()).state.provisioning_canceled)
        fail(
          409,
          "PROVISIONING_CANCELED",
          "Cloudflare provisioning was disabled.",
        );
      return result;
    };
    const zone = await invoke("GET", `/zones/${s.cloudflare_zone_id}`);
    if (
      zone.account?.id !== s.cloudflare_account_id ||
      !(
        s.cloudflare_hostname === zone.name ||
        s.cloudflare_hostname.endsWith("." + zone.name)
      )
    )
      fail(
        400,
        "CLOUDFLARE_CONFIG",
        "Hostname must belong to the selected account and zone.",
      );
    await save({
      account_id: s.cloudflare_account_id,
      zone_id: s.cloudflare_zone_id,
      hostname: s.cloudflare_hostname,
      phase: "TUNNEL",
      challenge: state.challenge || crypto.randomBytes(32).toString("hex"),
    });
    if (!state.tunnel_id) {
      const tunnelName = `cryptopay-${r.installation_id}`;
      const list = await invoke(
        "GET",
        `/accounts/${s.cloudflare_account_id}/cfd_tunnel?name=${tunnelName}&is_deleted=false`,
      );
      const existing = list.filter((t: any) => t.name === tunnelName);
      if (existing.length > 1)
        fail(
          409,
          "RESOURCE_CONFLICT",
          "Multiple matching tunnels need manual review.",
        );
      const tunnel =
        existing[0] ||
        (await invoke(
          "POST",
          `/accounts/${s.cloudflare_account_id}/cfd_tunnel`,
          { name: tunnelName, config_src: "cloudflare" },
        ));
      await save({ tunnel_id: tunnel.id });
      state = (await row()).state;
    }
    const token = await invoke(
      "GET",
      `/accounts/${state.account_id}/cfd_tunnel/${state.tunnel_id}/token`,
    );
    await save({ connector_token: encrypt(token), phase: "INGRESS" });
    await invoke(
      "PUT",
      `/accounts/${state.account_id}/cfd_tunnel/${state.tunnel_id}/configurations`,
      {
        config: {
          ingress: [
            {
              hostname: state.hostname,
              service: process.env.PUBLIC_GATEWAY_URL || "http://frontend:8081",
            },
            { service: "http_status:404" },
          ],
        },
      },
    );
    await save({ phase: "DNS" });
    const records = await invoke(
      "GET",
      `/zones/${state.zone_id}/dns_records?name=${state.hostname}`,
    );
    const marker = `CryptoPay ${r.installation_id}`,
      content = `${state.tunnel_id}.cfargotunnel.com`;
    if (
      records.some(
        (d: any) =>
          d.type !== "CNAME" || d.content !== content || d.comment !== marker,
      )
    )
      fail(
        409,
        "RESOURCE_CONFLICT",
        "Hostname already has unrelated DNS records. Choose an unused hostname.",
      );
    const record =
      records[0] ||
      (await invoke("POST", `/zones/${state.zone_id}/dns_records`, {
        type: "CNAME",
        name: state.hostname,
        content,
        proxied: true,
        comment: marker,
      }));
    await save({
      dns_id: record.id,
      enabled: true,
      phase: "AWAITING_READINESS",
      error: null,
    });
    await halt();
    await connect();
    try {
      await check();
    } catch {
      await save({
        error:
          "Tunnel configured. Wait for DNS/connector readiness, then check public access.",
      });
    }
    return status();
  } catch (e: any) {
    if (locked && e.code !== "PROVISIONING_CANCELED")
      await write({
        error: e.message?.slice(0, 250) || "Cloudflare operation failed.",
      });
    if (e.statusCode) throw e;
    fail(502, "CLOUDFLARE_ERROR", e.message || "Cloudflare operation failed.");
  } finally {
    if (locked) await connection.query("SELECT pg_advisory_unlock(763392)");
    await db.client.releaseConnection(connection);
  }
}
