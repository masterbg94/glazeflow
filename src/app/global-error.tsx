'use client';

/**
 * Last-resort error boundary. Replaces the root layout when an error escapes
 * a nested boundary.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="sr">
      <body
        style={{
          display: 'flex',
          minHeight: '100vh',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'sans-serif',
          background: '#f8fafc',
          margin: 0,
        }}
      >
        <div
          style={{
            maxWidth: 420,
            padding: 32,
            textAlign: 'center',
            background: 'white',
            borderRadius: 16,
            border: '1px solid #e2e8f0',
          }}
        >
          <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>Greška</h1>
          <p style={{ fontSize: 14, color: '#64748b', marginBottom: 24 }}>
            Došlo je do neočekivane greške. Pokušajte ponovo.
          </p>
          <button
            onClick={reset}
            style={{
              background: '#2563eb',
              color: 'white',
              border: 0,
              borderRadius: 8,
              padding: '10px 18px',
              fontSize: 14,
              cursor: 'pointer',
            }}
          >
            Pokušaj ponovo
          </button>
        </div>
      </body>
    </html>
  );
}
