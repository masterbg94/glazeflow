'use client';

import { useEffect } from 'react';

/**
 * Route-segment error boundary.
 *
 * Without this, a server component that throws renders a blank page. The
 * uncaught `requireRole` rejections used to land here as a 500.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Unhandled application error:', error);
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <h1 className="mb-2 text-2xl font-bold text-slate-900">Greška</h1>
        <p className="mb-6 text-sm text-slate-500">
          Došlo je do greške pri učitavanju ove stranice. Pokušajte ponovo.
        </p>
        {error.digest && <p className="mb-4 text-xs text-slate-400">Kod greške: {error.digest}</p>}
        <button onClick={reset} className="btn bg-blue-600 text-white">
          Pokušaj ponovo
        </button>
      </div>
    </div>
  );
}
