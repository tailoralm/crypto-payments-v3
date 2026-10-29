import { Component, inject, OnDestroy } from "@angular/core";
import { CommonModule } from "@angular/common";
import { ActivatedRoute } from "@angular/router";
import { ApiService, ViewState, Payment } from "../shared/api.service";
import { StatusComponent, CountdownComponent } from "../shared/ui";
@Component({
  standalone: true,
  imports: [CommonModule, StatusComponent, CountdownComponent],
  template: ` <main class="public-billing">
    <div class="public-brand">CryptoPay <span>Payment request</span></div>
    @if (error()) {
      <div class="alert error" role="alert">{{ error() }}</div>
      <button class="secondary" (click)="load()">Retry</button>
    }
    @if (p) {
      <section class="panel bill-card">
        <div class="bill-top">
          <span class="eyebrow mono">{{ p.reference }}</span
          ><app-status [value]="p.status" />
        </div>
        <h1>{{ p.description }}</h1>
        <h2 class="bill-amount">{{ p.value }} <span>USDT</span></h2>
        <p class="muted">
          {{ p.snapshot.asset_label }} ·
          {{ p.snapshot.chain | titlecase }} mainnet
        </p>
        @if (p.qr) {
          <img
            class="payment-qr"
            [src]="p.qr"
            alt="Scan to prepare this token payment"
          /><a class="primary" [href]="p.payment_uri"
            >Open compatible wallet ↗</a
          >
          <p class="helper">
            Or copy the address and exact amount into your wallet.
          </p>
        } @else {
          <div class="alert">
            This request is no longer payable. Do not send additional funds.
          </div>
        }
        <dl class="bill-fields">
          <dt>Receiving address</dt>
          <dd class="mono break">{{ p.snapshot.address }}</dd>
          <dt>Exact amount</dt>
          <dd>{{ p.value }} USDT</dd>
          <dt>Token contract / mint</dt>
          <dd class="mono break">{{ p.snapshot.asset_address }}</dd>
          <dt>Deadline (UTC)</dt>
          <dd>{{ p.expires_at | date: "medium" : "UTC" }}</dd>
          @if (p.qr) {
            <dt>Time remaining</dt>
            <dd><app-countdown [expires]="p.expires_at" /></dd>
          }
          @if (p.expected_from_address) {
            <dt>Required sender</dt>
            <dd class="mono break">{{ p.expected_from_address }}</dd>
          }
          @if (p.concluded_tx_hash) {
            <dt>Matched transaction</dt>
            <dd class="mono break">{{ p.concluded_tx_hash }}</dd>
          }
        </dl>
        <p class="helper">
          Send one exact transfer using the stated asset and network. Native
          network coin is needed for fees. Payment detection is periodic; status
          may take time to update.
        </p>
        <button class="secondary wide" [disabled]="busy()" (click)="download()">
          ↓ Download payment PDF
        </button>
      </section>
    } @else if (busy()) {
      <p role="status">Loading payment request…</p>
    }
    <p class="public-footer">
      Non-custodial payments · Status refreshes every 30 seconds
    </p>
  </main>`,
})
export class PublicBillingComponent extends ViewState implements OnDestroy {
  api = inject(ApiService);
  route = inject(ActivatedRoute);
  token = this.route.snapshot.paramMap.get("token")!;
  p: Payment | null = null;
  timer = setInterval(() => this.load(), 30000);
  constructor() {
    super();
    this.load();
  }
  load() {
    void this.run(
      async () => (this.p = await this.api.request("/billing/" + this.token)),
    );
  }
  ngOnDestroy() {
    clearInterval(this.timer);
  }
  download() {
    void this.run(() =>
      this.api.download("/billing/" + this.token + "/pdf", this.p!.reference),
    );
  }
}
