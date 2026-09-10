import { ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { getTenantBySlug } from '@/lib/tenant';

export default async function StorefrontHome({
  params,
}: {
  params: Promise<{ companySlug: string }>;
}) {
  const { companySlug: tenantSlug } = await params;
  const tenant = await getTenantBySlug(tenantSlug);

  return (
    <div>
      <section className="rounded-2xl bg-gradient-to-r from-blue-700 to-slate-900 p-10 text-white">
        <h1 className="text-3xl font-bold">Dobrodošli, {tenant.name}</h1>
        <p className="mt-3 max-w-xl text-white/80">
          Poručite od dobavljača {tenant.company.name}: staklo, PVC profile, prozore i vrata uz live
          cene na osnovu dimenzija.
        </p>
        <Link
          href={`/${tenantSlug}/order`}
          className="mt-6 inline-flex items-center gap-2 rounded-lg bg-white px-5 py-3 font-medium text-blue-600 hover:bg-slate-100"
        >
          Počnite narudžbinu <ArrowRight size={16} />
        </Link>
      </section>
      <section className="mt-12 grid gap-4 sm:grid-cols-3">
        {[
          {
            title: 'Live Pricing',
            desc: 'Cene se računaju odmah po vašem cenovniku dok unosite dimenzije.',
          },
          {
            title: 'Više stavki',
            desc: 'Dodajte više stakala, profila i prozora u jednu narudžbinu.',
          },
          {
            title: 'Praćenje statusa',
            desc: 'Pratite narudžbinu od potvrde do proizvodnje i isporuke.',
          },
        ].map((f) => (
          <div key={f.title} className="rounded-xl border border-slate-200 bg-white p-6">
            <h3 className="font-semibold text-slate-900">{f.title}</h3>
            <p className="mt-2 text-sm text-slate-500">{f.desc}</p>
          </div>
        ))}
      </section>
    </div>
  );
}
