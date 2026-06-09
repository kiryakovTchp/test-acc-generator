import { simpleParser } from 'mailparser';
import type { EmailAccount, EmailProvider, InboxMessage } from './emailProvider.js';
import { randomString } from '../utils.js';

interface MailTmDomain {
  domain: string;
  isActive: boolean;
}

interface MailTmMessage {
  id: string;
  intro?: string;
  text?: string;
  html?: string;
  htmlAsText?: string;
  subject?: string;
  createdAt?: string;
  from?: { address?: string; name?: string };
}

export class MailTmProvider implements EmailProvider {
  private readonly baseUrl = process.env.MAIL_TM_BASE_URL ?? 'https://api.mail.tm';
  private readonly domainCacheTtlMs = Number(process.env.MAIL_TM_DOMAIN_CACHE_TTL_MS ?? 60 * 60 * 1000);
  private readonly inboxPollAttempts = Number(process.env.MAIL_TM_INBOX_POLL_ATTEMPTS ?? 1);
  private readonly inboxPollDelayMs = Number(process.env.MAIL_TM_INBOX_POLL_DELAY_MS ?? 2500);
  private domainCache: { value: string; expiresAt: number } | null = null;

  async createAccount(): Promise<EmailAccount> {
    const domain = await this.getDomain();
    const address = `test${randomString(10)}@${domain}`;
    const password = `${randomString(16)}A!7`;

    const response = await fetch(`${this.baseUrl}/accounts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address, password }),
    });

    if (!response.ok) {
      throw new Error(`mail.tm account creation failed (${response.status})`);
    }

    return { address, password };
  }

  async fetchInbox(address: string, password: string, waitMs = 0): Promise<InboxMessage[]> {
    const token = await this.getToken(address, password);
    const configuredAttempts = this.inboxPollAttempts;
    const configuredDelay = this.inboxPollDelayMs;
    const overrideAttempts = waitMs > 0 ? Math.max(1, Math.ceil(waitMs / Math.max(configuredDelay, 1000))) : configuredAttempts;

    for (let attempt = 0; attempt < overrideAttempts; attempt += 1) {
      const messages = await this.listMessages(token);
      if (messages.length > 0 || attempt === overrideAttempts - 1) {
        return Promise.all(messages.map((message) => this.hydrateMessage(token, message.id, message)));
      }
      await sleep(configuredDelay);
    }

    return [];
  }

  private async getDomain() {
    if (this.domainCache && this.domainCache.expiresAt > Date.now()) {
      return this.domainCache.value;
    }

    const response = await fetch(`${this.baseUrl}/domains?page=1`, {
      headers: { Accept: 'application/ld+json' },
    });
    if (!response.ok) {
      throw new Error(`mail.tm domain lookup failed (${response.status})`);
    }

    const payload = await response.json() as { 'hydra:member'?: MailTmDomain[] };
    const domain = payload['hydra:member']?.find((item) => item.isActive)?.domain;
    if (!domain) {
      throw new Error('mail.tm returned no active domains');
    }

    this.domainCache = { value: domain, expiresAt: Date.now() + this.domainCacheTtlMs };
    return domain;
  }

  private async getToken(address: string, password: string) {
    const response = await fetch(`${this.baseUrl}/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address, password }),
    });

    if (!response.ok) {
      throw new Error(`mail.tm token request failed (${response.status})`);
    }

    const payload = await response.json() as { token?: string };
    if (!payload.token) {
      throw new Error('mail.tm token missing from response');
    }
    return payload.token;
  }

  private async listMessages(token: string) {
    const response = await fetch(`${this.baseUrl}/messages?page=1`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/ld+json',
      },
    });

    if (!response.ok) {
      throw new Error(`mail.tm inbox fetch failed (${response.status})`);
    }

    const payload = await response.json() as { 'hydra:member'?: MailTmMessage[] };
    return payload['hydra:member'] ?? [];
  }

  private async hydrateMessage(token: string, id: string, preview: MailTmMessage): Promise<InboxMessage> {
    const response = await fetch(`${this.baseUrl}/messages/${id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!response.ok) {
      return {
        plainText: preview.text ?? preview.htmlAsText ?? preview.intro ?? '',
        html: preview.html,
        sender: preview.from?.address ?? preview.from?.name,
        subject: preview.subject,
        receivedAt: preview.createdAt,
      };
    }

    const payload = await response.json() as MailTmMessage & { textAsHtml?: string; source?: string };
    const parsed = payload.source ? await safeParseSource(payload.source) : null;
    const plainText = parsed?.text ?? payload.text ?? payload.htmlAsText ?? payload.intro ?? '';
    const html = normalizeHtml(parsed?.html) ?? normalizeHtml(payload.html) ?? normalizeHtml(payload.textAsHtml);
    return {
      plainText,
      html,
      sender: payload.from?.address ?? payload.from?.name,
      subject: payload.subject,
      receivedAt: payload.createdAt,
    };
  }
}

function normalizeHtml(value: string | false | null | undefined) {
  return typeof value === 'string' ? value : undefined;
}

async function safeParseSource(source: string) {
  try {
    return await simpleParser(source);
  } catch {
    return null;
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
