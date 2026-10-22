import type { Clerk } from '@clerk/astro/types';

function needsReverification(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'errors' in error
    && Array.isArray(error.errors)
    && error.errors.some((item: unknown) => typeof item === 'object' && item !== null
      && 'code' in item && item.code === 'session_reverification_required');
}

export async function reconnectGoogle(clerk: Clerk, redirectUrl: string, onVerification: () => void): Promise<URL> {
  const user = clerk.user;
  if (!clerk.loaded || !user) throw new Error('Please sign in again before reconnecting Google.');
  const createConnection = () => {
    if (clerk.user?.id !== user.id) throw new Error('Your account changed. Please try again.');
    return user.createExternalAccount({ strategy: 'oauth_google', redirectUrl });
  };
  let connection;
  try {
    connection = await createConnection();
  } catch (error) {
    if (!needsReverification(error)) throw error;
    onVerification();
    // Astro has no useReverification hook; use the same typed modal API as Clerk's hook.
    await new Promise<void>((resolve, reject) => {
      clerk.__internal_openReverification({
        afterVerification: resolve,
        afterVerificationCancelled: () => reject(new Error('Google reconnection cancelled. Your website account is still signed in.')),
      });
    });
    connection = await createConnection();
  }
  if (clerk.user?.id !== user.id) throw new Error('Your account changed. Please try again.');
  const url = connection.verification?.externalVerificationRedirectURL;
  if (!url) throw new Error('Google did not provide a reconnection link. Please try again.');
  return url;
}
