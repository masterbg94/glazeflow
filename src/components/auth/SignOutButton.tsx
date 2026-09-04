'use client';

import { signOut } from 'next-auth/react';

/**
 * Renders a Sign out link/button. Safe to drop into any layout — server or
 * client — because it is itself a client component.
 *
 * The callbackUrl is derived from the current hostname so a customer signing
 * out from acme.localhost:3000 lands back on /login (served under the
 * storefront), while a staff member on localhost:3000 lands on /login too.
 */
export function SignOutButton() {
  return (
    <button
      onClick={() => signOut({ callbackUrl: '/login' })}
      className="text-sm font-medium text-red-600 hover:underline"
    >
      Sign out
    </button>
  );
}