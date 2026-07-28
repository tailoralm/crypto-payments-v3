import { Component, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';
import { CommonModule } from '@angular/common';

interface DashboardData {
  total_received_month: string;
  pending_count: number;
  expired_month_count: number;
  conversion_rate: number;
  recent_activity: Array<{ id: string; description: string; value: string; status: string; occurred_at: string }>;
  wallets_overview: Array<{ id: string; address: string; chain: string; pending_count: number; pending_total: string }>;
}

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="page-container">
      <h1>Dashboard</h1>

      @if (error()) {
        <div class="error-banner">{{ error() }}</div>
      }

      @if (loading() && !data()) {
        <div class="loading">Loading dashboard...</div>
      } @else {
        @let d = data()!;
        <div class="card-grid">
          <div class="stat-card">
            <span class="stat-label">Total Received (Month)</span>
            <span class="stat-value">{{ d.total_received_month }}</span>
          </div>
          <div class="stat-card">
            <span class="stat-label">Pending Payments</span>
            <span class="stat-value">{{ d.pending_count }}</span>
          </div>
          <div class="stat-card">
            <span class="stat-label">Expired (Month)</span>
            <span class="stat-value">{{ d.expired_month_count }}</span>
          </div>
          <div class="stat-card">
            <span class="stat-label">Conversion Rate</span>
            <span class="stat-value">{{ (d.conversion_rate * 100).toFixed(1) }}%</span>
          </div>
        </div>

        <h2>Wallets Overview</h2>
        <table class="table">
          <thead>
            <tr><th>Address</th><th>Chain</th><th>Pending</th><th>Pending Total</th></tr>
          </thead>
          <tbody>
            @for (w of d.wallets_overview; track w.id) {
              <tr>
                <td class="mono">{{ w.address | slice:0:10 }}...</td>
                <td>{{ w.chain }}</td>
                <td>{{ w.pending_count }}</td>
                <td>{{ w.pending_total }}</td>
              </tr>
            } @empty {
              <tr><td colspan="4">No wallets</td></tr>
            }
          </tbody>
        </table>

        <h2>Recent Activity</h2>
        <table class="table">
          <thead>
            <tr><th>Description</th><th>Value</th><th>Status</th><th>Date</th></tr>
          </thead>
          <tbody>
            @for (a of d.recent_activity; track a.id) {
              <tr>
                <td>{{ a.description }}</td>
                <td>{{ a.value }}</td>
                <td><span class="badge" [class.concluded]="a.status === 'CONCLUDED'" [class.expired]="a.status === 'EXPIRED'">{{ a.status }}</span></td>
                <td>{{ a.occurred_at | date:'short' }}</td>
              </tr>
            } @empty {
              <tr><td colspan="4">No recent activity</td></tr>
            }
          </tbody>
        </table>
      }
    </div>
  `,
  styles: [`
    h1 { margin: 0 0 1rem; }
    h2 { margin: 1.5rem 0 0.75rem; }
    .loading { padding: 2rem; text-align: center; color: var(--text-color-secondary); }
    .error-banner { background: #fce4e4; color: #c0392b; padding: 0.75rem; border-radius: 6px; margin-bottom: 1rem; }
    .stat-card { background: var(--surface-card); padding: 1.25rem; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
    .stat-label { display: block; font-size: 0.85rem; color: var(--text-color-secondary); margin-bottom: 0.5rem; }
    .stat-value { font-size: 1.5rem; font-weight: 600; }
    .table { width: 100%; border-collapse: collapse; background: var(--surface-card); border-radius: 8px; overflow: hidden; }
    .table th, .table td { padding: 0.75rem; text-align: left; border-bottom: 1px solid var(--surface-border); }
    .table th { background: var(--surface-ground); font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.05em; }
    .mono { font-family: monospace; font-size: 0.9rem; }
    .badge { padding: 0.2rem 0.5rem; border-radius: 4px; font-size: 0.8rem; font-weight: 600; }
    .badge.concluded { background: #e8f5e9; color: #2e7d32; }
    .badge.expired { background: #fce4e4; color: #c0392b; }
  `]
})
export class DashboardComponent {
  private http = inject(HttpClient);
  private api = environment.apiBaseUrl;

  data = signal<DashboardData | null>(null);
  loading = signal(true);
  error = signal('');

  constructor() {
    this.load();
  }

  load() {
    this.loading.set(true);
    this.error.set('');
    this.http.get<DashboardData>(`${this.api}/reports/dashboard`).subscribe({
      next: (d) => { this.data.set(d); this.loading.set(false); },
      error: () => { this.error.set('Failed to load dashboard'); this.loading.set(false); },
    });
  }
}
