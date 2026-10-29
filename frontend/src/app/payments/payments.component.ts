import { Component, inject } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { ActivatedRoute, Router, RouterLink } from "@angular/router";
import { ApiService, ViewState, Page } from "../shared/api.service";
import { PaymentTableComponent } from "../shared/ui";
@Component({
  standalone: true,
  imports: [FormsModule, RouterLink, PaymentTableComponent],
  template: ` <div class="page-heading">
      <div>
        <span class="eyebrow">PAYMENT OPERATIONS</span>
        <h1>Payment requests</h1>
        <p class="muted">Track every request and its next step.</p>
      </div>
      <a class="primary" routerLink="/payments/new">+ Create payment request</a>
    </div>
    @if (error()) {
      <div class="alert error" role="alert">{{ error() }}</div>
    }
    <section class="panel">
      <form class="filters" (ngSubmit)="load(1)">
        <div>
          <label for="status">Status</label
          ><select id="status" name="status" [(ngModel)]="status">
            <option value="">All statuses</option>
            <option value="SUCCESS">Success</option>
            <option value="IN_PROGRESS">In progress</option>
            <option value="EXPIRED">Expired</option>
            <option value="CANCELED">Canceled</option>
          </select>
        </div>
        <div>
          <label for="from">Created from (UTC)</label
          ><input id="from" name="from" type="date" [(ngModel)]="from" />
        </div>
        <div>
          <label for="to">Created through (UTC)</label
          ><input id="to" name="to" type="date" [(ngModel)]="to" />
        </div>
        <button class="secondary" [disabled]="busy()">Apply filters</button
        ><button class="text-button" type="button" (click)="clear()">
          Clear
        </button>
      </form>
      @if (busy()) {
        <p class="loading" role="status">Loading requests…</p>
      }
      <app-payment-table [items]="page.items" />
      <div class="pagination">
        <span>{{ page.total }} requests · Page {{ page.page }}</span>
        <div>
          <button
            class="secondary"
            [disabled]="busy() || page.page <= 1"
            (click)="load(page.page - 1)"
          >
            ← Previous</button
          ><button
            class="secondary"
            [disabled]="busy() || page.page * page.page_size >= page.total"
            (click)="load(page.page + 1)"
          >
            Next →
          </button>
        </div>
      </div>
    </section>`,
})
export class PaymentsComponent extends ViewState {
  api = inject(ApiService);
  route = inject(ActivatedRoute);
  router = inject(Router);
  status = this.route.snapshot.queryParamMap.get("status") || "";
  from = "";
  to = "";
  page: Page = { items: [], total: 0, page: 1, page_size: 25 };
  constructor() {
    super();
    this.load();
  }
  load(page = 1) {
    void this.run(async () => {
      const q = new URLSearchParams({ page: String(page), page_size: "25" });
      if (this.status) q.set("status", this.status);
      if (this.from) q.set("date_from", this.from);
      if (this.to) q.set("date_to", this.to);
      this.page = await this.api.request("/payments?" + q);
    });
  }
  clear() {
    this.status = "";
    this.from = "";
    this.to = "";
    this.load();
  }
}
