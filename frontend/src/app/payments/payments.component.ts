import { Component, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { environment } from '../../environments/environment';
import { CommonModule } from '@angular/common';

interface Payment {
  id: string;
  description: string;
  value: string;
  status: string;
  expires_at: string;
  created_at: string;
  concluded_tx_hash: string | null;
}

@Component({
  selector: 'app-payments',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule],
  template: `
    <div class="page-container">
      <div class="header-row">
        <h1>Payments</h1>
        <a routerLink="/payments/new" class="btn-primary">+ New Payment</a>
      </div>

      <div class="filters">
        <select [(ngModel)]="filterStatus" (change)="load()">
          <option value="">All Statuses</option>
          <option value="PENDING">Pending</option>
          <option value="CONCLUDED">Concluded</option>
          <option value="EXPIRED">Expired</option>
        </select>
      </div>

      @if (error()) {
        <div class="error-banner">{{ error() }}</div>
      }

      <table class="table">
        <thead>
          <tr><th>Description</th><th>Value</th><th>Status</th><th>Expires</th><th>Created</th></tr>
        </thead>
        <tbody>
          @for (p of payments(); track p.id) {
            <tr class="clickable" [routerLink]="['/payments', p.id]">
              <td>{{ p.description }}</td>
              <td>{{ p.value }}</td>
              <td><span class="badge" [class.pending]="p.status === 'PENDING'" [class.concluded]="p.status === 'CONCLUDED'" [class.expired]="p.status === 'EXPIRED'">{{ p.status }}</span></td>
              <td>{{ p.expires_at | date:'short' }}</td>
              <td>{{ p.created_at | date:'short' }}</td>
            </tr>
          } @empty {
            <tr><td colspan="5">No payments found</td></tr>
          }
        </tbody>
      </table>
    </div>
  `,
  styles: [`
    .header-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; }
    h1 { margin: 0; }
    .btn-primary { padding: 0.5rem 1rem; background: var(--primary-color); color: var(--primary-color-text); border: none; border-radius: 6px; cursor: pointer; text-decoration: none; }
    .filters { margin-bottom: 1rem; }
    .filters select { padding: 0.5rem; border: 1px solid var(--surface-border); border-radius: 6px; }
    .error-banner { background: #fce4e4; color: #c0392b; padding: 0.75rem; border-radius: 6px; margin-bottom: 1rem; }
    .table { width: 100%; border-collapse: collapse; background: var(--surface-card); border-radius: 8px; overflow: hidden; }
    .table th, .table td { padding: 0.75rem; text-align: left; border-bottom: 1px solid var(--surface-border); }
    .table th { background: var(--surface-ground); font-size: 0.85rem; }
    .clickable { cursor: pointer; }
    .clickable:hover { background: var(--surface-hover); }
    .badge { padding: 0.2rem 0.5rem; border-radius: 4px; font-size: 0.8rem; font-weight: 600; }
    .badge.pending { background: #fff3e0; color: #e65100; }
    .badge.concluded { background: #e8f5e9; color: #2e7d32; }
    .badge.expired { background: #fce4e4; color: #c0392b; }
  `]
})
export class PaymentsComponent {
  private http = inject(HttpClient);
  private api = environment.apiBaseUrl;

  payments = signal<Payment[]>([]);
  error = signal('');
  filterStatus = '';

  constructor() { this.load(); }

  load() {
    const params: any = {};
    if (this.filterStatus) params.status = this.filterStatus;

    this.http.get<Payment[]>(`${this.api}/payments`, { params }).subscribe({
      next: (d) => this.payments.set(d),
      error: () => this.error.set('Failed to load payments'),
    });
  }
}
