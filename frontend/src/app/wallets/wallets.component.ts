import { Component, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { environment } from '../../environments/environment';
import { CommonModule } from '@angular/common';

interface Wallet {
  id: string;
  chain: string;
  address: string;
  description: string | null;
  is_default: boolean;
  created_at: string;
}

@Component({
  selector: 'app-wallets',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="page-container">
      <div class="header-row">
        <h1>Wallets</h1>
        <button class="btn-primary" (click)="showForm = true">+ Add Wallet</button>
      </div>

      @if (error()) {
        <div class="error-banner">{{ error() }}</div>
      }

      @if (showForm) {
        <div class="form-card">
          <h3>{{ editingId() ? 'Edit Wallet' : 'New Wallet' }}</h3>
          <div class="form-row">
            <div class="field">
              <label>Chain</label>
              <select [(ngModel)]="formChain">
                <option value="ethereum">Ethereum</option>
                <option value="solana">Solana</option>
              </select>
            </div>
            <div class="field">
              <label>Address</label>
              <input [(ngModel)]="formAddress" placeholder="0x... or Solana address" />
            </div>
          </div>
          <div class="form-row">
            <div class="field">
              <label>Description</label>
              <input [(ngModel)]="formDescription" placeholder="Optional" />
            </div>
            <div class="field-checkbox">
              <label><input type="checkbox" [(ngModel)]="formDefault" /> Default wallet</label>
            </div>
          </div>
          <div class="form-actions">
            <button class="btn-primary" (click)="save()" [disabled]="saving()">{{ saving() ? 'Saving...' : 'Save' }}</button>
            <button class="btn-secondary" (click)="cancelForm()">Cancel</button>
          </div>
        </div>
      }

      <table class="table">
        <thead>
          <tr><th>Chain</th><th>Address</th><th>Description</th><th>Default</th><th>Actions</th></tr>
        </thead>
        <tbody>
          @for (w of wallets(); track w.id) {
            <tr>
              <td>{{ w.chain }}</td>
              <td class="mono">{{ w.address | slice:0:14 }}...</td>
              <td>{{ w.description || '-' }}</td>
              <td>{{ w.is_default ? '✓' : '' }}</td>
              <td>
                <button class="btn-sm" (click)="edit(w)">Edit</button>
                <button class="btn-sm btn-danger" (click)="remove(w.id)" [disabled]="w.is_default">Delete</button>
              </td>
            </tr>
          } @empty {
            <tr><td colspan="5">No wallets. Add one to get started.</td></tr>
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
    .btn-sm { padding: 0.25rem 0.5rem; border: 1px solid var(--surface-border); border-radius: 4px; cursor: pointer; margin-right: 0.25rem; font-size: 0.8rem; }
    .btn-danger { color: #c0392b; border-color: #c0392b; }
    .btn-danger:disabled { opacity: 0.4; }
    .error-banner { background: #fce4e4; color: #c0392b; padding: 0.75rem; border-radius: 6px; margin-bottom: 1rem; }
    .form-card { background: var(--surface-card); padding: 1.25rem; border-radius: 8px; margin-bottom: 1rem; }
    .form-row { display: flex; gap: 1rem; margin-bottom: 0.75rem; }
    .field { flex: 1; }
    .field label { display: block; font-size: 0.85rem; margin-bottom: 0.25rem; }
    .field input, .field select { width: 100%; padding: 0.5rem; border: 1px solid var(--surface-border); border-radius: 6px; }
    .field-checkbox { display: flex; align-items: flex-end; padding-bottom: 0.35rem; }
    .form-actions { display: flex; gap: 0.5rem; margin-top: 0.75rem; }
    .table { width: 100%; border-collapse: collapse; background: var(--surface-card); border-radius: 8px; overflow: hidden; }
    .table th, .table td { padding: 0.75rem; text-align: left; border-bottom: 1px solid var(--surface-border); }
    .table th { background: var(--surface-ground); font-size: 0.85rem; }
    .mono { font-family: monospace; font-size: 0.9rem; }
  `]
})
export class WalletsComponent {
  private http = inject(HttpClient);
  private api = environment.apiBaseUrl;

  wallets = signal<Wallet[]>([]);
  error = signal('');
  showForm = false;
  editingId = signal<string | null>(null);
  saving = signal(false);

  formChain = 'ethereum';
  formAddress = '';
  formDescription = '';
  formDefault = false;

  constructor() { this.load(); }

  load() {
    this.http.get<Wallet[]>(`${this.api}/wallets`).subscribe({
      next: (d) => this.wallets.set(d),
      error: () => this.error.set('Failed to load wallets'),
    });
  }

  save() {
    this.saving.set(true);
    const body = { chain: this.formChain, address: this.formAddress, description: this.formDescription, is_default: this.formDefault };
    const req = this.editingId()
      ? this.http.patch<Wallet>(`${this.api}/wallets/${this.editingId()}`, { description: this.formDescription, is_default: this.formDefault })
      : this.http.post<Wallet>(`${this.api}/wallets`, body);

    req.subscribe({
      next: () => { this.load(); this.cancelForm(); },
      error: () => this.error.set('Failed to save wallet'),
      complete: () => this.saving.set(false),
    });
  }

  edit(w: Wallet) {
    this.editingId.set(w.id);
    this.formChain = w.chain;
    this.formAddress = w.address;
    this.formDescription = w.description || '';
    this.formDefault = w.is_default;
    this.showForm = true;
  }

  remove(id: string) {
    this.http.delete(`${this.api}/wallets/${id}`).subscribe({
      next: () => this.load(),
      error: (err) => this.error.set(err.error?.error?.message || 'Failed to delete wallet'),
    });
  }

  cancelForm() {
    this.showForm = false;
    this.editingId.set(null);
    this.formChain = 'ethereum';
    this.formAddress = '';
    this.formDescription = '';
    this.formDefault = false;
  }
}
