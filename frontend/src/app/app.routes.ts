import { Routes } from '@angular/router';
import { authGuard } from './shared/auth.guard';
import { LayoutComponent } from './shared/layout.component';

const authRoutes: Routes = [
  {
    path: 'login',
    loadComponent: () => import('./auth/login.component').then(m => m.LoginComponent),
  },
  {
    path: 'register',
    loadComponent: () => import('./auth/register.component').then(m => m.RegisterComponent),
  },
];

const appRoutes: Routes = [
  {
    path: '',
    component: LayoutComponent,
    canActivate: [authGuard],
    children: [
      { path: 'dashboard', loadComponent: () => import('./dashboard/dashboard.component').then(m => m.DashboardComponent) },
      { path: 'payments', loadComponent: () => import('./payments/payments.component').then(m => m.PaymentsComponent) },
      { path: 'payments/new', loadComponent: () => import('./payments/payment-form.component').then(m => m.PaymentFormComponent) },
      { path: 'payments/:id', loadComponent: () => import('./payments/payment-detail.component').then(m => m.PaymentDetailComponent) },
      { path: 'wallets', loadComponent: () => import('./wallets/wallets.component').then(m => m.WalletsComponent) },
      { path: 'configs', loadComponent: () => import('./configs/configs.component').then(m => m.ConfigsComponent) },
      { path: 'custom-contracts', loadComponent: () => import('./configs/custom-contracts.component').then(m => m.CustomContractsComponent) },
      { path: '', redirectTo: '/dashboard', pathMatch: 'full' },
    ],
  },
];

export const routes: Routes = [...authRoutes, ...appRoutes];
