import type { EmailAccount, EmailProvider, InboxMessage } from './emailProvider.js';
import { randomString } from '../utils.js';

export class MailTmProvider implements EmailProvider {
  async createAccount(): Promise<EmailAccount> {
    const local = `test.${randomString(8)}`;
    return {
      address: `${local}@mail.tm`,
      password: `${randomString(14)}A!`,
    };
  }

  async fetchInbox(address: string): Promise<InboxMessage[]> {
    return [
      {
        plainText: `Welcome ${address}\nActivation code: 482931\nOpen https://mail.tm/message/demo to review the provider stub.`,
        html: `<p>Welcome ${address}</p><p>Activation code: <strong>482931</strong></p>`,
      },
    ];
  }
}
