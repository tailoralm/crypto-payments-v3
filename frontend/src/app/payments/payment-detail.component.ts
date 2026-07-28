import { Component, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { environment } from '../../environments/environment';
import { CommonModule } from '@angular/common';

interface PaymentDetail {
  id: string;
  description: string;
  value: string;
  status: string;
  wallet_address: string;
  wallet_chain: string;
  token_symbol: string;
  expires_at: string;
  created_at: string;
  concluded_tx_hash: string | null;
  concluded_from_address: string | null;
  concluded_at: string | null;
  expected_from_address: string | null;
}

@Component({
  selector: 'app-payment-detail',
  standalone: true,
  imports: [CommonModule, RouterModule],
  template: `
    <div class="page-container">
      <a routerLink="/payments" class="back-link">← Back to Payments</a>

      @if (loading()) {
        <div class="loading">Loading...</div>
      } @else if (error()) {
        <div class="error-banner">{{ error() }}</div>
      } @else {
        @let p = payment()!;
        <h1>{{ p.description }}</h1>
        <div class="detail-grid">
          <div class="detail-row">
            <span class="label">Status</span>
            <span class="badge" [class.pending]="p.status === 'PENDING'" [class.concluded]="p.status === 'CONCLUDED'" [class.expired]="p.status === 'EXPIRED'">{{ p.status }}</span>
          </div>
          <div class="detail-row">
            <span class="label">Value</span>
            <span>{{ p.value }} {{ p.token_symbol }}</span>
          </div>
          <div class="detail-row">
            <span class="label">Wallet</span>
            <span class="mono">{{ p.wallet_address }} ({{ p.wallet_chain }})</span>
          </div>
          <div class="detail-row">
            <span class="label">Created</span>
            <span>{{ p.created_at | date:'medium' }}</span>
          </div>
          <div class="detail-row">
            <span class="label">Expires</span>
            <span>{{ p.expires_at | date:'medium' }}</span>
          </div>
          @if (p.expected_from_address) {
            <div class="detail-row">
              <span class="label">Expected Sender</span>
              <span class="mono">{{ p.expected_from_address }}</span>
            </div>
          }
          @if (p.status === 'CONCLUDED') {
            <div class="detail-row">
              <span class="label">TX Hash</span>
              <span class="mono">{{ p.concluded_tx_hash }}</span>
            </div>
            <div class="detail-row">
              <span class="label">From</span>
              <span class="mono">{{ p.concluded_from_address }}</span>
            </div>
            <div class="detail-row">
              <span class="label">Concluded At</span>
              <span>{{ p.concluded_at | date:'medium' }}</span>
            </div>
          }
        </div>
      }
    </div>
  `,
  styles: [`
    .back-link { display: inline-block; margin-bottom: 1rem; color: var(--primary-color); text-decoration: none; }
    h1 { margin: 0 0 1.5rem; }
    .loading { padding: 2rem; text-align: center; }
    .error-banner { background: #fce4e4; color: #c0392b; padding: 0.75rem; border-radius: 6px; }
    .detail-grid { background: var(--surface-card); padding: 1.25rem; border-radius: 8px; }
    .detail-row { display: flex; padding: 0.75rem 0; border-bottom: 1px solid var(--surface-border); }
    .detail-row:last-child { border-bottom: none; }
    .label { width: 160px; font-weight: 600; color: var(--text-color-secondary); font-size: 0.9rem; }
    .mono { font-family: monospace; font-size: 0.85rem; word-break: break-all; }
    .badge { padding: 0.2rem 0.5rem; border-radius: 4px; font-size: 0.8rem; font-weight: 600; }
    .badge.pending { background: #fff3e0; color: #e65100; }
    .badge.concluded { background: #e8f5e9; color: #2e7d32; }
    .badge.expired { background: #fce4e4; color: #c0392b; }
  `]
})
export class PaymentDetailComponent {
  private http = inject(HttpClient);
  private route = inject(ActivatedRoute);
  private api = environment.apiBaseUrl;

  payment = signal<PaymentDetail | null>(null);
  loading = signal(true);
  error = signal('');

  constructor() {
    const id = this.route.snapshot.paramMap.get('id')!;
    this.http.get<PaymentDetail>(`${this.api}/payments/${id}`).subscribe({
      next: (p) => { this.payment.set(p); this.loading.set(false); },
      error: () => { this.error.set('Failed to load payment'); this.loading.set(false); },
    });
  }
}
