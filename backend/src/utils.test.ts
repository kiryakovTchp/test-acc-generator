import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanEmailText, dedupeLinks, extractCodes, pickPrimaryVerificationLink } from './utils.js';

test('pickPrimaryVerificationLink prefers real verification links over tracking redirects', () => {
  const winner = pickPrimaryVerificationLink([
    {
      url: 'https://click.example-mail.com/track?redirect=https%3A%2F%2Fproduct.example.com%2Fverify%3Ftoken%3Dabc',
      label: 'Verify Email',
    },
    {
      url: 'https://product.example.com/verify?token=abc',
      label: 'Verify your email',
    },
  ]);

  assert.equal(winner?.url, 'https://product.example.com/verify?token=abc');
});

test('pickPrimaryVerificationLink deprioritizes unsubscribe and support links', () => {
  const winner = pickPrimaryVerificationLink([
    { url: 'https://product.example.com/help', label: 'Help Center' },
    { url: 'https://product.example.com/unsubscribe', label: 'Unsubscribe' },
    { url: 'https://product.example.com/confirm?code=123456', label: 'Confirm account' },
  ]);

  assert.equal(winner?.url, 'https://product.example.com/confirm?code=123456');
});

test('cleanEmailText removes raw urls and malformed leftovers cleanly', () => {
  const cleaned = cleanEmailText('Verify your account ( https://example.com/verify?token=abc )\n\nUse [this link](https://example.com/alt) now.');

  assert.equal(cleaned, 'Verify your account\n\nUse this link now.');
});

test('dedupeLinks keeps only normalized https links', () => {
  const links = dedupeLinks([
    { url: 'https://example.com/verify?token=abc.' },
    { url: 'http://example.com/not-safe' },
    { url: 'javascript:alert(1)' },
    { url: 'https://example.com/verify?token=abc' },
  ]);

  assert.deepEqual(links, [{ url: 'https://example.com/verify?token=abc' }]);
});

test('extractCodes ignores copyright year ranges in email boilerplate', () => {
  const codes = extractCodes(`
    Welcome to MelBet.

    Copyright © 2015 — 2026 «MelBet»
    Privacy Policy
  `);

  assert.deepEqual(codes, []);
});

test('extractCodes keeps contextual verification codes', () => {
  const codes = extractCodes(`
    Your verification code is 483 920.
    Use 7741 to confirm login.
    Copyright © 2015 — 2026 «MelBet»
  `);

  assert.deepEqual(codes, ['483920', '7741']);
});
