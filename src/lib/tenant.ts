import { prisma } from "./prisma";
import { notFound } from "next/navigation";

export async function getCompanyBySlug(slug: string) {
  const company = await prisma.company.findUnique({
    where: { slug },
    include: {
      glassTypes: { where: { isActive: true } },
      pvcProfiles: { where: { isActive: true } },
      hardwareItems: { where: { isActive: true } },
      productTemplates: { where: { isActive: true } },
      processingOptions: { where: { isActive: true } },
    },
  });
  if (!company || !company.isActive) notFound();
  return company;
}
