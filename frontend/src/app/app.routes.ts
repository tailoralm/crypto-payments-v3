import { inject } from "@angular/core";
import { CanActivateFn, Router, Routes } from "@angular/router";
import { ApiService } from "./shared/api.service";
import { LayoutComponent } from "./shared/layout.component";
const ownerGuard: CanActivateFn = () =>
  inject(ApiService).authenticated() ||
  inject(Router).createUrlTree(["/login"]);
export const routes: Routes = [
  {
    path: "login",
    loadComponent: () =>
      import("./auth/login.component").then((m) => m.LoginComponent),
  },
  { path: "register", redirectTo: "login" },
  {
    path: "bill/:token",
    loadComponent: () =>
      import("./payments/public-billing.component").then(
        (m) => m.PublicBillingComponent,
      ),
  },
  {
    path: "",
    component: LayoutComponent,
    canActivate: [ownerGuard],
    children: [
      {
        path: "recovery",
        loadComponent: () =>
          import("./payments/recovery.component").then(
            (m) => m.RecoveryComponent,
          ),
      },
      {
        path: "dashboard",
        loadComponent: () =>
          import("./dashboard/dashboard.component").then(
            (m) => m.DashboardComponent,
          ),
      },
      {
        path: "payments/new",
        loadComponent: () =>
          import("./payments/payment-form.component").then(
            (m) => m.PaymentFormComponent,
          ),
      },
      {
        path: "payments/:id",
        loadComponent: () =>
          import("./payments/payment-detail.component").then(
            (m) => m.PaymentDetailComponent,
          ),
      },
      {
        path: "payments",
        loadComponent: () =>
          import("./payments/payments.component").then(
            (m) => m.PaymentsComponent,
          ),
      },
      {
        path: "wallets",
        loadComponent: () =>
          import("./wallets/wallets.component").then((m) => m.WalletsComponent),
      },
      {
        path: "settings",
        loadComponent: () =>
          import("./configs/configs.component").then((m) => m.ConfigsComponent),
      },
      { path: "configs", redirectTo: "settings" },
      { path: "", redirectTo: "dashboard", pathMatch: "full" },
    ],
  },
  { path: "**", redirectTo: "dashboard" },
];
