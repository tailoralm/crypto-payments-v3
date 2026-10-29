import { Component, Input, OnDestroy, signal } from "@angular/core";
import { CommonModule } from "@angular/common";
import { RouterLink } from "@angular/router";
import { Payment } from "./api.service";
@Component({
  selector: "app-status",
  standalone: true,
  template: `<span class="badge" [attr.data-status]="value">{{ label }}</span>`,
})
export class StatusComponent {
  @Input() value = "";
  get label() {
    return (
      (
        {
          IN_PROGRESS: "In progress",
          SUCCESS: "Success",
          EXPIRED: "Expired",
          CANCELED: "Canceled",
        } as Record<string, string>
      )[this.value] || this.value
    );
  }
}
@Component({
  selector: "app-countdown",
  standalone: true,
  template: `<span>{{ remaining() }}</span>`,
})
export class CountdownComponent implements OnDestroy {
  @Input() expires = "";
  remaining = signal("");
  timer = setInterval(() => this.update(), 1000);
  ngOnChanges() {
    this.update();
  }
  update() {
    const seconds = Math.max(
      0,
      Math.ceil((new Date(this.expires).getTime() - Date.now()) / 1000),
    );
    this.remaining.set(
      seconds
        ? `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m ${seconds % 60}s`
        : "Deadline reached",
    );
  }
  ngOnDestroy() {
    clearInterval(this.timer);
  }
}
@Component({
  selector: "app-payment-table",
  standalone: true,
  imports: [CommonModule, RouterLink, StatusComponent],
  template: ` <div class="table-wrap">
    <table>
      <thead>
        <tr>
          <th>Payment request</th>
          <th>Amount</th>
          <th>Network</th>
          <th>Status</th>
          <th>Deadline (UTC)</th>
          <th><span class="sr-only">Open</span></th>
        </tr>
      </thead>
      <tbody>
        @for (p of items; track p.id) {
          <tr>
            <td>
              <a class="table-title" [routerLink]="['/payments', p.id]">{{
                p.description
              }}</a
              ><small class="mono">{{ p.reference }}</small>
            </td>
            <td class="amount">{{ p.value }}<small>USDT</small></td>
            <td>
              <span class="network">{{
                p.snapshot.chain === "bsc"
                  ? "BNB Smart Chain"
                  : (p.snapshot.chain | titlecase)
              }}</span>
            </td>
            <td><app-status [value]="p.status" /></td>
            <td>{{ p.expires_at | date: "MMM d, y, HH:mm" : "UTC" }}</td>
            <td>
              <a
                [routerLink]="['/payments', p.id]"
                aria-label="View payment details"
                >View →</a
              >
            </td>
          </tr>
        } @empty {
          <tr>
            <td colspan="6" class="empty">No payment requests here yet.</td>
          </tr>
        }
      </tbody>
    </table>
  </div>`,
})
export class PaymentTableComponent {
  @Input() items: Payment[] = [];
}
