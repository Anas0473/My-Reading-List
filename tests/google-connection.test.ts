import assert from 'node:assert/strict';
import { test } from 'node:test';
import { googleReconnectRequired } from '../src/lib/google-connection.ts';

test('Google reconnect errors match Clerk connected-account reconnect conditions', () => {
  for (const code of [
    'external_account_missing_refresh_token',
    'oauth_fetch_user_error',
    'oauth_token_exchange_error',
    'external_account_email_address_verification_required',
  ]) {
    assert.equal(googleReconnectRequired([{ provider: 'google', verification: { error: { code } } }]), true);
  }
});

test('healthy, absent, other-provider and unrelated errors do not produce Google warnings', () => {
  assert.equal(googleReconnectRequired(), false);
  assert.equal(googleReconnectRequired([{ provider: 'google', verification: null }]), false);
  assert.equal(googleReconnectRequired([{ provider: 'google', verification: { error: null } }]), false);
  assert.equal(googleReconnectRequired([{ provider: 'github', verification: { error: { code: 'oauth_fetch_user_error' } } }]), false);
  assert.equal(googleReconnectRequired([{ provider: 'google', verification: { error: { code: 'unrelated_error' } } }]), false);
});
