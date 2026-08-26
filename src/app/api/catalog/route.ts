import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/rbac";

const typeMap: Record<string, any> = {
  glass: prisma.glassType,
  profiles: prisma.pvcProfile,
  hardware: prisma.hardwareItem,
  templates: prisma.productTemplate,
  processing: prisma.processingOption,
};

export async function GET(req: NextRequest) {
  const session = await requireRole(["COMPANY_ADMIN", "COMPANY_STAFF"]);
  const companyId = (session.user as any).companyId;
  const searchParams = new URL(req.url).searchParams;
  const type = searchParams.get("type") || "glass";
  const model = typeMap[type];
  if (!model) return NextResponse.json({ error: "Invalid type" }, { status: 400 });
  const items = await model.findMany({ where: { companyId }, orderBy: { createdAt: "desc" } });
  return NextResponse.json({ items });
}

export async function POST(req: NextRequest) {
  const session = await requireRole(["COMPANY_ADMIN"]);
  const companyId = (session.user as any).companyId;
  const body = await req.json();
  const type = body.type;
  const model = typeMap[type];
  if (!model) return NextResponse.json({ error: "Invalid type" }, { status: 400 });
  const item = await model.create({ data: { ...body.data, companyId } });
  return NextResponse.json({ item });
}
