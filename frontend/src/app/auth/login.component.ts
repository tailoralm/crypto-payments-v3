import { Component, inject } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { Router } from "@angular/router";
import { ApiService, ViewState } from "../shared/api.service";
@Component({
  standalone: true,
  imports: [FormsModule],
  template: ` <div class="auth-page">
    <div class="auth-story">
      <a class="brand"><span class="brand-mark">C↗</span>CryptoPay</a>
      <div>
        <span class="eyebrow">YOUR PAYMENTS, IN YOUR CONTROL</span>
        <h1>A clear view of every crypto payment.</h1>
        <p>
          Create payment requests, share a bill, and follow every transfer from
          one private workspace.
        </p>
        <div class="chain-pills">
          <span>Ethereum</span><span>Solana</span><span>BNB Smart Chain</span>
        </div>
      </div>
      <small>Self-hosted. Non-custodial. Open source.</small>
    </div>
    <main class="auth-form">
      <div>
        <span class="eyebrow">{{
          setup ? "FIRST-TIME SETUP" : "WELCOME BACK"
        }}</span>
        <h1>{{ setup ? "Set up your workspace" : "Sign in to CryptoPay" }}</h1>
        <p class="muted">
          {{
            setup
              ? "Create the single owner account for this installation."
              : "Keep track of what is paid and what is next."
          }}
        </p>
        @if (error()) {
          <div class="alert error" role="alert">{{ error() }}</div>
        }
        @if (loading) {
          <p role="status">Checking your installation…</p>
        } @else {
          <form (ngSubmit)="submit()">
            <label for="email">Email address</label
            ><input
              id="email"
              name="email"
              type="email"
              [(ngModel)]="email"
              autocomplete="username"
              required
            />
            <label for="password">Password</label
            ><input
              id="password"
              name="password"
              type="password"
              [(ngModel)]="password"
              [attr.autocomplete]="setup ? 'new-password' : 'current-password'"
              [minlength]="setup ? 12 : 1"
              maxlength="72"
              required
            />
            @if (setup) {
              <label for="setup">Installation setup token</label
              ><input
                id="setup"
                name="setup"
                type="password"
                [(ngModel)]="setupToken"
                required
                autocomplete="off"
              /><small
                >Use SETUP_TOKEN from the server environment. Password must
                contain at least 12 characters.</small
              >
            }
            <button class="primary wide" [disabled]="busy()">
              {{
                busy()
                  ? "Please wait…"
                  : setup
                    ? "Create workspace →"
                    : "Sign in →"
              }}
            </button>
          </form>
        }
        <p class="auth-foot">Your keys and data belong to this installation.</p>
      </div>
    </main>
  </div>`,
})
export class LoginComponent extends ViewState {
  api = inject(ApiService);
  router = inject(Router);
  setup = false;
  loading = true;
  email = "";
  password = "";
  setupToken = "";
  constructor() {
    super();
    void this.run(async () => {
      try {
        this.setup = (await this.api.request("/auth/setup")).setup_required;
      } finally {
        this.loading = false;
      }
    });
  }
  submit() {
    void this.run(async () => {
      await this.api.login(
        this.email,
        this.password,
        this.setup ? this.setupToken : undefined,
      );
      await this.router.navigateByUrl("/dashboard");
    });
  }
}
