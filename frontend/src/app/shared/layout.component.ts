import { Component, inject } from "@angular/core";
import {
  Router,
  RouterLink,
  RouterLinkActive,
  RouterOutlet,
} from "@angular/router";
import { ApiService } from "./api.service";
@Component({
  selector: "app-layout",
  standalone: true,
  imports: [RouterLink, RouterLinkActive, RouterOutlet],
  template: ` <a href="#main" class="skip-link">Skip to content</a>
    <div class="app-shell">
      <aside class="sidebar">
        <a class="brand" routerLink="/dashboard"
          ><span class="brand-mark">C<span>↗</span></span
          ><span>CryptoPay<small>SELF-HOSTED PAYMENTS</small></span></a
        >
        <div class="nav-caption">WORKSPACE</div>
        <nav aria-label="Main navigation">
          <a routerLink="/dashboard" routerLinkActive="active"
            ><svg viewBox="0 0 24 24" aria-hidden="true">
              <rect x="3" y="3" width="7" height="7" rx="1" />
              <rect x="14" y="3" width="7" height="7" rx="1" />
              <rect x="3" y="14" width="7" height="7" rx="1" />
              <rect x="14" y="14" width="7" height="7" rx="1" /></svg
            >Overview</a
          >
          <a routerLink="/payments" routerLinkActive="active"
            ><svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M6 3h12v18l-3-2-3 2-3-2-3 2Z M9 8h6 M9 12h6" /></svg
            >Payment requests</a
          >
          <a routerLink="/wallets" routerLinkActive="active"
            ><svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M4 6V4h15v4 M3 8h18v12H3Z M16 12h5v4h-5Z" /></svg
            >Wallets</a
          >
          <a routerLink="/recovery" routerLinkActive="active"
            >Payment recovery</a
          >
          <a routerLink="/settings" routerLinkActive="active"
            ><svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M4 6h16 M4 12h16 M4 18h16" />
              <circle cx="8" cy="6" r="2" />
              <circle cx="16" cy="12" r="2" />
              <circle cx="9" cy="18" r="2" /></svg
            >Settings</a
          >
        </nav>
        <div class="sidebar-bottom">
          <div class="private-note">
            <span class="dot"></span>Your instance. Your wallets.<small
              >Funds stay in your control.</small
            >
          </div>
          <button class="logout" (click)="logout()">Sign out ↗</button>
        </div>
      </aside>
      <div class="workspace">
        <header class="topbar">
          <span>Payment operations</span
          ><span class="instance"
            ><span class="dot"></span>Self-hosted instance</span
          ><button class="text-button" (click)="logout()">Sign out</button>
        </header>
        <main id="main" tabindex="-1"><router-outlet /></main>
        <footer>
          CryptoPay Manager <span>Non-custodial · All times UTC</span>
        </footer>
      </div>
    </div>`,
})
export class LayoutComponent {
  api = inject(ApiService);
  router = inject(Router);
  async logout() {
    try {
      await this.api.logout();
      await this.router.navigateByUrl("/login");
    } catch {
      window.alert("Unable to sign out. Check your connection and retry.");
    }
  }
}
