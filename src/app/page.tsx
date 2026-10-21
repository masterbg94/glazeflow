import Link from 'next/link';

export default function Home() {
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <span className="text-xl font-bold text-blue-600">GlazeFlow</span>
          <Link href="/login" className="text-sm font-medium text-slate-700 hover:text-blue-600">
            Prijava
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-24 text-center">
        <h1 className="text-5xl font-bold text-slate-900">
          Naručujte Staklo i PVC sa Cenama u Realnom Vremenu
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-lg text-slate-500">
          B2B platforma za narudžbine koja povezuje proizvođače stakla/PVC-a sa montažama i
          instalaterima.
        </p>
        <div className="mt-8 flex justify-center gap-4">
          <Link
            href="/register"
            className="rounded-lg bg-blue-600 px-6 py-3 font-medium text-white"
          >
            Počnite
          </Link>
          <Link
            href="/login"
            className="rounded-lg border border-slate-300 px-6 py-3 font-medium text-slate-700"
          >
            Prijava
          </Link>
        </div>
      </main>
    </div>
  );
}
