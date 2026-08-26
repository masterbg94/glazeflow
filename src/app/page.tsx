import Link from "next/link";

export default function Home() {
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <span className="text-xl font-bold text-blue-600">GlazeFlow</span>
          <Link href="/login" className="text-sm font-medium text-slate-700 hover:text-blue-600">Sign in</Link>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-24 text-center">
        <h1 className="text-5xl font-bold text-slate-900">Order Glass & PVC with Live Pricing</h1>
        <p className="mx-auto mt-4 max-w-2xl text-lg text-slate-500">
          The B2B ordering bridge between glass/PVC manufacturers and fabricators/installers.
        </p>
        <div className="mt-8 flex justify-center gap-4">
          <Link href="/register" className="rounded-lg bg-blue-600 px-6 py-3 font-medium text-white">Get Started</Link>
          <Link href="/login" className="rounded-lg border border-slate-300 px-6 py-3 font-medium text-slate-700">Sign in</Link>
        </div>
      </main>
    </div>
  );
}
