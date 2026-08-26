import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/rbac";

export async function GET() {
  const session = await requireRole(["SUPER_ADMIN"]);
  const companies = await prisma.company.findMany({ include: { _count: { select: { users: true, orders: true } } } });
  return NextResponse.json({ companies });
}

export async function POST(req: NextRequest) {
  const session = await requireRole(["SUPER_ADMIN"]);
  const body = await req.json();
  const company = await prisma.company.create({ data: body });
  return NextResponse.json({ company });
}
