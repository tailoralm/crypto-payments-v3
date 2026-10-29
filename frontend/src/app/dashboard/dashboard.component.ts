import { Component, inject } from "@angular/core";
import { CommonModule } from "@angular/common";
import { RouterLink } from "@angular/router";
import { ApiService, ViewState, Payment } from "../shared/api.service";
import { PaymentTableComponent, CountdownComponent } from "../shared/ui";
@Component({
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    PaymentTableComponent,
    CountdownComponent,
  ],
  template: ` <div class="page-heading">
      <div>
        <span class="eyebrow">YOUR WORKSPACE AT A GLANCE</span>
        <h1>Overview</h1>
        <p class="muted">Every payment, from request to received.</p>
      </div>
      <a class="primary" routerLink="/payments/new">+ Create payment request</a>
    </div>
    @if (error()) {
      <div class="alert error" role="alert">
        {{ error() }} <button (click)="load()">Retry</button>
      </div>
    }
    @if (busy()) {
      <p role="status">Loading your overview…</p>
    }
    @if (data) {
      <div class="metrics">
        <article class="metric">
          <span>Received today <small>UTC</small></span
          ><strong>{{ data.today.amount }} <em>USDT</em></strong
          ><small>{{ data.today.count }} successful payments</small>
        </article>
        <article class="metric">
          <span>Received this month <small>UTC</small></span
          ><strong>{{ data.month.amount }} <em>USDT</em></strong
          ><small>{{ data.month.count }} successful payments</small>
        </article>
        <article class="metric">
          <span>In progress</span
          ><strong
            >{{ data.counts.IN_PROGRESS || 0
            }}<span class="metric-dot pending"></span></strong
          ><small>Waiting for an incoming transfer</small>
        </article>
        <article class="metric">
          <span>Successful requests</span
          ><strong
            >{{ data.counts.SUCCESS || 0
            }}<span class="metric-dot success"></span></strong
          ><small>Across all time</small>
        </article>
      </div>
      @if (data.legacy_unknown_paid_time) {
        <div class="alert">
          {{ data.legacy_unknown_paid_time }} historical successes have no
          verified on-chain paid time and are excluded from period totals.
        </div>
      }
      <section class="panel">
        <div class="panel-heading">
          <div>
            <h2>Payment activity</h2>
            <p>Requests created this month, grouped by their current status</p>
          </div>
          <span class="subtle-tag"
            >{{ data.generated_at | date: "MMMM yyyy" : "UTC" }} · UTC</span
          >
        </div>
        <div class="legend">
          <span><i class="success"></i>Success</span
          ><span><i class="pending"></i>In progress</span
          ><span><i class="expired"></i>Expired</span
          ><span><i class="canceled"></i>Canceled</span>
        </div>
        <div
          class="chart"
          role="img"
          aria-label="Daily payment counts by current status; exact values are in the table below"
        >
          @for (d of data.daily_status_counts; track d.day) {
            <div
              class="chart-day"
              [attr.title]="d.day + ': ' + total(d) + ' requests'"
            >
              <div class="bar-space">
                <div class="bar" [style.height.%]="(total(d) / max()) * 100">
                  @for (s of series; track s) {
                    <div
                      [class]="'segment ' + color(s)"
                      [style.flex-grow]="d[s] || 0"
                    ></div>
                  }
                </div>
              </div>
              <small>{{ d.day.slice(-2) }}</small>
            </div>
          }
        </div>
        <details class="chart-data">
          <summary>View exact daily counts</summary>
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Day (UTC)</th>
                  <th>Success</th>
                  <th>In progress</th>
                  <th>Expired</th>
                  <th>Canceled</th>
                </tr>
              </thead>
              <tbody>
                @for (d of data.daily_status_counts; track d.day) {
                  <tr>
                    <td>{{ d.day }}</td>
                    <td>{{ d.SUCCESS }}</td>
                    <td>{{ d.IN_PROGRESS }}</td>
                    <td>{{ d.EXPIRED }}</td>
                    <td>{{ d.CANCELED }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </details>
      </section>
      <section class="panel">
        <div class="panel-heading">
          <div>
            <h2>Latest successful payments</h2>
            <p>The last 10 completed requests</p>
          </div>
          <a routerLink="/payments" [queryParams]="{ status: 'SUCCESS' }"
            >View all →</a
          >
        </div>
        <app-payment-table [items]="data.recent_successes" />
      </section>
      <section class="panel">
        <div class="panel-heading">
          <div>
            <h2>Expiring next</h2>
            <p>The next 10 requests awaiting payment</p>
          </div>
          <span class="subtle-tag">Deadline order</span>
        </div>
        <div class="expiry-list">
          @for (p of data.upcoming_expirations; track p.id) {
            <a [routerLink]="['/payments', p.id]"
              ><div>
                <strong>{{ p.description }}</strong
                ><small>{{ p.reference }}</small>
              </div>
              <span>{{ p.value }} USDT</span
              ><app-countdown [expires]="p.expires_at"
            /></a>
          } @empty {
            <p class="empty">No requests are waiting for payment.</p>
          }
        </div>
      </section>
    }`,
})
export class DashboardComponent extends ViewState {
  api = inject(ApiService);
  data: any;
  series = ["SUCCESS", "IN_PROGRESS", "EXPIRED", "CANCELED"];
  constructor() {
    super();
    this.load();
  }
  load() {
    void this.run(
      async () => (this.data = await this.api.request("/reports/dashboard")),
    );
  }
  total(d: any) {
    return this.series.reduce((n, s) => n + d[s], 0);
  }
  max() {
    return Math.max(
      1,
      ...this.data.daily_status_counts.map((d: any) => this.total(d)),
    );
  }
  color(s: string) {
    return (
      {
        SUCCESS: "success",
        IN_PROGRESS: "pending",
        EXPIRED: "expired",
        CANCELED: "canceled",
      } as any
    )[s];
  }
}
