export interface InboxLink {
  url: string;
  label?: string;
  isPrimary?: boolean;
}

export interface InboxMessage {
  plainText: string;
  cleanText?: string;
  html?: string;
  sender?: string;
  subject?: string;
  receivedAt?: string;
  links?: InboxLink[];
}

export interface EmailAccount {
  address: string;
  password: string;
  provider?: string;
}

export interface EmailProvider {
  createAccount(): Promise<EmailAccount>;
  fetchInbox(address: string, password: string, waitMs?: number): Promise<InboxMessage[]>;
  checkHealth?(): Promise<{ ok: boolean; provider: string; message: string }>;
}
