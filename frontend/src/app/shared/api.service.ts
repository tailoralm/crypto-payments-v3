import { Injectable, signal, inject, ChangeDetectorRef } from "@angular/core";
export interface Wallet {
  id: string;
  chain: string;
  address: string;
  description: string;
  is_default: boolean;
  archived_at: string | null;
  scan_error: string | null;
  scan_attempt_at: string | null;
  scan_success_at: string | null;
}
export interface Payment {
  id: string;
  reference: string;
  description: string;
  value: string;
  status: string;
  snapshot: {
    chain: string;
    address: string;
    asset_label: string;
    asset_address: string;
    amount: string;
  };
  expires_at: string;
  created_at: string;
  paid_at: string | null;
  detected_at: string | null;
  expected_from_address: string | null;
  concluded_tx_hash: string | null;
  public_url: string | null;
  smtp_enabled: boolean;
  qr?: string;
  payment_uri?: string;
}
export interface Page {
  items: Payment[];
  total: number;
  page: number;
  page_size: number;
}
@Injectable({ providedIn: "root" })
export class ApiService {
  authenticated = signal(false);
  private token: string | null = null;
  private refreshing: Promise<boolean> | null = null;
  async init() {
    await this.refresh();
  }
  private async refresh(): Promise<boolean> {
    if (this.refreshing) return this.refreshing;
    this.refreshing = (async () => {
      try {
        const r = await fetch("/api/auth/refresh", {
          method: "POST",
          credentials: "same-origin",
        });
        if (!r.ok) throw new Error();
        const data = await r.json();
        this.token = data.access_token;
        this.authenticated.set(true);
        return true;
      } catch {
        this.token = null;
        this.authenticated.set(false);
        return false;
      }
    })();
    try {
      return await this.refreshing;
    } finally {
      this.refreshing = null;
    }
  }
  async request<T = any>(
    path: string,
    method = "GET",
    body?: unknown,
    headers: Record<string, string> = {},
    retry = true,
  ): Promise<T> {
    const response = await fetch("/api" + path, {
      method,
      credentials: "same-origin",
      headers: {
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(this.token && !path.startsWith("/billing/")
          ? { Authorization: "Bearer " + this.token }
          : {}),
        ...headers,
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    if (
      response.status === 401 &&
      retry &&
      !path.startsWith("/auth/") &&
      !path.startsWith("/billing/") &&
      (await this.refresh())
    )
      return this.request(path, method, body, headers, false);
    if (!response.ok) {
      const data = await response.json().catch(() => null);
      throw new Error(
        data?.error?.message ||
          "Unable to complete the request. Check your connection and try again.",
      );
    }
    return response.json();
  }
  async login(email: string, password: string, setup?: string) {
    const data = await this.request(
      "/auth/" + (setup ? "register" : "login"),
      "POST",
      { email, password },
      setup ? { "X-Setup-Token": setup } : {},
    );
    this.token = data.access_token;
    this.authenticated.set(true);
  }
  async logout() {
    await this.request("/auth/logout", "POST", {});
    this.token = null;
    this.authenticated.set(false);
  }
  async download(path: string, name: string) {
    const get = () =>
      fetch("/api" + path, {
        credentials: "same-origin",
        headers: this.token ? { Authorization: "Bearer " + this.token } : {},
      });
    let r = await get();
    if (r.status === 401 && (await this.refresh())) r = await get();
    if (!r.ok) throw new Error("Could not download the PDF. Try again.");
    const url = URL.createObjectURL(await r.blob());
    const a = document.createElement("a");
    a.href = url;
    a.download = name + ".pdf";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
export class ViewState {
  private cdr = inject(ChangeDetectorRef);
  busy = signal(false);
  error = signal("");
  notice = signal("");
  async run(fn: () => Promise<unknown>) {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set("");
    this.notice.set("");
    try {
      await fn();
    } catch (e: any) {
      this.error.set(e.message || "Something went wrong. Please try again.");
    } finally {
      this.busy.set(false);
      this.cdr.markForCheck();
    }
  }
}
