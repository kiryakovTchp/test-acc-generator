export interface InboxMessage {
  plainText: string;
  html?: string;
}

export interface EmailAccount {
  address: string;
  password: string;
}

export interface EmailProvider {
  createAccount(): Promise<EmailAccount>;
  fetchInbox(address: string, password: string): Promise<InboxMessage[]>;
}
