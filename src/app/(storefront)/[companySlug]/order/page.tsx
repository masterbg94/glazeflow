import { OrderWizard } from '@/components/order-wizard/OrderWizard';
import { getCompanyBySlug } from '@/lib/tenant';

export default async function OrderPage({ params }: { params: Promise<{ companySlug: string }> }) {
  const { companySlug } = await params;
  const company = await getCompanyBySlug(companySlug);
  const glassTypes = company.glassTypes.map((item) => ({
    ...item,
    costPricePerSqm: Number(item.costPricePerSqm),
    sellPricePerSqm: Number(item.sellPricePerSqm),
    thicknessSurchargePercentPerMm: Number(item.thicknessSurchargePercentPerMm),
  }));
  const pvcProfiles = company.pvcProfiles.map((item) => ({
    ...item,
    costPricePerMeter: Number(item.costPricePerMeter),
    sellPricePerMeter: Number(item.sellPricePerMeter),
  }));
  const hardwareItems = company.hardwareItems.map((item) => ({
    ...item,
    costPrice: Number(item.costPrice),
    sellPrice: Number(item.sellPrice),
  }));
  const productTemplates = company.productTemplates.map((item) => ({
    ...item,
    complexityMultiplier: Number(item.complexityMultiplier),
  }));
  const processingOptions = company.processingOptions.map((item) => ({
    ...item,
    costPrice: Number(item.costPrice),
    sellPrice: Number(item.sellPrice),
  }));

  return (
    <div>
      <h1 className="mb-2 text-2xl font-bold">Poručite stavku</h1>
      <p className="mb-8 text-sm text-slate-500">
        Konfigurisite stavke — cene se ažuriraju naživo prilikom unosa dimenzija.
      </p>
      <OrderWizard
        companyId={company.id}
        currency={company.currency}
        glassTypes={glassTypes}
        profiles={pvcProfiles}
        hardwareItems={hardwareItems}
        templates={productTemplates}
        processingOptions={processingOptions}
      />
    </div>
  );
}
