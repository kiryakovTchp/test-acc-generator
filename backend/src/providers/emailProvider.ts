export interface InboxMessage {
  plainText: string;
  html?: string;
  sender?: string;
  subject?: string;
  receivedAt?: string;
}

export interface EmailAccount {
  address: string;
  password: string;
}

export interface EmailProvider {
  createAccount(): Promise<EmailAccount>;
  fetchInbox(address: string, password: string, waitMs?: number): Promise<InboxMessage[]>;
}
