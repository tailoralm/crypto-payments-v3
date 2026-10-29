import { Component, inject } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { Router, RouterLink } from "@angular/router";
import { ApiService, ViewState, Wallet } from "../shared/api.service";
@Component({
  standalone: true,
  imports: [FormsModule, RouterLink],
  template: ` <a class="back-link" routerLink="/payments">← Payment requests</a>
    <div class="page-heading">
      <div>
        <span class="eyebrow">NEW REQUEST</span>
        <h1>Request a payment</h1>
        <p class="muted">Funds go directly to your receiving wallet.</p>
      </div>
    </div>
    <div class="form-layout">
      <section class="panel form-panel">
        @if (error()) {
          <div class="alert error" role="alert">{{ error() }}</div>
        }
        <form (ngSubmit)="submit()">
          <label for="description">What is this payment for?</label
          ><input
            id="description"
            name="description"
            [(ngModel)]="description"
            placeholder="e.g. Design services · October"
            maxlength="500"
            required
          />
          <label for="wallet">Receiving wallet</label
          ><select id="wallet" name="wallet" [(ngModel)]="walletId" required>
            <option value="" disabled>Select a wallet</option>
            @for (w of wallets; track w.id) {
              <option [value]="w.id">
                {{ w.description }} · {{ w.chain }}
              </option>
            }
          </select>
          @if (!wallets.length) {
            <p class="helper">
              Add a <a routerLink="/wallets">receiving wallet</a> and configure
              its explorer in Settings first.
            </p>
          }
          <div class="form-row">
            <div>
              <label for="amount">Exact amount (USDT)</label
              ><input
                id="amount"
                name="amount"
                type="text"
                inputmode="decimal"
                [(ngModel)]="amount"
                placeholder="0.00"
                pattern="[0-9]+([.][0-9]+)?"
                required
              /><small>Must arrive as one exact transfer.</small>
            </div>
            <div>
              <label for="expiry">Expires after (hours)</label
              ><input
                id="expiry"
                name="expiry"
                type="number"
                [(ngModel)]="hours"
                min="1"
                max="8760"
                required
              />
            </div>
          </div>
          <label for="sender"
            >Expected sender <span class="optional">optional</span></label
          ><input
            id="sender"
            name="sender"
            [(ngModel)]="sender"
            placeholder="Leave empty to accept any sender"
            autocomplete="off"
          />
          <div class="form-actions">
            <button class="primary" [disabled]="busy() || !wallets.length">
              {{ busy() ? "Creating…" : "Create payment request →" }}</button
            ><a routerLink="/payments" class="secondary">Cancel</a>
          </div>
        </form>
      </section>
      <aside class="form-aside">
        <h2>A request, ready to share.</h2>
        <p>
          Every request gets a printable PDF and a QR code for compatible
          wallets.
        </p>
        <ol>
          <li>Choose a wallet on the correct network.</li>
          <li>Set the exact amount and deadline.</li>
          <li>Share the PDF or your public billing link.</li>
        </ol>
        <div class="alert">
          A request expires permanently. Transfers discovered after final expiry
          will not reopen it.
        </div>
        <p class="muted">
          Monitoring requires an enabled explorer and your API credentials.
          Provider subscriptions may apply.
        </p>
      </aside>
    </div>`,
})
export class PaymentFormComponent extends ViewState {
  api = inject(ApiService);
  router = inject(Router);
  wallets: Wallet[] = [];
  walletId = "";
  description = "";
  amount = "";
  hours = 24;
  sender = "";
  constructor() {
    super();
    void this.run(async () => {
      this.wallets = (await this.api.request<Wallet[]>("/wallets")).filter(
        (w) => !w.archived_at,
      );
      this.walletId =
        (this.wallets.find((w) => w.is_default) || this.wallets[0])?.id || "";
    });
  }
  submit() {
    void this.run(async () => {
      const p = await this.api.request("/payments", "POST", {
        wallet_id: this.walletId,
        description: this.description,
        value: this.amount,
        expiration_hours: this.hours,
        expected_from_address: this.sender || null,
      });
      await this.router.navigate(["/payments", p.id]);
    });
  }
}
