import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const source = readFileSync(new URL('../src/lib/reconnect-google.ts', import.meta.url), 'utf8');
const script = ts.transpile(source.replace('export async function', 'async function'), {
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.CommonJS,
});
const context = vm.createContext({ Error, Promise, exports: {} });
vm.runInContext(script, context);
const reconnect = context.reconnectGoogle;
const redirectUrl = 'https://example.com/';
const googleUrl = new URL('https://accounts.google.com/authorize');
const result = { verification: { externalVerificationRedirectURL: googleUrl } };

test('starts Google authorization directly without opening profile settings', async () => {
  let params;
  const clerk = {
    loaded: true,
    user: { id: 'A', createExternalAccount: async (value) => { params = value; return result; } },
  };
  assert.equal(await reconnect(clerk, redirectUrl, () => assert.fail('Unexpected verification')), googleUrl);
  assert.equal(params.strategy, 'oauth_google');
  assert.equal(params.redirectUrl, redirectUrl);
});

test('required verification opens Clerk prompt and retries only after successful verification', async () => {
  let attempts = 0;
  let notified = false;
  const clerk = {
    loaded: true,
    user: { id: 'A', createExternalAccount: async () => {
      if (++attempts === 1) throw { errors: [{ code: 'session_reverification_required' }] };
      return result;
    } },
    __internal_openReverification: ({ afterVerification }) => {
      assert.equal(attempts, 1);
      assert.equal(notified, true);
      afterVerification();
    },
  };
  assert.equal(await reconnect(clerk, redirectUrl, () => { notified = true; }), googleUrl);
  assert.equal(attempts, 2);
});

test('cancelled verification surfaces cancellation without retrying', async () => {
  let attempts = 0;
  const clerk = {
    loaded: true,
    user: { id: 'A', createExternalAccount: async () => {
      attempts++;
      throw { errors: [{ code: 'session_reverification_required' }] };
    } },
    __internal_openReverification: ({ afterVerificationCancelled }) => afterVerificationCancelled(),
  };
  await assert.rejects(reconnect(clerk, redirectUrl, () => {}), /cancelled/);
  assert.equal(attempts, 1);
});

test('missing sessions, provider failures and missing redirect links surface errors', async () => {
  await assert.rejects(reconnect({ loaded: false }, redirectUrl, () => {}), /sign in again/);
  const clerk = { loaded: true, user: { id: 'A', createExternalAccount: async () => { throw new Error('Provider unavailable'); } } };
  await assert.rejects(reconnect(clerk, redirectUrl, () => {}), /Provider unavailable/);
  clerk.user.createExternalAccount = async () => ({ verification: null });
  await assert.rejects(reconnect(clerk, redirectUrl, () => {}), /reconnection link/);
});

test('switching accounts during verification prevents reconnecting the old account', async () => {
  const clerk = {
    loaded: true,
    user: { id: 'A', createExternalAccount: async () => { throw { errors: [{ code: 'session_reverification_required' }] }; } },
    __internal_openReverification: ({ afterVerification }) => {
      clerk.user = { id: 'B' };
      afterVerification();
    },
  };
  await assert.rejects(reconnect(clerk, redirectUrl, () => {}), /account changed/);
});

const page = readFileSync(new URL('../src/pages/index.astro', import.meta.url), 'utf8');
const start = page.indexOf('      async function openAccountDialog()');
const end = page.indexOf('      type OpenLibrarySyncOptions', start);
assert.ok(start >= 0 && end > start);
const routing = ts.transpile(page.slice(start, end), { target: ts.ScriptTarget.ES2022 });

test('desktop and mobile share direct reconnect routing instead of account menus', async () => {
  const calls = [];
  const ctx = vm.createContext({
    startupAccountCheckDone: true,
    websiteUserId: 'A',
    websiteGoogleReconnectRequired: true,
    startGoogleReconnect: async () => calls.push('reconnect'),
    accountButton: { classList: { contains: () => true } },
    accountDialog: { dataset: { signedIn: 'true' }, open: false, showModal: () => calls.push('account') },
    openOpenLibrarySyncDialog: () => calls.push('openlibrary'),
  });
  vm.runInContext(routing, ctx);
  await ctx.openAccountDialog();
  assert.deepEqual(calls, ['reconnect']);
  ctx.websiteGoogleReconnectRequired = false;
  await ctx.openAccountDialog();
  assert.deepEqual(calls, ['reconnect', 'account']);
  assert.match(page, /accountButton\.addEventListener\("click", openAccountDialog\)/);
  assert.match(page, /mobileAccountButton\.addEventListener\("click", openAccountDialog\)/);
});

const reconnectStart = page.indexOf('      async function startGoogleReconnect()');
const reconnectEnd = page.indexOf('      async function openAccountDialog()', reconnectStart);
const uiScript = ts.transpile(page.slice(reconnectStart, reconnectEnd), { target: ts.ScriptTarget.ES2022 });

function setupUI(reconnectGoogle) {
  const calls = [];
  const button = () => ({
    setAttribute: (key, value) => calls.push(`${key}:${value}`),
    removeAttribute: (key) => calls.push(`remove:${key}`),
  });
  const ctx = vm.createContext({
    Error,
    googleReconnectRunning: false,
    googleReconnectStatus: { hidden: true, textContent: '' },
    cloudLibraryStatus: {},
    accountButton: button(), mobileAccountButton: button(),
    accountDialog: { close: () => calls.push('close'), showModal: () => calls.push('show') },
    updateAccountButton: () => {},
    $clerkStore: { get: () => ({ loaded: true }) },
    reconnectGoogle,
    location: { href: redirectUrl, assign: (url) => calls.push(url) },
  });
  vm.runInContext(uiScript, ctx);
  return { ctx, calls };
}

test('reconnect shows progress, keeps native dialogs closed during verification and prevents duplicate requests', async () => {
  let finish;
  let requests = 0;
  const { ctx, calls } = setupUI(async (_clerk, _url, onVerification) => {
    requests++;
    onVerification();
    return new Promise((resolve) => { finish = resolve; });
  });
  const pending = ctx.startGoogleReconnect();
  assert.equal(ctx.googleReconnectStatus.hidden, false);
  assert.match(ctx.googleReconnectStatus.textContent, /Verify your identity/);
  assert.equal(calls.includes('show'), false);
  await ctx.startGoogleReconnect();
  assert.equal(requests, 1);
  finish(googleUrl);
  await pending;
  assert.ok(calls.includes(googleUrl.href));
  assert.equal(ctx.googleReconnectRunning, false);
});

test('reconnect errors restore the dialog with visible feedback and allow retry', async () => {
  const { ctx, calls } = setupUI(async () => { throw new Error('Connection cancelled'); });
  await ctx.startGoogleReconnect();
  assert.equal(ctx.cloudLibraryStatus.textContent, 'Connection cancelled');
  assert.equal(ctx.googleReconnectStatus.hidden, true);
  assert.equal(ctx.googleReconnectRunning, false);
  assert.ok(calls.includes('show'));
  assert.ok(calls.includes('remove:aria-busy'));
});
