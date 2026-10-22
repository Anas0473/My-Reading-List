import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';

const page = readFileSync(new URL('../src/pages/index.astro', import.meta.url), 'utf8');
const start = page.indexOf('      function updateAccountButton()');
const end = page.indexOf('      // Right after loading, wait briefly for the account checks', start);
assert.ok(start >= 0 && end > start);

function setup() {
  const image = {
    hidden: true,
    getAttribute() { return this.src ?? null; },
    removeAttribute() { delete this.src; },
  };
  const element = () => ({ dataset: {}, classList: { toggle() {} } });
  const context = vm.createContext({
    websiteUserId: 'user-A', websiteUserName: 'Alice', websiteUserImage: 'https://example.com/alice.jpg',
    websiteOwner: 'clerk:user-A', cloudReauthenticationRequired: false,
    websiteGoogleReconnectRequired: false,
    openLibraryStartupSyncPending: false, openLibrarySyncRunning: false, cloudSyncRunning: false,
    getOpenLibraryPushUser: () => null,
    accountButton: element(), mobileAccountButton: element(), accountDialog: element(),
    accountButtonLabel: {}, accountButtonStatus: {}, accountSummary: {},
    accountAvatarImage: image, accountAvatarFallback: { hidden: false },
  });
  vm.runInContext(page.slice(start, end), context);
  return context;
}

test('signed-in account shows its name and profile picture', () => {
  const context = setup();
  context.updateAccountButton();
  assert.equal(context.accountButtonLabel.textContent, 'Alice');
  assert.equal(context.accountButtonStatus.textContent, 'Manage account');
  assert.equal(context.accountButton.title, 'Signed in to My Reading List');
  assert.equal(context.accountDialog.dataset.openLibraryOnly, 'false');
  assert.equal(context.accountAvatarImage.src, 'https://example.com/alice.jpg');
  assert.equal(context.accountAvatarImage.hidden, false);
  assert.equal(context.accountAvatarFallback.hidden, true);
});

test('signing out clears the previous profile picture', () => {
  const context = setup();
  context.updateAccountButton();
  context.websiteUserId = null;
  context.updateAccountButton();
  assert.equal(context.accountAvatarImage.src, undefined);
  assert.equal(context.accountAvatarImage.hidden, true);
  assert.equal(context.accountAvatarFallback.hidden, false);
});

test('accounts without a photo and Open Library-only accounts use the fallback', () => {
  const context = setup();
  context.websiteUserImage = null;
  context.updateAccountButton();
  assert.equal(context.accountAvatarFallback.hidden, false);
  context.websiteUserId = null;
  context.getOpenLibraryPushUser = () => 'reader';
  context.updateAccountButton();
  assert.equal(context.accountButtonLabel.textContent, 'Open Library');
  assert.equal(context.accountButtonStatus.textContent, 'Connected');
  assert.equal(context.accountDialog.dataset.openLibraryOnly, 'true');
  assert.equal(context.accountAvatarImage.hidden, true);
});

test('Open Library-only accounts say they are syncing until the sync finishes', () => {
  const context = setup();
  context.websiteUserId = null;
  context.getOpenLibraryPushUser = () => 'reader';
  context.openLibraryStartupSyncPending = true;
  context.updateAccountButton();
  assert.equal(context.accountButtonLabel.textContent, 'Open Library');
  assert.equal(context.accountButtonStatus.textContent, 'Syncing…');
  context.openLibraryStartupSyncPending = false;
  context.openLibrarySyncRunning = true;
  context.updateAccountButton();
  assert.equal(context.accountButtonLabel.textContent, 'Open Library');
  assert.equal(context.accountButtonStatus.textContent, 'Syncing…');
  context.openLibrarySyncRunning = false;
  context.updateAccountButton();
  assert.equal(context.accountButtonLabel.textContent, 'Open Library');
  assert.equal(context.accountButtonStatus.textContent, 'Connected');
});

test('website accounts say they are syncing until their library sync finishes', () => {
  const context = setup();
  context.cloudSyncRunning = true;
  context.updateAccountButton();
  assert.equal(context.accountButtonLabel.textContent, 'Alice');
  assert.equal(context.accountButtonStatus.textContent, 'Syncing your library…');
  context.cloudSyncRunning = false;
  context.updateAccountButton();
  assert.equal(context.accountButtonStatus.textContent, 'Manage account');
});

test('website accounts hide Open Library-only badges even with a legacy connection', () => {
  const context = setup();
  context.getOpenLibraryPushUser = () => 'reader';
  context.updateAccountButton();
  assert.equal(context.accountDialog.dataset.openLibraryOnly, 'false');
});

test('Google reconnect warning appears without treating the website session as signed out', () => {
  const context = setup();
  context.websiteGoogleReconnectRequired = true;
  context.cloudSyncRunning = true;
  const states = {};
  context.accountButton.classList.toggle = (name, enabled) => { states[name] = enabled; };
  context.updateAccountButton();
  assert.equal(context.accountButtonLabel.textContent, 'Alice');
  assert.equal(context.accountButtonStatus.textContent, 'Reconnect Google');
  assert.equal(context.mobileAccountButton.textContent, 'Reconnect');
  assert.equal(context.accountDialog.dataset.signedIn, 'true');
  assert.equal(states['needs-google-reconnect'], true);
  assert.equal(states['is-connected'], true);
  assert.match(context.accountButton.title, /Google needs reconnecting/);
  context.websiteGoogleReconnectRequired = false;
  context.cloudSyncRunning = false;
  context.updateAccountButton();
  assert.equal(states['needs-google-reconnect'], false);
  assert.equal(context.accountButtonStatus.textContent, 'Manage account');
  assert.equal(context.mobileAccountButton.textContent, 'Account');
});

test('Google warnings do not leak into signed-out or Open Library-only accounts', () => {
  const context = setup();
  context.websiteGoogleReconnectRequired = true;
  context.websiteUserId = null;
  context.updateAccountButton();
  assert.equal(context.accountButtonLabel.textContent, 'Sign in to sync');
  context.getOpenLibraryPushUser = () => 'reader';
  context.updateAccountButton();
  assert.equal(context.accountButtonStatus.textContent, 'Connected');
  assert.equal(context.mobileAccountButton.textContent, 'Account');
});
