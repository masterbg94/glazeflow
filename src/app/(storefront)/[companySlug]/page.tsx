import { getCompanyBySlug } from "@/lib/tenant";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

export default async function StorefrontHome({ params }: { params: Promise<{ companySlug: string }> }) {
  const { companySlug } = await params;
  const company = await getCompanyBySlug(companySlug);

  return (
    <div>
      <section className="rounded-2xl p-10 text-white" style={{ background: "linear-gradient(to right, var(--brand-primary), var(--brand-secondary))" }}>
        <h1 className="text-3xl font-bold">{company.tagline || `Welcome to ${company.name}`}</h1>
        <p className="mt-3 max-w-xl text-white/80">
          Order glass, PVC profiles, and finished windows/doors with live dimension-based pricing.
        </p>
        <Link href={`/${companySlug}/order`} className="mt-6 inline-flex items-center gap-2 rounded-lg bg-white px-5 py-3 font-medium text-blue-600 hover:bg-slate-100">
          Start an Order <ArrowRight size={16} />
        </Link>
      </section>
      <section className="mt-12 grid gap-4 sm:grid-cols-3">
        {[
          { title: "Live Pricing", desc: "Prices calculate instantly as you enter dimensions and select options." },
          { title: "Multi-Item Orders", desc: "Add many glass pieces, profiles, and windows to one purchase order." },
          { title: "Track Everything", desc: "Follow each order from confirmation to production to delivery." },
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
