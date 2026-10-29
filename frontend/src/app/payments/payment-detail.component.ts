import { Component, inject, OnDestroy } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { ActivatedRoute, RouterLink } from "@angular/router";
import { ApiService, ViewState, Payment } from "../shared/api.service";
import { StatusComponent, CountdownComponent } from "../shared/ui";
@Component({
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterLink,
    StatusComponent,
    CountdownComponent,
  ],
  template: `
    <a class="back-link" routerLink="/payments">← Payment requests</a>
    @if (error()) {
      <div class="alert error" role="alert">{{ error() }}</div>
    }
    @if (notice()) {
      <div class="alert good" role="status">{{ notice() }}</div>
    }
    @if (p) {
      <div class="page-heading">
        <div>
          <span class="eyebrow mono">{{ p.reference }}</span>
          <h1>{{ p.description }}</h1>
          <p class="muted">
            Created {{ p.created_at | date: "medium" : "UTC" }} UTC
          </p>
        </div>
        <app-status [value]="p.status" />
      </div>
      <div class="detail-layout">
        <section class="panel bill-card">
          <div class="bill-top">
            <span class="eyebrow">PAYMENT REQUEST</span
            ><span class="subtle-tag">{{
              p.snapshot.chain === "bsc"
                ? "BNB Smart Chain"
                : (p.snapshot.chain | titlecase)
            }}</span>
          </div>
          <h2 class="bill-amount">{{ p.value }} <span>USDT</span></h2>
          <p class="muted">{{ p.snapshot.asset_label }}</p>
          @if (p.qr) {
            <img class="payment-qr" [src]="p.qr" alt="Wallet payment QR code" />
            <p class="helper">Scan with a compatible wallet</p>
          } @else {
            <div class="alert">
              This request is no longer payable. Do not send additional funds.
            </div>
          }
          <dl class="bill-fields">
            <dt>Receiving address</dt>
            <dd class="mono break">{{ p.snapshot.address }}</dd>
            <dt>Token contract / mint</dt>
            <dd class="mono break">{{ p.snapshot.asset_address }}</dd>
            <dt>Deadline (UTC)</dt>
            <dd>{{ p.expires_at | date: "medium" : "UTC" }}</dd>
            @if (p.expected_from_address) {
              <dt>Required sender</dt>
              <dd class="mono break">{{ p.expected_from_address }}</dd>
            }
            @if (p.concluded_tx_hash) {
              <dt>Matched transaction</dt>
              <dd class="mono break">
                <a [href]="explorer()" target="_blank" rel="noopener noreferrer"
                  >{{ p.concluded_tx_hash }} ↗</a
                >
              </dd>
            }
            @if (p.paid_at) {
              <dt>Paid at (UTC)</dt>
              <dd>{{ p.paid_at | date: "medium" : "UTC" }}</dd>
            }
          </dl>
          <p class="helper">
            Send the exact token and amount on this network. Keep native network
            coin available for transaction fees.
          </p>
        </section>
        <aside>
          <section class="panel form-panel">
            <h2>Share & manage</h2>
            <button
              class="secondary wide"
              [disabled]="busy()"
              (click)="download()"
            >
              ↓ Download billing PDF
            </button>
            @if (p.public_url) {
              <a
                class="secondary wide"
                [href]="p.public_url"
                target="_blank"
                rel="noopener noreferrer"
                >Open public billing page ↗</a
              ><button class="text-button wide" (click)="copy()">
                Copy public link
              </button>
            } @else {
              <p class="helper">
                Local-only billing. Configure a public URL in Settings to share
                a live page.
              </p>
            }
            @if (p.smtp_enabled) {
              <form (ngSubmit)="send()">
                <label for="recipient">Send PDF by email</label
                ><input
                  id="recipient"
                  name="recipient"
                  type="email"
                  [(ngModel)]="recipient"
                  placeholder="customer@example.com"
                  required
                /><button class="primary wide" [disabled]="busy()">
                  Send payment request
                </button>
              </form>
            } @else {
              <p class="helper">
                Configure SMTP in <a routerLink="/settings">Settings</a> to
                email this PDF.
              </p>
            }
            @if (p.status === "IN_PROGRESS") {
              <hr />
              <span class="eyebrow">TIME REMAINING</span>
              <p><app-countdown [expires]="p.expires_at" /></p>
              <button
                class="danger wide"
                [disabled]="busy()"
                (click)="cancel()"
              >
                Cancel payment request
              </button>
            }
          </section>
          <p class="helper">
            Status refreshes every 30 seconds. PDF status is a snapshot at
            download time.
          </p>
        </aside>
      </div>
    }
  `,
})
export class PaymentDetailComponent extends ViewState implements OnDestroy {
  api = inject(ApiService);
  route = inject(ActivatedRoute);
  p: Payment | null = null;
  recipient = "";
  id = this.route.snapshot.paramMap.get("id")!;
  timer = setInterval(() => this.load(), 30000);
  constructor() {
    super();
    this.load();
  }
  ngOnDestroy() {
    clearInterval(this.timer);
  }
  load() {
    void this.run(
      async () =>
        (this.p = await this.api.request("/payments/" + this.id + "/billing")),
    );
  }
  download() {
    void this.run(() =>
      this.api.download("/payments/" + this.id + "/pdf", this.p!.reference),
    );
  }
  copy() {
    void this.run(async () => {
      await navigator.clipboard.writeText(this.p!.public_url!);
      this.notice.set("Public link copied.");
    });
  }
  cancel() {
    if (
      !confirm(
        "Cancel this request permanently? This does not reverse any transfer.",
      )
    )
      return;
    void this.run(async () => {
      await this.api.request("/payments/" + this.id + "/cancel", "POST", {});
      this.p = await this.api.request("/payments/" + this.id + "/billing");
    });
  }
  send() {
    void this.run(async () => {
      const r = await this.api.request(
        "/payments/" + this.id + "/email",
        "POST",
        { to: this.recipient },
      );
      this.notice.set(r.message);
    });
  }
  explorer() {
    const c = this.p!.snapshot.chain;
    return (
      (c === "solana"
        ? "https://solscan.io/tx/"
        : c === "bsc"
          ? "https://bscscan.com/tx/"
          : "https://etherscan.io/tx/") + this.p!.concluded_tx_hash
    );
  }
}
