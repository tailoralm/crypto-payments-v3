import { Component, inject } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { RouterLink } from "@angular/router";
import { ApiService, ViewState, Wallet } from "../shared/api.service";
@Component({
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: ` <div class="page-heading">
      <div>
        <span class="eyebrow">RECEIVING ACCOUNTS</span>
        <h1>Wallets</h1>
        <p class="muted">
          Your public addresses. Your funds stay in your wallets.
        </p>
      </div>
      <button class="secondary" [disabled]="busy()" (click)="scan()">
        ↻ Check payments now
      </button>
    </div>
    @if (error()) {
      <div class="alert error" role="alert">{{ error() }}</div>
    }
    @if (notice()) {
      <div class="alert good" role="status">{{ notice() }}</div>
    }
    <div class="wallet-grid">
      @for (w of wallets; track w.id) {
        <article class="panel wallet-card" [class.archived]="w.archived_at">
          <div class="wallet-top">
            <span class="network">{{
              w.chain === "bsc" ? "BNB Smart Chain" : (w.chain | titlecase)
            }}</span>
            @if (w.is_default) {
              <span class="subtle-tag">Default</span>
            }
            @if (w.archived_at) {
              <span class="subtle-tag">Archived</span>
            }
          </div>
          <h2>{{ w.description }}</h2>
          <p class="mono break">{{ w.address }}</p>
          <div class="scan-state">
            <span class="dot" [class.bad-dot]="w.scan_error"></span
            ><span>{{
              w.scan_error
                ? "Monitoring needs attention"
                : w.scan_success_at
                  ? "Last successful scan"
                  : "Waiting for first scan"
            }}</span>
            @if (w.scan_success_at) {
              <small
                >{{
                  w.scan_success_at | date: "MMM d, HH:mm" : "UTC"
                }}
                UTC</small
              >
            }
          </div>
          @if (w.scan_error) {
            <p class="inline-error">{{ w.scan_error }}</p>
          }
          <div class="wallet-actions">
            @if (!w.archived_at) {
              <button class="text-button" [disabled]="busy()" (click)="edit(w)">
                Edit description
              </button>
              @if (!w.is_default) {
                <button
                  class="text-button"
                  [disabled]="busy()"
                  (click)="makeDefault(w)"
                >
                  Set default
                </button>
              }
              <button
                class="text-button destructive"
                [disabled]="busy()"
                (click)="archive(w)"
              >
                Archive
              </button>
            }
          </div>
        </article>
      } @empty {
        <section class="panel form-panel">
          <h2>Add your first receiving wallet</h2>
          <p class="muted">
            Register an existing public address using the form below.
          </p>
        </section>
      }
    </div>
    <section class="panel form-panel">
      <div class="panel-heading">
        <div>
          <h2>{{ editId ? "Edit wallet" : "Register a receiving wallet" }}</h2>
          <p>We never ask for private keys or recovery phrases.</p>
        </div>
      </div>
      <form (ngSubmit)="save()">
        <div class="form-row">
          <div>
            <label for="description">Description</label
            ><input
              id="description"
              name="description"
              [(ngModel)]="description"
              maxlength="120"
              placeholder="Main business wallet"
              required
            />
          </div>
          <div>
            <label for="chain">Blockchain</label
            ><select
              id="chain"
              name="chain"
              [(ngModel)]="chain"
              [disabled]="!!editId"
            >
              <option value="ethereum">Ethereum</option>
              <option value="solana">Solana</option>
              <option value="bsc">BNB Smart Chain</option>
            </select>
          </div>
        </div>
        <label for="address">Public receiving address</label
        ><input
          id="address"
          name="address"
          [(ngModel)]="address"
          class="mono"
          [disabled]="!!editId"
          required
          autocomplete="off"
        /><small
          >For Solana, use the wallet address rather than a token-account
          address.</small
        ><label class="check"
          ><input type="checkbox" name="default" [(ngModel)]="isDefault" />Use
          as default receiving wallet</label
        >
        <div class="form-actions">
          <button class="primary" [disabled]="busy()">
            {{ editId ? "Save wallet" : "Register wallet →" }}
          </button>
          @if (editId) {
            <button type="button" class="secondary" (click)="reset()">
              Cancel edit
            </button>
          }
        </div>
      </form>
    </section>
    <p class="helper">
      Enable the network and its explorer credentials in
      <a routerLink="/settings">Settings</a> before creating payments. Archived
      wallets retain their history and active monitoring.
    </p>`,
})
export class WalletsComponent extends ViewState {
  api = inject(ApiService);
  wallets: Wallet[] = [];
  description = "";
  chain = "ethereum";
  address = "";
  isDefault = false;
  editId = "";
  constructor() {
    super();
    void this.run(() => this.load());
  }
  async load() {
    this.wallets = await this.api.request("/wallets");
  }
  edit(w: Wallet) {
    this.editId = w.id;
    this.description = w.description;
    this.chain = w.chain;
    this.address = w.address;
    this.isDefault = w.is_default;
    document.getElementById("description")?.focus();
  }
  reset() {
    this.editId = "";
    this.description = "";
    this.address = "";
    this.isDefault = false;
  }
  save() {
    void this.run(async () => {
      await this.api.request(
        "/wallets" + (this.editId ? "/" + this.editId : ""),
        this.editId ? "PATCH" : "POST",
        this.editId
          ? { description: this.description, is_default: this.isDefault }
          : {
              description: this.description,
              chain: this.chain,
              address: this.address,
              is_default: this.isDefault,
            },
      );
      this.reset();
      await this.load();
      this.notice.set("Wallet saved.");
    });
  }
  makeDefault(w: Wallet) {
    void this.run(async () => {
      await this.api.request("/wallets/" + w.id, "PATCH", { is_default: true });
      await this.load();
    });
  }
  archive(w: Wallet) {
    if (
      !confirm(
        "Archive this wallet? Existing requests and payment history will be kept.",
      )
    )
      return;
    void this.run(async () => {
      await this.api.request("/wallets/" + w.id, "DELETE");
      await this.load();
    });
  }
  scan() {
    void this.run(async () => {
      const r = await this.api.request("/monitoring/scan", "POST", {});
      await this.load();
      this.notice.set(r.message);
    });
  }
}
