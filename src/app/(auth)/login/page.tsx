'use client';

import { signIn } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';

// Customers sign in from their company storefront (e.g. acme.localhost:3000)
// and must land on /<slug>/my-orders — /dashboard is a company-staff route that
// does not exist under the storefront and 404s on a subdomain host. Root host
// (localhost:3000) keeps the default /dashboard target.
function getCustomerRedirect(): string {
  if (typeof window === 'undefined') return '/dashboard';
  const host = window.location.hostname.split(':')[0];
  const rootHost = (process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'localhost:3000').split(':')[0];
  if (host === rootHost || host === 'localhost' || host === '127.0.0.1' || host === `www.${rootHost}`) {
    return '/dashboard';
  }
  const slug = host.replace(`.${rootHost}`, '').replace(rootHost, '');
  return slug ? `/${slug}/my-orders` : '/dashboard';
}

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const callback = params.get('callbackUrl');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    const res = await signIn('credentials', { email, password, redirect: false });
    setLoading(false);
    if (res?.error) setError('Invalid email or password');
    else {
      // Honour an explicit callbackUrl only when it is a subdomain-scoped path;
      // otherwise fall back to the customer redirect computed from the host.
      const target =
        callback && callback.startsWith('/') && !callback.startsWith('/dashboard')
          ? callback
          : getCustomerRedirect();
      router.push(target);
      router.refresh();
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="mb-8 text-center">
          <div className="inline-block h-12 w-12 rounded-xl bg-blue-600 text-2xl font-bold leading-[48px] text-white">
            G
          </div>
          <h1 className="mt-4 text-2xl font-bold">GlazeFlow</h1>
          <p className="mt-1 text-sm text-slate-500">Sign in to your account</p>
        </div>
        {error && <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-600">{error}</div>}
        <LoginFormFields
          email={email}
          password={password}
          setEmail={setEmail}
          setPassword={setPassword}
          error={error}
          loading={loading}
          handleSubmit={handleSubmit}
        />
        <p className="mt-6 text-center text-sm text-slate-500">
          No account?{' '}
          <a href="/register" className="text-blue-600 hover:underline">
            Register
          </a>
        </p>
      </div>
    </div>
  );
}

function LoginFormFields({
  email,
  password,
  setEmail,
  setPassword,
  error,
  loading,
  handleSubmit,
}: {
  email: string;
  password: string;
  setEmail: (v: string) => void;
  setPassword: (v: string) => void;
  error: string;
  loading: boolean;
  handleSubmit: (e: React.FormEvent) => void;
}) {
  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700">Email</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="input"
          required
        />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700">Password</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="input"
          required
        />
      </div>
      <button
        type="submit"
        disabled={loading}
        className="btn w-full bg-blue-600 text-white hover:bg-blue-700"
      >
        {loading ? 'Signing in...' : 'Sign in'}
      </button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
