import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const component = readFileSync(new URL('../src/components/PrivacyLink.astro', import.meta.url), 'utf8');
const page = readFileSync(new URL('../src/pages/index.astro', import.meta.url), 'utf8');
const account = readFileSync(new URL('../src/components/WebsiteAccount.astro', import.meta.url), 'utf8');

test('privacy is directly available outside authentication dialogs on desktop and mobile', () => {
  assert.match(page, /<section class="sidebar-account"[\s\S]*?<PrivacyLink \/>[\s\S]*?<\/section>/);
  assert.match(component, /<a class="privacy-link" href="\/privacy" aria-label="Privacy policy" title="Privacy policy">/);
  assert.match(page, /\.sidebar-account \{ display: contents; \}/);
  assert.match(page, /\.sidebar-account \.account-button \{ display: none; \}/);
});

test('privacy icon has keyboard focus styling and needs no menu or script', () => {
  assert.match(component, /<svg[^>]*aria-hidden="true"/);
  assert.match(component, /\.privacy-link:focus-visible/);
  assert.doesNotMatch(component, /<details|<script|<summary/);
});

test('account dialog shows its privacy link only during sign-in and sign-up', () => {
  assert.match(account, /<footer class="account-privacy-footer when-signed-out">\s*<a href="\/privacy">Privacy policy<\/a>/);
  assert.match(account, /\.account-dialog\[data-signed-in="true"\] \.when-signed-out,/);
});
