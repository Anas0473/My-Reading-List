type ExternalConnection = {
  provider: string;
  verification?: { error?: { code: string } | null } | null;
};

const reconnectErrors = new Set([
  'external_account_missing_refresh_token',
  'oauth_fetch_user_error',
  'oauth_token_exchange_error',
  'external_account_email_address_verification_required',
]);

export function googleReconnectRequired(accounts: readonly ExternalConnection[] = []): boolean {
  return accounts.some((account) =>
    account.provider === 'google' && reconnectErrors.has(account.verification?.error?.code || ''),
  );
}
