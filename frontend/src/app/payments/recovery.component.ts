import { Component, inject } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { ApiService, ViewState, Wallet } from "../shared/api.service";
@Component({
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="page-heading">
      <div>
        <h1>Payment recovery</h1>
        <p class="muted">
          Review verified, unassigned transfers. Scanning never accepts a
          payment automatically.
        </p>
      </div>
    </div>
    @if (error()) {
      <p class="alert error" role="alert">{{ error() }}</p>
    }
    @if (notice()) {
      <p class="alert good" role="status">{{ notice() }}</p>
    }
    <section class="panel form-panel">
      <form (ngSubmit)="scan()">
        <label for="recovery-wallet">Wallet</label
        ><select
          id="recovery-wallet"
          name="wallet"
          [(ngModel)]="wallet"
          required
        >
          @for (w of wallets; track w.id) {
            <option [value]="w.id">{{ w.description }} · {{ w.chain }}</option>
          }
        </select>
        <label for="recovery-from">From (local time)</label
        ><input
          id="recovery-from"
          name="from"
          type="datetime-local"
          [(ngModel)]="from"
          required
        />
        <label for="recovery-to">To (local time)</label
        ><input
          id="recovery-to"
          name="to"
          type="datetime-local"
          [(ngModel)]="to"
          required
        />
        <p class="helper">
          At most 30 days per scan. Explorer quotas and pagination limits apply.
        </p>
        <button class="primary" [disabled]="busy()">Scan for recovery</button>
      </form>
    </section>
    @for (t of transfers; track t.id) {
      <section class="panel">
        <h2>Verified transfer</h2>
        <p class="mono break">{{ t.data.tx }}</p>
        <p>{{ t.data.evidence }}</p>
        <p>
          Sender: <span class="mono break">{{ t.data.from }}</span>
        </p>
        <p>Atomic amount: {{ t.data.amount }}</p>
        @for (p of t.candidates; track p.id) {
          <article>
            <h3>{{ p.reference }} · {{ p.status }}</h3>
            <p>
              Payable {{ p.payable_amount }} USDT · Difference (atomic units)
              {{ p.amount_difference }}
            </p>
            <p>
              Late: {{ p.late ? "yes" : "no" }} · Before creation:
              {{ p.before_creation ? "yes" : "no" }} · Sender differs:
              {{ p.sender_mismatch ? "yes" : "no" }}
            </p>
            <label [for]="'reason-' + t.id + '-' + p.id"
              >Reason for accepting this payment</label
            ><input
              [id]="'reason-' + t.id + '-' + p.id"
              [(ngModel)]="reasons[t.id + '-' + p.id]"
              maxlength="1000"
            /><button
              class="secondary"
              [disabled]="busy() || !reasons[t.id + '-' + p.id]?.trim()"
              (click)="accept(t.id, p.id)"
            >
              Accept for {{ p.reference }}
            </button>
          </article>
        }
      </section>
    }
  `,
})
export class RecoveryComponent extends ViewState {
  api = inject(ApiService);
  wallets: Wallet[] = [];
  wallet = "";
  from = "";
  to = "";
  transfers: any[] = [];
  reasons: Record<string, string> = {};
  constructor() {
    super();
    void this.run(async () => {
      this.wallets = await this.api.request("/wallets");
      this.wallet = this.wallets[0]?.id || "";
    });
  }
  scan() {
    void this.run(async () => {
      this.transfers = await this.api.request("/recovery/scan", "POST", {
        wallet_id: this.wallet,
        date_from: new Date(this.from).toISOString(),
        date_to: new Date(this.to).toISOString(),
      });
      this.notice.set(
        `${this.transfers.length} unassigned transfers available for review.`,
      );
    });
  }
  accept(transfer: string, payment: string) {
    if (
      !confirm(
        "Accept this transfer for the selected payment? This records your review and may trigger store fulfillment.",
      )
    )
      return;
    void this.run(async () => {
      await this.api.request("/recovery/accept", "POST", {
        transfer_id: transfer,
        payment_id: payment,
        reason: this.reasons[transfer + "-" + payment],
      });
      this.transfers = await this.api.request("/recovery/" + this.wallet);
      this.notice.set("Review recorded and payment marked successful.");
    });
  }
}
