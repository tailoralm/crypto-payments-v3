import { Component, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { environment } from '../../environments/environment';
import { CommonModule } from '@angular/common';

interface Contract {
  id: string;
  chain: string;
  contract_address: string;
  symbol: string;
  decimals: number;
  created_at: string;
}

@Component({
  selector: 'app-custom-contracts',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  template: `
    <div class="page-container">
      <div class="header-row">
        <h1>Custom Contracts</h1>
        <button class="btn-primary" (click)="showForm = true">+ Add Contract</button>
      </div>

      @if (error()) {
        <div class="error-banner">{{ error() }}</div>
      }

      @if (showForm) {
        <div class="form-card">
          <h3>New Contract</h3>
          <div class="form-row">
            <div class="field">
              <label>Chain</label>
              <select [(ngModel)]="formChain">
                <option value="ethereum">Ethereum</option>
                <option value="solana">Solana</option>
              </select>
            </div>
            <div class="field">
              <label>Contract Address</label>
              <input [(ngModel)]="formAddress" placeholder="0x... or Solana address" />
            </div>
          </div>
          <div class="form-row">
            <div class="field">
              <label>Symbol</label>
              <input [(ngModel)]="formSymbol" placeholder="e.g. USDC" />
            </div>
            <div class="field">
              <label>Decimals</label>
              <input type="number" [(ngModel)]="formDecimals" />
            </div>
          </div>
          <div class="form-actions">
            <button class="btn-primary" (click)="save()" [disabled]="saving()">{{ saving() ? 'Saving...' : 'Save' }}</button>
            <button class="btn-secondary" (click)="showForm = false">Cancel</button>
          </div>
        </div>
      }

      <table class="table">
        <thead>
          <tr><th>Chain</th><th>Address</th><th>Symbol</th><th>Decimals</th><th>Actions</th></tr>
        </thead>
        <tbody>
          @for (c of contracts(); track c.id) {
            <tr>
              <td>{{ c.chain }}</td>
              <td class="mono">{{ c.contract_address | slice:0:14 }}...</td>
              <td>{{ c.symbol }}</td>
              <td>{{ c.decimals }}</td>
              <td><button class="btn-sm btn-danger" (click)="remove(c.id)">Delete</button></td>
            </tr>
          } @empty {
            <tr><td colspan="5">No custom contracts. Add one to track additional tokens.</td></tr>
          }
        </tbody>
      </table>
    </div>
  `,
  styles: [`
    .header-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; }
    h1 { margin: 0; }
    .btn-primary { padding: 0.5rem 1rem; background: var(--primary-color); color: var(--primary-color-text); border: none; border-radius: 6px; cursor: pointer; }
    .btn-primary:disabled { opacity: 0.6; }
    .btn-secondary { padding: 0.5rem 1rem; background: transparent; border: 1px solid var(--surface-border); border-radius: 6px; cursor: pointer; }
    .btn-sm { padding: 0.25rem 0.5rem; border: 1px solid var(--surface-border); border-radius: 4px; cursor: pointer; font-size: 0.8rem; }
    .btn-danger { color: #c0392b; border-color: #c0392b; }
    .error-banner { background: #fce4e4; color: #c0392b; padding: 0.75rem; border-radius: 6px; margin-bottom: 1rem; }
    .form-card { background: var(--surface-card); padding: 1.25rem; border-radius: 8px; margin-bottom: 1rem; }
    .form-row { display: flex; gap: 1rem; margin-bottom: 0.75rem; }
    .field { flex: 1; }
    .field label { display: block; font-size: 0.85rem; margin-bottom: 0.25rem; }
    .field input, .field select { width: 100%; padding: 0.5rem; border: 1px solid var(--surface-border); border-radius: 6px; }
    .form-actions { display: flex; gap: 0.5rem; margin-top: 0.75rem; }
    .table { width: 100%; border-collapse: collapse; background: var(--surface-card); border-radius: 8px; overflow: hidden; }
    .table th, .table td { padding: 0.75rem; text-align: left; border-bottom: 1px solid var(--surface-border); }
    .table th { background: var(--surface-ground); font-size: 0.85rem; }
    .mono { font-family: monospace; font-size: 0.9rem; }
  `]
})
export class CustomContractsComponent {
  private http = inject(HttpClient);
  private api = environment.apiBaseUrl;

  contracts = signal<Contract[]>([]);
  error = signal('');
  saving = signal(false);
  showForm = false;

  formChain = 'ethereum';
  formAddress = '';
  formSymbol = '';
  formDecimals = 6;

  constructor() { this.load(); }

  load() {
    this.http.get<Contract[]>(`${this.api}/custom-contracts`).subscribe({
      next: (c) => this.contracts.set(c),
      error: () => this.error.set('Failed to load contracts'),
    });
  }

  save() {
    this.saving.set(true);
    this.http.post(`${this.api}/custom-contracts`, {
      chain: this.formChain,
      contract_address: this.formAddress,
      symbol: this.formSymbol,
      decimals: this.formDecimals,
    }).subscribe({
      next: () => { this.load(); this.showForm = false; this.saving.set(false); },
      error: () => { this.error.set('Failed to save contract'); this.saving.set(false); },
      complete: () => this.saving.set(false),
    });
  }

  remove(id: string) {
    this.http.delete(`${this.api}/custom-contracts/${id}`).subscribe({
      next: () => this.load(),
      error: (err) => this.error.set(err.error?.error?.message || 'Failed to delete contract'),
    });
  }
}
