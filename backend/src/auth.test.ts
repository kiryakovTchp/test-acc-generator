import test from 'node:test';
import assert from 'node:assert/strict';
import { hashPassword, hashSessionToken, newSessionToken, verifyPassword } from './auth.js';
import db from './db.js';

test('password hashing verifies the original password and rejects another one', () => {
  const hash = hashPassword('correct horse battery staple');
  assert.match(hash, /^scrypt:v1:/);
  assert.equal(verifyPassword('correct horse battery staple', hash), true);
  assert.equal(verifyPassword('wrong password', hash), false);
});

test('seed users are stored with password hashes instead of plaintext passwords', () => {
  const row = db.prepare('SELECT password, password_hash FROM users WHERE id = ?').get(1) as { password: string; password_hash: string } | undefined;
  assert.equal(row?.password, '');
  assert.match(row?.password_hash ?? '', /^scrypt:v1:/);
});

test('session token hashes are stable but do not expose the token', () => {
  const token = newSessionToken();
  const hash = hashSessionToken(token);
  assert.equal(hash, hashSessionToken(token));
  assert.notEqual(hash, token);
  assert.equal(hash.length, 64);
});
