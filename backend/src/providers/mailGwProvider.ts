import { MailTmProvider } from './mailTmProvider.js';

export class MailGwProvider extends MailTmProvider {
  constructor() {
    super({
      providerName: 'mail_gw',
      baseUrl: process.env.MAIL_GW_BASE_URL ?? 'https://api.mail.gw',
    });
  }
}
