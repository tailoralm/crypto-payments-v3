import { Component, inject } from '@angular/core';
import { Router, RouterModule, RouterOutlet } from '@angular/router';
import { AuthService } from './auth.service';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-layout',
  standalone: true,
  imports: [RouterModule, RouterOutlet, CommonModule],
  template: `
    <div class="layout">
      <div class="sidebar" [class.collapsed]="sidebarCollapsed">
        <div class="sidebar-header">
          <h2>CryptoPay</h2>
        </div>
        <nav class="sidebar-nav">
          <a routerLink="/dashboard" routerLinkActive="active" class="nav-item">
            <span class="pi pi-home"></span>
            <span class="nav-label">Dashboard</span>
          </a>
          <a routerLink="/payments" routerLinkActive="active" class="nav-item">
            <span class="pi pi-credit-card"></span>
            <span class="nav-label">Payments</span>
          </a>
          <a routerLink="/wallets" routerLinkActive="active" class="nav-item">
            <span class="pi pi-wallet"></span>
            <span class="nav-label">Wallets</span>
          </a>
          <a routerLink="/configs" routerLinkActive="active" class="nav-item">
            <span class="pi pi-cog"></span>
            <span class="nav-label">Configs</span>
          </a>
        </nav>
        <div class="sidebar-footer">
          <span class="user-email">{{ auth.user()?.email }}</span>
          <button class="btn-logout" (click)="logout()">Logout</button>
        </div>
      </div>
      <div class="main-content">
        <router-outlet />
      </div>
    </div>
  `,
  styles: [`
    .layout { display: flex; height: 100vh; }
    .sidebar {
      width: 250px; background: var(--surface-card); border-right: 1px solid var(--surface-border);
      display: flex; flex-direction: column; transition: width 0.2s;
    }
    .sidebar.collapsed { width: 60px; }
    .sidebar-header { padding: 1rem; border-bottom: 1px solid var(--surface-border); }
    .sidebar-header h2 { margin: 0; font-size: 1.25rem; }
    .sidebar-nav { flex: 1; padding: 0.5rem; display: flex; flex-direction: column; gap: 0.25rem; }
    .nav-item {
      display: flex; align-items: center; gap: 0.75rem; padding: 0.75rem; border-radius: 6px;
      text-decoration: none; color: var(--text-color); transition: background 0.15s;
    }
    .nav-item:hover { background: var(--surface-hover); }
    .nav-item.active { background: var(--primary-color); color: var(--primary-color-text); }
    .nav-label { font-size: 0.9rem; }
    .sidebar-footer { padding: 1rem; border-top: 1px solid var(--surface-border); font-size: 0.85rem; }
    .user-email { display: block; margin-bottom: 0.5rem; word-break: break-all; }
    .btn-logout {
      width: 100%; padding: 0.5rem; border: 1px solid var(--surface-border); border-radius: 6px;
      background: transparent; cursor: pointer; color: var(--text-color-secondary);
    }
    .btn-logout:hover { background: var(--surface-hover); }
    .main-content { flex: 1; overflow-y: auto; }
  `]
})
export class LayoutComponent {
  auth = inject(AuthService);
  private router = inject(Router);
  sidebarCollapsed = false;

  logout() {
    this.auth.logout().subscribe(() => this.router.navigate(['/login']));
  }
}
