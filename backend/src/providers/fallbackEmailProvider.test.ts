import test from 'node:test';
import assert from 'node:assert/strict';
import { FallbackEmailProvider } from './fallbackEmailProvider.js';
import type { EmailProvider } from './emailProvider.js';

test('fallback provider creates mailbox with secondary provider when primary fails', async () => {
  const primary: EmailProvider = {
    async createAccount() {
      throw new Error('primary down');
    },
    async fetchInbox() {
      throw new Error('primary down');
    },
  };
  const secondary: EmailProvider = {
    async createAccount() {
      return { address: 'fallback@mail.gw', password: 'secret', provider: 'mail_gw' };
    },
    async fetchInbox() {
      return [{ plainText: 'Code 123456' }];
    },
  };

  const provider = new FallbackEmailProvider(primary, secondary);
  assert.deepEqual(await provider.createAccount(), { address: 'fallback@mail.gw', password: 'secret', provider: 'mail_gw' });
  assert.equal((await provider.fetchInbox('fallback@mail.gw', 'secret'))[0]?.plainText, 'Code 123456');
});
