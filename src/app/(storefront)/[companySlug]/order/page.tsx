import { getCompanyBySlug } from "@/lib/tenant";
import { OrderWizard } from "@/components/order-wizard/OrderWizard";

export default async function OrderPage({ params }: { params: Promise<{ companySlug: string }> }) {
  const { companySlug } = await params;
  const company = await getCompanyBySlug(companySlug);

  return (
    <div>
      <h1 className="mb-2 text-2xl font-bold">Place an Order</h1>
      <p className="mb-8 text-sm text-slate-500">Configure your items — prices update live as you enter dimensions.</p>
      <OrderWizard
        companyId={company.id}
        currency={company.currency}
        glassTypes={company.glassTypes as any}
        profiles={company.pvcProfiles as any}
        hardwareItems={company.hardwareItems as any}
        templates={company.productTemplates as any}
        processingOptions={company.processingOptions as any}
      />
    </div>
  );
}
