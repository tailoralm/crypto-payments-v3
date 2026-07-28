import { Component, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { environment } from '../../environments/environment';
import { CommonModule } from '@angular/common';

interface Wallet { id: string; address: string; chain: string; is_default: boolean; }
interface Token { id: string; symbol: string; chain: string; }

@Component({
  selector: 'app-payment-form',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  template: `
    <div class="page-container">
      <h1>New Payment Intention</h1>

      @if (error()) {
        <div class="error-banner">{{ error() }}</div>
      }

      <div class="form-card">
        <div class="field">
          <label>Description</label>
          <input [(ngModel)]="description" placeholder="Invoice #123" />
        </div>
        <div class="field">
          <label>Wallet</label>
          <select [(ngModel)]="walletId">
            @for (w of wallets(); track w.id) {
              <option [value]="w.id">{{ w.address | slice:0:10 }}... ({{ w.chain }}{{ w.is_default ? ', default' : '' }})</option>
            }
          </select>
        </div>
        <div class="field">
          <label>Token</label>
          <select [(ngModel)]="tokenId">
            @for (t of tokens(); track t.id) {
              <option [value]="t.id">{{ t.symbol }} ({{ t.chain }})</option>
            }
          </select>
        </div>
        <div class="field">
          <label>Value (USDT)</label>
          <input type="number" step="0.01" [(ngModel)]="value" />
        </div>
        <div class="field">
          <label>Expiration (hours)</label>
          <input type="number" [(ngModel)]="expirationHours" />
        </div>
        <div class="field">
          <label>Expected Sender Address (optional)</label>
          <input [(ngModel)]="expectedFrom" placeholder="Leave empty for any sender" />
        </div>
        <div class="form-actions">
          <button class="btn-primary" (click)="submit()" [disabled]="saving()">{{ saving() ? 'Creating...' : 'Create Payment' }}</button>
          <a routerLink="/payments" class="btn-secondary">Cancel</a>
        </div>
      </div>
    </div>
  `,
  styles: [`
    h1 { margin: 0 0 1rem; }
    .form-card { background: var(--surface-card); padding: 1.25rem; border-radius: 8px; max-width: 500px; }
    .field { margin-bottom: 1rem; }
    .field label { display: block; font-size: 0.85rem; margin-bottom: 0.25rem; }
    .field input, .field select { width: 100%; padding: 0.5rem; border: 1px solid var(--surface-border); border-radius: 6px; }
    .form-actions { display: flex; gap: 0.5rem; margin-top: 1rem; }
    .btn-primary { padding: 0.5rem 1rem; background: var(--primary-color); color: var(--primary-color-text); border: none; border-radius: 6px; cursor: pointer; }
    .btn-primary:disabled { opacity: 0.6; }
    .btn-secondary { padding: 0.5rem 1rem; background: transparent; border: 1px solid var(--surface-border); border-radius: 6px; cursor: pointer; text-decoration: none; color: inherit; }
    .error-banner { background: #fce4e4; color: #c0392b; padding: 0.75rem; border-radius: 6px; margin-bottom: 1rem; }
  `]
})
export class PaymentFormComponent {
  private http = inject(HttpClient);
  private router = inject(Router);
  private api = environment.apiBaseUrl;

  wallets = signal<Wallet[]>([]);
  tokens = signal<Token[]>([]);
  saving = signal(false);
  error = signal('');

  walletId = '';
  tokenId = '';
  description = '';
  value = 0;
  expirationHours = 24;
  expectedFrom = '';

  constructor() {
    this.http.get<Wallet[]>(`${this.api}/wallets`).subscribe((w) => {
      this.wallets.set(w);
      const def = w.find((x) => x.is_default);
      if (def) this.walletId = def.id;
    });
    this.http.get<Token[]>(`${this.api}/tokens`).subscribe((t) => {
      this.tokens.set(t);
      if (t.length > 0) this.tokenId = t[0].id;
    });
  }

  submit() {
    this.saving.set(true);
    this.error.set('');
    this.http.post(`${this.api}/payments`, {
      wallet_id: this.walletId,
      description: this.description,
      value: this.value,
      token_source: 'system',
      token_id: this.tokenId,
      expiration_hours: this.expirationHours,
      expected_from_address: this.expectedFrom || null,
    }).subscribe({
      next: () => this.router.navigate(['/payments']),
      error: () => { this.error.set('Failed to create payment'); this.saving.set(false); },
      complete: () => this.saving.set(false),
    });
  }
}
