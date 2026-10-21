import { redirect } from 'next/navigation';
import { OrderWizard } from '@/components/order-wizard/OrderWizard';
import { getSessionUser } from '@/lib/rbac';
import { getTenantBySlug, getTenantCatalog } from '@/lib/tenant';

export default async function OrderPage({ params }: { params: Promise<{ companySlug: string }> }) {
  const { companySlug: tenantSlug } = await params;
  const tenant = await getTenantBySlug(tenantSlug);

  // Only members of this tenant order here (cross-tenant safety)
  const user = await getSessionUser();
  if (!user?.customerOrgId) redirect('/login');
  if (user.customerOrgId !== tenant.id) redirect(`/${user.customerOrgSlug ?? ''}`);

  const catalog = await getTenantCatalog(tenant.id);

  return (
    <div>
      <h1 className="mb-2 text-2xl font-bold">Poručite stavku</h1>
      <p className="mb-8 text-sm text-slate-500">
        Konfigurisite stavke — cene se ažuriraju naživo po vašem cenovniku
        {catalog.tenant.discountPercent > 0 && ` (popust: ${catalog.tenant.discountPercent}%)`}.
      </p>
      <OrderWizard
        currency={catalog.company.currency}
        defaultShippingAddress={catalog.tenant.shippingAddress ?? ''}
        discountPercent={catalog.tenant.discountPercent}
        taxRatePercent={catalog.company.taxRatePercent}
        glassTypes={catalog.glassTypes}
        profiles={catalog.pvcProfiles}
        hardwareItems={catalog.hardwareItems}
        templates={catalog.productTemplates}
        processingOptions={catalog.processingOptions}
      />
    </div>
  );
}
