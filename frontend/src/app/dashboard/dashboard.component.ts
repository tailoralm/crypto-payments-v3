import { Component, inject, OnDestroy } from "@angular/core";
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
    @if (notifications) {
      <section class="panel">
        <h2>Payment alerts · {{ notifications.unread }} unread</h2>
        <p role="status" aria-atomic="true">{{ announcement }}</p>
        @for (n of notifications.items; track n.id) {
          <p>
            <a [routerLink]="['/payments', n.payment_id]">{{ n.message }}</a>
            @if (!n.read_at) {
              <button
                class="text-button"
                [disabled]="busy()"
                (click)="read(n.id)"
              >
                Mark read
              </button>
            }
          </p>
        }
        <div class="form-actions">
          <button
            [disabled]="busy() || alertPage === 1"
            (click)="changePage('alerts', -1)"
          >
            Previous alerts</button
          ><button
            [disabled]="busy() || alertPage * 25 >= notifications.total"
            (click)="changePage('alerts', 1)"
          >
            Older alerts
          </button>
        </div>
      </section>
    }
    @if (deliveries) {
      <section class="panel">
        <h2>Webhook delivery</h2>
        <p>
          Pending {{ deliveries.counts.PENDING || 0 }} · Failed
          {{ deliveries.counts.FAILED || 0 }} · Blocked
          {{ deliveries.counts.BLOCKED || 0 }}
        </p>
        @for (d of deliveries.items; track d.id) {
          <details>
            <summary>{{ d.type }} · {{ d.status }}</summary>
            <p class="break">{{ d.url }}</p>
            <p>{{ d.error }} {{ d.http_status }}</p>
            <a [routerLink]="['/payments', d.payment_id]">Payment details</a>
            @if (
              d.status === "FAILED" ||
              d.status === "BLOCKED" ||
              d.status === "PENDING"
            ) {
              <button [disabled]="busy()" (click)="retryDelivery(d.id)">
                Retry delivery
              </button>
            }
          </details>
        }
        <div class="form-actions">
          <button
            [disabled]="busy() || deliveryPage === 1"
            (click)="changePage('deliveries', -1)"
          >
            Previous deliveries</button
          ><button
            [disabled]="busy() || deliveryPage * 25 >= deliveries.total"
            (click)="changePage('deliveries', 1)"
          >
            Older deliveries
          </button>
        </div>
      </section>
    }
    @if (monitoringErrors.length) {
      <section class="panel">
        <h2>Monitoring failures</h2>
        @for (w of monitoringErrors; track w.id) {
          <p class="alert">{{ w.description }}: {{ w.scan_error }}</p>
        }
      </section>
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
export class DashboardComponent extends ViewState implements OnDestroy {
  private seenAlerts = new Set<string>();
  private alertsInitialized = false;
  alertPage = 1;
  deliveryPage = 1;
  notifications: any;
  deliveries: any;
  monitoringErrors: any[] = [];
  announcement = "";
  timer = setInterval(() => {
    if (!document.hidden) this.load();
  }, 30000);
  visible = () => {
    if (!document.hidden) this.load();
  };
  api = inject(ApiService);
  data: any;
  series = ["SUCCESS", "IN_PROGRESS", "EXPIRED", "CANCELED"];
  constructor() {
    super();
    this.load();
    document.addEventListener("visibilitychange", this.visible);
  }
  load() {
    void this.run(async () => {
      const [data, notifications, deliveries, wallets] = await Promise.all([
        this.api.request("/reports/dashboard"),
        this.api.request("/notifications?page=" + this.alertPage),
        this.api.request("/webhooks?page=" + this.deliveryPage),
        this.api.request<any[]>("/wallets"),
      ]);
      if (
        this.alertsInitialized &&
        this.alertPage === 1 &&
        notifications.items.some((n: any) => !this.seenAlerts.has(n.id))
      )
        this.announcement = `New payment received. ${notifications.unread} unread payment alerts.`;
      notifications.items.forEach((n: any) => this.seenAlerts.add(n.id));
      this.alertsInitialized = true;
      this.data = data;
      this.notifications = notifications;
      this.deliveries = deliveries;
      this.monitoringErrors = wallets.filter((w) => w.scan_error);
    });
  }
  changePage(kind: string, delta: number) {
    if (this.busy()) return;
    if (kind === "alerts") this.alertPage += delta;
    else this.deliveryPage += delta;
    this.load();
  }
  ngOnDestroy() {
    clearInterval(this.timer);
    document.removeEventListener("visibilitychange", this.visible);
  }
  read(id: string) {
    void this.run(async () => {
      await this.api.request(`/notifications/${id}/read`, "POST", {});
      this.notifications = await this.api.request(
        "/notifications?page=" + this.alertPage,
      );
      this.announcement = `${this.notifications.unread} unread payment alerts.`;
    });
  }
  retryDelivery(id: string) {
    void this.run(async () => {
      await this.api.request(`/webhooks/${id}/retry`, "POST", {});
      this.deliveries = await this.api.request(
        "/webhooks?page=" + this.deliveryPage,
      );
    });
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
