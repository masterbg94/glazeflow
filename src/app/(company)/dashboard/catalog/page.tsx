import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import CatalogClient from './CatalogClient';

const KINDS = [
  { value: 'GLASS_ONLY', label: 'Samostaklo' },
  { value: 'RAW_PROFILE', label: 'Si profil' },
  { value: 'FINISHED_WINDOW', label: 'Gotov prozor' },
  { value: 'FINISHED_DOOR', label: 'Gotova vrata' },
];

export default async function CatalogPage() {
  const session = await getSession();
  const user = session?.user as any;
  const companyId = user?.companyId;

  if (!companyId) {
    redirect('/dashboard');
  }

  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { isProducer: true },
  });

  if (!company?.isProducer) {
    return (
      <div className="space-y-6">
        <div className="rounded-xl border border-slate-200 bg-amber-50 p-6">
          <h2 className="text-lg font-semibold text-amber-800">Pristupljeno ograničeno</h2>
          <p className="mt-2 text-amber-700">
            Samo glavna proizvođačka kompanija može upravljati katalogom i cenama. Vaša organizacija
            može samo da naručuje iz ponuđenog kataloga.
          </p>
        </div>
      </div>
    );
  }

  return <CatalogClient kinds={KINDS} />;
}
