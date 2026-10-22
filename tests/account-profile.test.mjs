import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';

const page = readFileSync(new URL('../src/pages/index.astro', import.meta.url), 'utf8');
const account = readFileSync(new URL('../src/components/WebsiteAccount.astro', import.meta.url), 'utf8');
const start = page.indexOf('        profile.addEventListener("click"');
const end = page.indexOf('        signOut.addEventListener', start);
assert.ok(start >= 0 && end > start);

function setup(clerk) {
  let click;
  const calls = [];
  const status = {};
  vm.runInNewContext(page.slice(start, end), {
    profile: { addEventListener: (_, handler) => { click = handler; } },
    $clerkStore: { get: () => clerk },
    accountDialog: {
      close: () => calls.push('close-account'),
      showModal: () => calls.push('reopen-account'),
    },
    cloudLibraryStatus: status,
  });
  return { click, calls, status };
}

test('profile uses Clerk modal after closing the native account dialog', () => {
  const clerk = { loaded: true, openUserProfile: () => calls.push('open-profile') };
  const { click, calls } = setup(clerk);
  click();
  assert.deepEqual(calls, ['close-account', 'open-profile']);
  assert.doesNotMatch(account, /id="website-profile-dialog"|id="website-profile-mount"/);
  assert.doesNotMatch(page, /mountUserProfile|profileDialog\.showModal/);
});

test('unloaded account controls show feedback without closing the dialog', () => {
  const { click, calls, status } = setup({ loaded: false });
  click();
  assert.deepEqual(calls, []);
  assert.match(status.textContent, /still loading/);
});

test('profile opening failure restores the account dialog with an error', () => {
  const { click, calls, status } = setup({
    loaded: true,
    openUserProfile() { throw new Error('Profile unavailable'); },
  });
  click();
  assert.deepEqual(calls, ['close-account', 'reopen-account']);
  assert.match(status.textContent, /Could not open account settings|Profile unavailable/);
});
