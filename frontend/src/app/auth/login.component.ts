import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { AuthService } from '../shared/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [FormsModule, RouterModule],
  template: `
    <div class="auth-container">
      <div class="auth-card">
        <h1>CryptoPay Manager</h1>
        <h2>Login</h2>
        <form (ngSubmit)="onSubmit()">
          <div class="field">
            <label for="email">Email</label>
            <input id="email" type="email" [(ngModel)]="email" name="email" required />
          </div>
          <div class="field">
            <label for="password">Password</label>
            <input id="password" type="password" [(ngModel)]="password" name="password" required />
          </div>
          @if (error()) {
            <div class="error-msg">{{ error() }}</div>
          }
          <button type="submit" [disabled]="loading()" class="btn-primary">
            {{ loading() ? 'Loading...' : 'Login' }}
          </button>
        </form>
        <p class="auth-link">Don't have an account? <a routerLink="/register">Register</a></p>
      </div>
    </div>
  `,
  styles: [`
    .auth-container { display: flex; justify-content: center; align-items: center; min-height: 100vh; }
    .auth-card { width: 100%; max-width: 400px; padding: 2rem; background: var(--surface-card); border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
    h1 { margin: 0 0 0.25rem; font-size: 1.5rem; }
    h2 { margin: 0 0 1.5rem; font-size: 1rem; color: var(--text-color-secondary); }
    .field { margin-bottom: 1rem; }
    label { display: block; margin-bottom: 0.25rem; font-size: 0.875rem; }
    input { width: 100%; padding: 0.5rem; border: 1px solid var(--surface-border); border-radius: 6px; }
    .btn-primary { width: 100%; padding: 0.75rem; background: var(--primary-color); color: var(--primary-color-text); border: none; border-radius: 6px; cursor: pointer; }
    .btn-primary:disabled { opacity: 0.6; }
    .error-msg { color: #e24c4c; font-size: 0.875rem; margin-bottom: 1rem; }
    .auth-link { text-align: center; margin-top: 1rem; font-size: 0.875rem; }
  `]
})
export class LoginComponent {
  private auth = inject(AuthService);
  private router = inject(Router);

  email = '';
  password = '';
  loading = signal(false);
  error = signal('');

  async onSubmit() {
    if (!this.email || !this.password) return;
    this.loading.set(true);
    this.error.set('');

    try {
      await this.auth.login(this.email, this.password).toPromise();
      this.router.navigate(['/dashboard']);
    } catch {
      this.error.set('Invalid email or password');
    } finally {
      this.loading.set(false);
    }
  }
}
