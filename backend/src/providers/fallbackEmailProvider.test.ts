import test from 'node:test';
import assert from 'node:assert/strict';
import { FallbackEmailProvider } from './fallbackEmailProvider.js';
import type { EmailProvider } from './emailProvider.js';

test('fallback provider creates mailbox with secondary provider when primary fails but does not fallback during inbox fetch', async () => {
  let fallbackFetchCalls = 0;
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
      fallbackFetchCalls += 1;
      return [{ plainText: 'Code 123456' }];
    },
  };

  const provider = new FallbackEmailProvider(primary, secondary);
  assert.deepEqual(await provider.createAccount(), { address: 'fallback@mail.gw', password: 'secret', provider: 'mail_gw' });
  await assert.rejects(() => provider.fetchInbox('fallback@mail.gw', 'secret'), /primary down/);
  assert.equal(fallbackFetchCalls, 0);
});
