import type { EmailAccount, EmailProvider, InboxMessage } from './emailProvider.js';

export class FallbackEmailProvider implements EmailProvider {
  constructor(
    private readonly primary: EmailProvider,
    private readonly fallback: EmailProvider,
    private readonly providerName = 'mail_tm_mail_gw_fallback',
  ) {}

  async createAccount(): Promise<EmailAccount> {
    try {
      return await this.primary.createAccount();
    } catch {
      return this.fallback.createAccount();
    }
  }

  async fetchInbox(address: string, password: string, waitMs = 0): Promise<InboxMessage[]> {
    return this.primary.fetchInbox(address, password, waitMs);
  }

  async checkHealth() {
    const primary = this.primary.checkHealth ? await this.primary.checkHealth().catch((error) => ({ ok: false, provider: 'primary', message: error instanceof Error ? error.message : 'Primary provider failed' })) : null;
    const fallback = this.fallback.checkHealth ? await this.fallback.checkHealth().catch((error) => ({ ok: false, provider: 'fallback', message: error instanceof Error ? error.message : 'Fallback provider failed' })) : null;
    return {
      ok: Boolean(primary?.ok || fallback?.ok),
      provider: this.providerName,
      message: [
        primary ? `${primary.provider}: ${primary.message}` : '',
        fallback ? `${fallback.provider}: ${fallback.message}` : '',
      ].filter(Boolean).join(' | '),
    };
  }
}
