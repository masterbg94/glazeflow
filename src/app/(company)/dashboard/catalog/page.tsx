import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { getSessionUser } from '@/lib/rbac';
import CatalogClient from './CatalogClient';

const KINDS = [
  { value: 'GLASS_ONLY', label: 'Samostaklo' },
  { value: 'RAW_PROFILE', label: 'Si profil' },
  { value: 'FINISHED_WINDOW', label: 'Gotov prozor' },
  { value: 'FINISHED_DOOR', label: 'Gotova vrata' },
];

export default async function CatalogPage() {
  const user = await getSessionUser();
  let companyId = user?.companyId ?? null;

  // Superadmin has no companyId — resolve the single main company
  if (!companyId && user?.platformRole === 'SUPER_ADMIN') {
    const main = await prisma.company.findFirst({
      where: { isMainCompany: true },
      select: { id: true },
    });
    companyId = main?.id ?? null;
  }
  if (!companyId) redirect('/dashboard');

  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { isMainCompany: true },
  });

  if (!company?.isMainCompany) {
    return (
      <div className="space-y-6">
        <div className="rounded-xl border border-slate-200 bg-amber-50 p-6">
          <h2 className="text-lg font-semibold text-amber-800">Pristup ograničen</h2>
          <p className="mt-2 text-amber-700">
            Samo glavna kompanija upravlja katalogom i cenama. Tenantske organizacije samo naručuju
            iz ponuđenog kataloga.
          </p>
        </div>
      </div>
    );
  }

  return <CatalogClient kinds={KINDS} />;
}
