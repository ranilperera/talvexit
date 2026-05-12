// Graph API email service — replaces SMTP/nodemailer.
// Uses OAuth2 client credentials flow to acquire a token, then sends
// via POST /users/{from}/sendMail in the Microsoft Graph API.
// Node 20 has native fetch — no isomorphic-fetch required.

// ─── Types ────────────────────────────────────────────────────────────────────

export interface EmailRecipient {
  name?:  string;
  email:  string;
}

export interface SendEmailOptions {
  to:           EmailRecipient | EmailRecipient[];
  subject:      string;
  html:         string;
  text?:        string;
  replyTo?:     EmailRecipient;
  attachments?: Array<{
    name:        string;
    contentType: string;
    contentB64:  string;
  }>;
}

interface TokenResponse {
  access_token: string;
  expires_in:   number;
}

// ─── Service ──────────────────────────────────────────────────────────────────

class GraphEmailService {
  private readonly tenantId:     string;
  private readonly clientId:     string;
  private readonly clientSecret: string;
  private readonly fromEmail:    string;
  private readonly fromName:     string;

  private accessToken: string | null = null;
  private tokenExpiry: number = 0;

  constructor() {
    this.tenantId     = process.env.AZURE_EMAIL_TENANT_ID     ?? '';
    this.clientId     = process.env.AZURE_EMAIL_CLIENT_ID     ?? '';
    this.clientSecret = process.env.AZURE_EMAIL_CLIENT_SECRET ?? '';
    this.fromEmail    = process.env.EMAIL_FROM      ?? 'alerts@onsys.com.au';
    this.fromName     = process.env.EMAIL_FROM_NAME ?? 'onys.online';

    if (!this.tenantId || !this.clientId || !this.clientSecret) {
      console.warn(
        '[graph-email] Missing Azure credentials ' +
        '(AZURE_EMAIL_TENANT_ID / AZURE_EMAIL_CLIENT_ID / AZURE_EMAIL_CLIENT_SECRET). ' +
        'Email sending will fail until these are set.',
      );
    }
  }

  // ── OAuth2 token (cached, refreshed 60s before expiry) ────────────────────

  async getAccessToken(): Promise<string> {
    if (this.accessToken && Date.now() < this.tokenExpiry - 60_000) {
      return this.accessToken;
    }

    const url =
      `https://login.microsoftonline.com/${this.tenantId}/oauth2/v2.0/token`;

    const body = new URLSearchParams({
      client_id:     this.clientId,
      client_secret: this.clientSecret,
      scope:         'https://graph.microsoft.com/.default',
      grant_type:    'client_credentials',
    });

    const res = await fetch(url, {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body:    body.toString(),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`[graph-email] Token request failed (${res.status}): ${err}`);
    }

    const data = await res.json() as TokenResponse;
    this.accessToken = data.access_token;
    this.tokenExpiry = Date.now() + data.expires_in * 1000;

    console.log('[graph-email] Access token refreshed');
    return this.accessToken;
  }

  // ── Send email ────────────────────────────────────────────────────────────

  async sendEmail(options: SendEmailOptions): Promise<void> {
    if (!this.tenantId || !this.clientId || !this.clientSecret) {
      throw new Error('[graph-email] Azure credentials not configured');
    }

    const token = await this.getAccessToken();

    const recipients = (Array.isArray(options.to) ? options.to : [options.to]).map((r) => ({
      emailAddress: { address: r.email, name: r.name ?? r.email },
    }));

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const message: Record<string, any> = {
      subject: options.subject,
      body: {
        contentType: 'HTML',
        content:     options.html,
      },
      from: {
        emailAddress: { address: this.fromEmail, name: this.fromName },
      },
      toRecipients: recipients,
    };

    if (options.replyTo) {
      message['replyTo'] = [{
        emailAddress: { address: options.replyTo.email, name: options.replyTo.name ?? options.replyTo.email },
      }];
    }

    if (options.attachments?.length) {
      message['attachments'] = options.attachments.map((a) => ({
        '@odata.type':  '#microsoft.graph.fileAttachment',
        name:           a.name,
        contentType:    a.contentType,
        contentBytes:   a.contentB64,
      }));
    }

    const url = `https://graph.microsoft.com/v1.0/users/${this.fromEmail}/sendMail`;

    const res = await fetch(url, {
      method:  'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify({ message, saveToSentItems: true }),
    });

    // 202 Accepted = success (Graph returns no body)
    if (res.status === 202 || res.status === 200) {
      console.log(
        `[graph-email] Sent to ${recipients.map((r) => r.emailAddress.address).join(', ')}`,
      );
      return;
    }

    const errBody = await res.text();
    throw new Error(`[graph-email] Send failed (${res.status}): ${errBody}`);
  }
}

// ─── Singleton ────────────────────────────────────────────────────────────────

export const graphEmailService = new GraphEmailService();

export async function sendEmail(options: SendEmailOptions): Promise<void> {
  return graphEmailService.sendEmail(options);
}
