export default function RegisterPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="mb-4 text-2xl font-bold">Registracija zatvorena</h1>
        <p className="text-sm text-slate-600">
          Nalozi se kreiraju samo od strane dobavljača. Kontaktirajte administratora glavne
          kompanije da vam otvori pristup.
        </p>
        <a href="/login" className="btn mt-6 block bg-blue-600 text-center text-white">
          Prijava
        </a>
      </div>
    </div>
  );
}
