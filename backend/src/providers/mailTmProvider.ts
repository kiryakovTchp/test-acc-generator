import { simpleParser } from 'mailparser';
import type { EmailAccount, EmailProvider, InboxMessage } from './emailProvider.js';
import { cleanEmailText, dedupeLinks, extractLinks, pickPrimaryVerificationLink, randomString } from '../utils.js';
import { ApiError } from '../limits.js';

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
  private readonly requestTimeoutMs = Number(process.env.MAIL_TM_REQUEST_TIMEOUT_MS ?? 10000);
  private readonly retryAttempts = Number(process.env.MAIL_TM_RETRY_ATTEMPTS ?? 2);
  private readonly retryDelayMs = Number(process.env.MAIL_TM_RETRY_DELAY_MS ?? 500);
  private domainCache: { value: string; expiresAt: number } | null = null;

  async createAccount(): Promise<EmailAccount> {
    const domain = await this.getDomain();
    const address = `test${randomString(10)}@${domain}`;
    const password = `${randomString(16)}A!7`;

    const response = await this.request('/accounts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address, password }),
    }, 'mail.tm account creation');

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

  async checkHealth() {
    const domain = await this.getDomain();
    return { ok: true, provider: 'mail_tm', message: `Active domain: ${domain}` };
  }

  private async getDomain() {
    if (this.domainCache && this.domainCache.expiresAt > Date.now()) {
      return this.domainCache.value;
    }

    const response = await this.request('/domains?page=1', {
      headers: { Accept: 'application/ld+json' },
    }, 'mail.tm domain lookup');
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
    const response = await this.request('/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address, password }),
    }, 'mail.tm token request');

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
    const response = await this.request('/messages?page=1', {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/ld+json',
      },
    }, 'mail.tm inbox fetch');

    if (!response.ok) {
      throw new Error(`mail.tm inbox fetch failed (${response.status})`);
    }

    const payload = await response.json() as { 'hydra:member'?: MailTmMessage[] };
    return payload['hydra:member'] ?? [];
  }

  private async hydrateMessage(token: string, id: string, preview: MailTmMessage): Promise<InboxMessage> {
    const response = await this.request(`/messages/${id}`, {
      headers: { Authorization: `Bearer ${token}` },
    }, 'mail.tm message fetch', { throwOnFailure: false });

    if (!response.ok) {
      const rawText = preview.text ?? preview.htmlAsText ?? preview.intro ?? '';
      const links = buildLinks(preview.html, rawText);
      return {
        plainText: rawText,
        cleanText: cleanEmailText(rawText),
        html: preview.html,
        sender: preview.from?.address ?? preview.from?.name,
        subject: preview.subject,
        receivedAt: preview.createdAt,
        links,
      };
    }

    const payload = await response.json() as MailTmMessage & { textAsHtml?: string; source?: string };
    const parsed = payload.source ? await safeParseSource(payload.source) : null;
    const plainText = parsed?.text ?? payload.text ?? payload.htmlAsText ?? payload.intro ?? '';
    const html = normalizeHtml(parsed?.html) ?? normalizeHtml(payload.html) ?? normalizeHtml(payload.textAsHtml);
    const links = buildLinks(html, plainText);
    return {
      plainText,
      cleanText: cleanEmailText(plainText),
      html,
      sender: payload.from?.address ?? payload.from?.name,
      subject: payload.subject,
      receivedAt: payload.createdAt,
      links,
    };
  }

  private async request(path: string, init: RequestInit, label: string, options: { throwOnFailure?: boolean } = {}) {
    const throwOnFailure = options.throwOnFailure ?? true;
    const attempts = Math.max(1, Math.floor(this.retryAttempts));
    let lastError: unknown = null;

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), Math.max(1000, this.requestTimeoutMs));
      try {
        const response = await fetch(`${this.baseUrl}${path}`, { ...init, signal: controller.signal });
        clearTimeout(timeout);
        if (response.ok || !this.shouldRetry(response.status) || attempt === attempts) {
          if (!response.ok && throwOnFailure) {
            throw new ApiError('mail_provider_unavailable', `${label} failed (${response.status})`, 502);
          }
          return response;
        }
      } catch (error) {
        clearTimeout(timeout);
        lastError = error;
        if (error instanceof ApiError || attempt === attempts) break;
      }

      await sleep(this.retryDelayMs * attempt);
    }

    if (lastError instanceof ApiError) throw lastError;
    throw new ApiError('mail_provider_unavailable', `${label} is temporarily unavailable`, 502);
  }

  private shouldRetry(status: number) {
    return status === 429 || status >= 500;
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

function buildLinks(html: string | undefined, text: string) {
  const fromHtml = extractAnchorLinks(html ?? '');
  const fromText = extractLinks(text).map((url) => ({ url }));
  const merged = dedupeLinks([...fromHtml, ...fromText]);
  const primary = pickPrimaryVerificationLink(merged);
  return merged.map((link) => ({ ...link, isPrimary: primary?.url === link.url }));
}

function extractAnchorLinks(html: string) {
  return [...html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>(.*?)<\/a>/gis)].map((match) => ({
    url: match[1],
    label: match[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() || undefined,
  }));
}
