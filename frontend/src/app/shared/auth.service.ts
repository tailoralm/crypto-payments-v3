import { Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';
import { tap } from 'rxjs/operators';

export interface AuthUser {
  id: string;
  email: string;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private api = environment.apiBaseUrl;
  private accessToken: string | null = null;

  user = signal<AuthUser | null>(null);
  isAuthenticated = signal(false);

  constructor(private http: HttpClient) {
    const stored = sessionStorage.getItem('access_token');
    if (stored) {
      this.accessToken = stored;
      this.isAuthenticated.set(true);
    }
  }

  getToken(): string | null {
    return this.accessToken;
  }

  register(email: string, password: string) {
    return this.http.post<{ id: string; email: string; created_at: string }>(
      `${this.api}/auth/register`,
      { email, password }
    );
  }

  login(email: string, password: string) {
    return this.http.post<{ access_token: string; expires_in: number }>(
      `${this.api}/auth/login`,
      { email, password },
      { withCredentials: true }
    ).pipe(
      tap((res) => {
        this.accessToken = res.access_token;
        sessionStorage.setItem('access_token', res.access_token);
        this.isAuthenticated.set(true);
        this.user.set({ id: '', email });
      })
    );
  }

  refresh() {
    return this.http.post<{ access_token: string; expires_in: number }>(
      `${this.api}/auth/refresh`,
      {},
      { withCredentials: true }
    ).pipe(
      tap((res) => {
        this.accessToken = res.access_token;
        sessionStorage.setItem('access_token', res.access_token);
        this.isAuthenticated.set(true);
      })
    );
  }

  logout() {
    return this.http.post(`${this.api}/auth/logout`, {}, { withCredentials: true }).pipe(
      tap(() => {
        this.accessToken = null;
        sessionStorage.removeItem('access_token');
        this.isAuthenticated.set(false);
        this.user.set(null);
      })
    );
  }
}
