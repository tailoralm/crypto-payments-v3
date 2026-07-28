import { Component, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { environment } from '../../environments/environment';
import { CommonModule } from '@angular/common';

interface Configs {
  etherscan_api_key: string | null;
  solscan_api_key: string | null;
  rate_limit_enabled: boolean;
  rate_limit_max_requests: number | null;
  rate_limit_window_minutes: number | null;
}

interface ApiToken {
  id: string;
  label: string | null;
  last_used_at: string | null;
  created_at: string;
}

@Component({
  selector: 'app-configs',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  template: `
    <div class="page-container">
      <h1>Configs</h1>

      @if (error()) {
        <div class="error-banner">{{ error() }}</div>
      }

      <div class="section">
        <h2>API Keys</h2>
        <div class="form-card">
          <div class="field">
            <label>Etherscan API Key</label>
            <input [(ngModel)]="etherscanKey" placeholder="Encrypted at rest" />
          </div>
          <div class="field">
            <label>Solscan API Key</label>
            <input [(ngModel)]="solscanKey" placeholder="Encrypted at rest" />
          </div>
          <button class="btn-primary" (click)="saveKeys()" [disabled]="savingKeys()">{{ savingKeys() ? 'Saving...' : 'Save API Keys' }}</button>
        </div>
      </div>

      <div class="section">
        <h2>Rate Limiting</h2>
        <div class="form-card">
          <div class="field-checkbox">
            <label><input type="checkbox" [(ngModel)]="rateLimitEnabled" /> Enable rate limiting</label>
          </div>
          <div class="field">
            <label>Max Requests</label>
            <input type="number" [(ngModel)]="rateLimitMax" />
          </div>
          <div class="field">
            <label>Window (minutes)</label>
            <input type="number" [(ngModel)]="rateLimitWindow" />
          </div>
          <button class="btn-primary" (click)="saveRateLimit()" [disabled]="savingRateLimit()">{{ savingRateLimit() ? 'Saving...' : 'Save Rate Limit' }}</button>
        </div>
      </div>

      <div class="section">
        <div class="header-row">
          <h2>API Tokens</h2>
          <button class="btn-primary" (click)="generateToken()" [disabled]="generating()">{{ generating() ? 'Generating...' : 'Generate Token' }}</button>
        </div>

        @if (rawToken()) {
          <div class="token-reveal">
            <strong>New API Token (shown once):</strong>
            <code>{{ rawToken() }}</code>
            <p class="warning">Save this token — you won't see it again!</p>
            <button class="btn-sm" (click)="rawToken.set('')">Dismiss</button>
          </div>
        }

        <table class="table">
          <thead>
            <tr><th>Label</th><th>Last Used</th><th>Created</th><th>Actions</th></tr>
          </thead>
          <tbody>
            @for (t of tokens(); track t.id) {
              <tr>
                <td>{{ t.label || '-' }}</td>
                <td>{{ t.last_used_at ? (t.last_used_at | date:'short') : 'Never' }}</td>
                <td>{{ t.created_at | date:'short' }}</td>
                <td><button class="btn-sm btn-danger" (click)="revoke(t.id)">Revoke</button></td>
              </tr>
            } @empty {
              <tr><td colspan="4">No API tokens</td></tr>
            }
          </tbody>
        </table>
      </div>
    </div>
  `,
  styles: [`
    h1 { margin: 0 0 1rem; }
    h2 { margin: 0 0 0.75rem; }
    .section { margin-bottom: 2rem; }
    .header-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem; }
    .form-card { background: var(--surface-card); padding: 1.25rem; border-radius: 8px; max-width: 500px; }
    .field { margin-bottom: 0.75rem; }
    .field label { display: block; font-size: 0.85rem; margin-bottom: 0.25rem; }
    .field input { width: 100%; padding: 0.5rem; border: 1px solid var(--surface-border); border-radius: 6px; }
    .field-checkbox { margin-bottom: 0.75rem; }
    .btn-primary { padding: 0.5rem 1rem; background: var(--primary-color); color: var(--primary-color-text); border: none; border-radius: 6px; cursor: pointer; }
    .btn-primary:disabled { opacity: 0.6; }
    .btn-sm { padding: 0.25rem 0.5rem; border: 1px solid var(--surface-border); border-radius: 4px; cursor: pointer; font-size: 0.8rem; }
    .btn-danger { color: #c0392b; border-color: #c0392b; }
    .error-banner { background: #fce4e4; color: #c0392b; padding: 0.75rem; border-radius: 6px; margin-bottom: 1rem; }
    .token-reveal { background: #fff8e1; padding: 1rem; border-radius: 8px; margin-bottom: 1rem; }
    .token-reveal code { display: block; padding: 0.5rem; background: #fff; border: 1px solid #ffe082; border-radius: 4px; word-break: break-all; margin: 0.5rem 0; }
    .token-reveal .warning { color: #e65100; font-size: 0.85rem; margin: 0.25rem 0; }
    .table { width: 100%; border-collapse: collapse; background: var(--surface-card); border-radius: 8px; overflow: hidden; }
    .table th, .table td { padding: 0.75rem; text-align: left; border-bottom: 1px solid var(--surface-border); }
    .table th { background: var(--surface-ground); font-size: 0.85rem; }
  `]
})
export class ConfigsComponent {
  private http = inject(HttpClient);
  private api = environment.apiBaseUrl;

  error = signal('');
  savingKeys = signal(false);
  savingRateLimit = signal(false);
  generating = signal(false);

  etherscanKey = '';
  solscanKey = '';
  rateLimitEnabled = false;
  rateLimitMax: number | null = null;
  rateLimitWindow: number | null = null;
  tokens = signal<ApiToken[]>([]);
  rawToken = signal('');

  constructor() {
    this.loadConfigs();
    this.loadTokens();
  }

  loadConfigs() {
    this.http.get<Configs>(`${this.api}/configs`).subscribe({
      next: (c) => {
        this.etherscanKey = c.etherscan_api_key || '';
        this.solscanKey = c.solscan_api_key || '';
        this.rateLimitEnabled = c.rate_limit_enabled;
        this.rateLimitMax = c.rate_limit_max_requests;
        this.rateLimitWindow = c.rate_limit_window_minutes;
      },
      error: () => this.error.set('Failed to load configs'),
    });
  }

  loadTokens() {
    this.http.get<ApiToken[]>(`${this.api}/api-tokens`).subscribe({
      next: (t) => this.tokens.set(t),
    });
  }

  saveKeys() {
    this.savingKeys.set(true);
    this.http.patch(`${this.api}/configs`, {
      etherscan_api_key: this.etherscanKey || null,
      solscan_api_key: this.solscanKey || null,
    }).subscribe({
      next: () => { this.error.set(''); this.savingKeys.set(false); },
      error: () => { this.error.set('Failed to save API keys'); this.savingKeys.set(false); },
      complete: () => this.savingKeys.set(false),
    });
  }

  saveRateLimit() {
    this.savingRateLimit.set(true);
    this.http.patch(`${this.api}/configs`, {
      rate_limit_enabled: this.rateLimitEnabled,
      rate_limit_max_requests: this.rateLimitMax,
      rate_limit_window_minutes: this.rateLimitWindow,
    }).subscribe({
      next: () => { this.error.set(''); this.savingRateLimit.set(false); },
      error: () => { this.error.set('Failed to save rate limit'); this.savingRateLimit.set(false); },
      complete: () => this.savingRateLimit.set(false),
    });
  }

  generateToken() {
    this.generating.set(true);
    this.http.post<{ id: string; raw_token: string }>(`${this.api}/api-tokens`, {}).subscribe({
      next: (t) => { this.rawToken.set(t.raw_token); this.loadTokens(); this.generating.set(false); },
      error: () => { this.error.set('Failed to generate token'); this.generating.set(false); },
      complete: () => this.generating.set(false),
    });
  }

  revoke(id: string) {
    this.http.delete(`${this.api}/api-tokens/${id}`).subscribe({
      next: () => this.loadTokens(),
      error: () => this.error.set('Failed to revoke token'),
    });
  }
}
