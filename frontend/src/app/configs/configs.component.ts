import { Component, inject, OnDestroy, ChangeDetectorRef } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { ApiService, ViewState } from "../shared/api.service";
@Component({
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: ` <div class="page-heading">
      <div>
        <span class="eyebrow">INSTALLATION PREFERENCES</span>
        <h1>Settings</h1>
        <p class="muted">
          Connect your explorers and make this workspace yours.
        </p>
      </div>
      <span class="subtle-tag">Single-owner installation</span>
    </div>
    @if (error()) {
      <div class="alert error" role="alert">{{ error() }}</div>
    }
    @if (notice()) {
      <div class="alert good" role="status">{{ notice() }}</div>
    }
    @if (s) {
      <form (ngSubmit)="save()">
        <section class="panel settings-section">
          <div class="settings-intro">
            <span class="section-number">01</span>
            <h2>Blockchain monitoring</h2>
            <p>
              Provide your own explorer keys. Access and pricing depend on your
              provider plan.
            </p>
          </div>
          <div class="settings-fields">
            <label class="check"
              ><input
                type="checkbox"
                name="etherscan-enabled"
                [(ngModel)]="s.etherscan_enabled"
              />Enable Etherscan V2</label
            >
            <p class="helper">
              One Etherscan key can serve Ethereum and BNB Smart Chain. BSC plan
              entitlement must be checked.
            </p>
            <label for="etherscan"
              >Etherscan API key
              <span class="optional">{{
                s.etherscan_key_configured ? "configured" : "not configured"
              }}</span></label
            ><input
              id="etherscan"
              name="etherscan"
              type="password"
              [(ngModel)]="etherscan"
              autocomplete="new-password"
              placeholder="Leave blank to keep the current key"
            /><label class="check"
              ><input
                name="clear-etherscan"
                type="checkbox"
                [(ngModel)]="clearEtherscan"
              />Clear saved Etherscan key</label
            >
            <div class="chain-switches">
              <label class="check"
                ><input
                  type="checkbox"
                  name="eth"
                  [(ngModel)]="s.chains.ethereum"
                />Ethereum mainnet</label
              ><label class="check"
                ><input
                  type="checkbox"
                  name="bsc"
                  [(ngModel)]="s.chains.bsc"
                />BNB Smart Chain mainnet</label
              >
            </div>
            <hr />
            <label class="check"
              ><input
                type="checkbox"
                name="solscan-enabled"
                [(ngModel)]="s.solscan_enabled"
              />Enable Solscan</label
            ><label for="solscan"
              >Solscan API key
              <span class="optional">{{
                s.solscan_key_configured ? "configured" : "not configured"
              }}</span></label
            ><input
              id="solscan"
              name="solscan"
              type="password"
              [(ngModel)]="solscan"
              autocomplete="new-password"
              placeholder="Leave blank to keep the current key"
            /><label class="check"
              ><input
                type="checkbox"
                name="clear-solscan"
                [(ngModel)]="clearSolscan"
              />Clear saved Solscan key</label
            ><label class="check"
              ><input
                type="checkbox"
                name="sol"
                [(ngModel)]="s.chains.solana"
              />Solana mainnet</label
            >
            <p class="helper">
              Solscan wallet-transfer monitoring may require a paid Pro API
              plan.
            </p>
            <label for="interval">Check every (minutes)</label
            ><input
              id="interval"
              name="interval"
              type="number"
              min="1"
              max="1440"
              [(ngModel)]="s.polling_minutes"
              required
            />
            <div class="alert">
              Disabling a chain pauses monitoring, but requests still expire
              permanently. Check wallet scan health after changing credentials.
            </div>
          </div>
        </section>
        <section class="panel settings-section">
          <div class="settings-intro">
            <span class="section-number">02</span>
            <h2>Public billing</h2>
            <p>
              Share live payment pages when your installation is reachable by
              your customers.
            </p>
          </div>
          <div class="settings-fields">
            <h3>Optional Cloudflare Tunnel</h3>
            <p class="helper">
              Use an unused hostname in a Cloudflare-managed zone. Token
              permissions: Account Cloudflare Tunnel Edit, Zone DNS Edit, and
              Zone Read for validation.
            </p>
            <label for="cf-token"
              >Cloudflare API token (leave blank to keep)</label
            ><input
              id="cf-token"
              name="cf-token"
              type="password"
              [(ngModel)]="cloudflareToken"
              autocomplete="new-password"
            />
            <label for="cf-account">Account ID</label
            ><input
              id="cf-account"
              name="cf-account"
              [(ngModel)]="s.cloudflare_account_id"
            />
            <label for="cf-zone">Zone ID</label
            ><input
              id="cf-zone"
              name="cf-zone"
              [(ngModel)]="s.cloudflare_zone_id"
            />
            <label for="cf-hostname">Billing hostname</label
            ><input
              id="cf-hostname"
              name="cf-hostname"
              [(ngModel)]="s.cloudflare_hostname"
              placeholder="pay.example.com"
            />
            @if (cf) {
              <p role="status">
                Setup: {{ cf.phase || "Disabled" }} · Connector:
                {{ cf.connector }}
              </p>
              @if (cf.error) {
                <p class="alert">{{ cf.error }}</p>
              }
            }
            <div class="form-actions">
              @for (action of cfActions; track action) {
                <button
                  type="button"
                  class="secondary"
                  [disabled]="busy() && action !== 'disable'"
                  (click)="cloudflare(action)"
                >
                  {{ action }}
                </button>
              }
            </div>
            <p class="helper">
              Save settings before provisioning. Disable preserves resources;
              remove deletes only resources created by this installation.
            </p>
            <label for="public-url"
              >Public base URL <span class="optional">optional</span></label
            ><input
              id="public-url"
              name="public-url"
              type="url"
              [(ngModel)]="s.public_base_url"
              placeholder="https://pay.example.com"
            /><small
              >Use your site's origin without a path. Leave empty for local-only
              PDF billing.</small
            >
          </div>
        </section>
        <section class="panel settings-section">
          <div class="settings-intro">
            <span class="section-number">03</span>
            <h2>Email delivery</h2>
            <p>
              Optional SMTP delivery sends payment requests as PDF attachments.
            </p>
          </div>
          <div class="settings-fields">
            <label class="check"
              ><input
                type="checkbox"
                name="smtp-enabled"
                [(ngModel)]="s.smtp_enabled"
              />Enable SMTP email</label
            >
            <div class="form-row">
              <div>
                <label for="smtp-host">SMTP host</label
                ><input
                  id="smtp-host"
                  name="smtp-host"
                  [(ngModel)]="s.smtp_host"
                  [required]="s.smtp_enabled"
                />
              </div>
              <div>
                <label for="smtp-port">Port</label
                ><input
                  id="smtp-port"
                  name="smtp-port"
                  type="number"
                  min="1"
                  max="65535"
                  [(ngModel)]="s.smtp_port"
                  required
                />
              </div>
            </div>
            <label for="smtp-security">Connection security</label
            ><select
              id="smtp-security"
              name="smtp-security"
              [(ngModel)]="s.smtp_security"
            >
              <option value="starttls">STARTTLS (usually 587)</option>
              <option value="tls">TLS (usually 465)</option>
              <option value="none">None (local relay only)</option></select
            ><label for="smtp-user">Username</label
            ><input
              id="smtp-user"
              name="smtp-user"
              [(ngModel)]="s.smtp_user"
              autocomplete="off"
            /><label for="smtp-password"
              >Password
              <span class="optional">{{
                s.smtp_password_configured ? "configured" : "not configured"
              }}</span></label
            ><input
              id="smtp-password"
              name="smtp-password"
              type="password"
              [(ngModel)]="smtpPassword"
              autocomplete="new-password"
              placeholder="Leave blank to keep the current password"
            /><label class="check"
              ><input
                type="checkbox"
                name="clear-smtp"
                [(ngModel)]="clearSmtp"
              />Clear saved SMTP password</label
            ><label for="smtp-from">Sender email</label
            ><input
              id="smtp-from"
              name="smtp-from"
              type="email"
              [(ngModel)]="s.smtp_from"
              [required]="s.smtp_enabled"
            /><small
              >Sending is always an explicit action on a payment request. SMTP
              acceptance does not guarantee inbox delivery.</small
            >
          </div>
        </section>
        <section class="panel settings-section">
          <div class="settings-intro">
            <span class="section-number">04</span>
            <h2>Integration limits</h2>
            <p>Control requests from clients using your API keys.</p>
          </div>
          <div class="settings-fields">
            <label for="callback-origins"
              >Allowed callback origins (one per line)</label
            ><textarea
              id="callback-origins"
              name="callback-origins"
              [(ngModel)]="callbackOrigins"
              rows="4"
              placeholder="https://store.example.com"
            ></textarea>
            <p class="helper">
              HTTPS only. Add each subdomain explicitly. Paths belong on payment
              callback URLs.
            </p>
            <p>
              Webhook signing secret:
              {{
                s.webhook_secret_configured ? "configured" : "not configured"
              }}
            </p>
            <button
              type="button"
              class="secondary"
              [disabled]="busy()"
              (click)="rotateSecret()"
            >
              Generate / rotate signing secret
            </button>
            @if (webhookSecret) {
              <div class="alert">
                <strong>Copy now; shown once.</strong
                ><code class="break">{{ webhookSecret }}</code
                ><button type="button" (click)="webhookSecret = ''">
                  Dismiss
                </button>
              </div>
            }
            <label class="check"
              ><input
                type="checkbox"
                name="limit-enabled"
                [(ngModel)]="s.rate_limit_enabled"
              />Enable shared API request limit</label
            >
            <div class="form-row">
              <div>
                <label for="limit">Maximum requests</label
                ><input
                  id="limit"
                  name="limit"
                  type="number"
                  min="1"
                  max="10000"
                  [(ngModel)]="s.rate_limit_max_requests"
                  required
                />
              </div>
              <div>
                <label for="window">Window (minutes)</label
                ><input
                  id="window"
                  name="window"
                  type="number"
                  min="1"
                  max="1440"
                  [(ngModel)]="s.rate_limit_window_minutes"
                  required
                />
              </div>
            </div>
          </div>
        </section>
        <div class="save-bar">
          <span>Secrets are encrypted on the server.</span
          ><button class="primary" [disabled]="busy()">
            {{ busy() ? "Saving…" : "Save settings →" }}
          </button>
        </div>
      </form>
      <section class="panel form-panel">
        <h2>Integration API tokens</h2>
        <p class="muted">
          Use <code>X-API-Key</code> for authenticated requests to
          <code>/api/api/v1/payments</code> behind the web proxy.
        </p>
        @if (newToken) {
          <div class="alert good">
            <strong>Copy this token now. It is only shown once.</strong
            ><code class="break token-display">{{ newToken }}</code
            ><button type="button" class="secondary" (click)="copyToken()">
              Copy token</button
            ><button type="button" class="text-button" (click)="newToken = ''">
              Dismiss
            </button>
          </div>
        }
        <form class="inline-form" (ngSubmit)="createToken()">
          <div>
            <label for="token-label">Token label</label
            ><input
              id="token-label"
              name="token-label"
              [(ngModel)]="tokenLabel"
              required
              maxlength="100"
              placeholder="My store integration"
            />
          </div>
          <button class="secondary" [disabled]="busy()">Generate token</button>
        </form>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Label</th>
                <th>Created (UTC)</th>
                <th>Last used (UTC)</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              @for (t of tokens; track t.id) {
                <tr>
                  <td>{{ t.label }}</td>
                  <td>{{ t.created_at | date: "medium" : "UTC" }}</td>
                  <td>
                    {{
                      t.last_used_at
                        ? (t.last_used_at | date: "medium" : "UTC")
                        : "Never"
                    }}
                  </td>
                  <td>
                    <button
                      class="text-button destructive"
                      [disabled]="busy()"
                      (click)="revoke(t.id)"
                    >
                      Revoke
                    </button>
                  </td>
                </tr>
              } @empty {
                <tr>
                  <td colspan="4" class="empty">No integration tokens yet.</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      </section>
    }`,
})
export class ConfigsComponent extends ViewState implements OnDestroy {
  private viewChange = inject(ChangeDetectorRef);
  timer = setInterval(() => {
    if (!document.hidden)
      void this.api
        .request("/cloudflare")
        .then((cf) => {
          this.cf = cf;
          this.viewChange.markForCheck();
        })
        .catch(() => {});
  }, 5000);
  ngOnDestroy() {
    clearInterval(this.timer);
    this.webhookSecret = "";
  }
  api = inject(ApiService);
  s: any;
  tokens: any[] = [];
  cf: any;
  cloudflareToken = "";
  callbackOrigins = "";
  webhookSecret = "";
  cfActions = ["provision", "check", "reconnect", "disable", "remove"];
  etherscan = "";
  solscan = "";
  smtpPassword = "";
  clearEtherscan = false;
  clearSolscan = false;
  clearSmtp = false;
  newToken = "";
  tokenLabel = "";
  constructor() {
    super();
    void this.run(async () => {
      this.s = await this.api.request("/configs");
      this.callbackOrigins = (this.s.allowed_callback_origins || []).join("\n");
      this.cf = await this.api.request("/cloudflare");
      this.tokens = await this.api.request("/api-tokens");
    });
  }
  save() {
    void this.run(async () => {
      const body: any = Object.fromEntries(
        Object.entries(this.s).filter(
          ([key]) => !key.endsWith("_configured") && key !== "billing_origin",
        ),
      );
      body.allowed_callback_origins = this.callbackOrigins
        .split(/\n/)
        .map((v) => v.trim())
        .filter(Boolean);
      if (this.cloudflareToken)
        body.cloudflare_api_token = this.cloudflareToken;
      if (this.clearEtherscan) body.etherscan_key = null;
      else if (this.etherscan) body.etherscan_key = this.etherscan;
      if (this.clearSolscan) body.solscan_key = null;
      else if (this.solscan) body.solscan_key = this.solscan;
      if (this.clearSmtp) body.smtp_password = null;
      else if (this.smtpPassword) body.smtp_password = this.smtpPassword;
      this.s = await this.api.request("/configs", "PATCH", body);
      this.etherscan =
        this.solscan =
        this.smtpPassword =
        this.cloudflareToken =
          "";
      this.clearEtherscan = this.clearSolscan = this.clearSmtp = false;
      this.notice.set(
        "Settings saved. Interval changes apply within one minute.",
      );
    });
  }
  cloudflare(action: string) {
    if (action === "disable") {
      void this.api
        .request("/cloudflare/disable", "POST", {})
        .then((cf) => {
          this.cf = cf;
          this.viewChange.markForCheck();
        })
        .catch((e: any) => this.error.set(e.message));
      return;
    }
    if (
      action === "remove" &&
      !confirm("Remove this installation’s Cloudflare tunnel and DNS record?")
    )
      return;
    void this.run(async () => {
      this.cf = await this.api.request("/cloudflare/" + action, "POST", {});
    });
  }
  rotateSecret() {
    if (
      this.s.webhook_secret_configured &&
      !confirm(
        "Rotate signing secret? Update store verifiers; queued retries use the new secret.",
      )
    )
      return;
    void this.run(async () => {
      this.webhookSecret = (
        await this.api.request("/configs/webhook-secret", "POST", {})
      ).secret;
      this.s.webhook_secret_configured = true;
    });
  }
  createToken() {
    void this.run(async () => {
      const t = await this.api.request("/api-tokens", "POST", {
        label: this.tokenLabel,
      });
      this.newToken = t.token;
      this.tokenLabel = "";
      this.tokens = await this.api.request("/api-tokens");
    });
  }
  revoke(id: string) {
    if (!confirm("Revoke this API token? Clients using it will lose access."))
      return;
    void this.run(async () => {
      await this.api.request("/api-tokens/" + id, "DELETE");
      this.tokens = await this.api.request("/api-tokens");
    });
  }
  copyToken() {
    void this.run(async () => {
      await navigator.clipboard.writeText(this.newToken);
      this.notice.set("Token copied.");
    });
  }
}
