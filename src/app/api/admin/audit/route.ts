import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireRole, toHttpError } from '@/lib/rbac';

/**
 * The audit trail, readable by the platform owner.
 *
 * Every state change in the application writes one row. This endpoint is how
 * a change is proved: who made it, on which record, from which address, and
 * when.
 */
export async function GET(req: NextRequest) {
  let session;
  try {
    session = await requireRole(['SUPER_ADMIN']);
  } catch (err) {
    return toHttpError(err);
  }

  const params = req.nextUrl.searchParams;
  const entity = params.get('entity');
  const entityId = params.get('entityId');
  const actorId = params.get('actorId');
  const action = params.get('action');
  const limit = Math.min(Math.max(Number(params.get('limit')) || 100, 1), 500);

  const entries = await prisma.auditLog.findMany({
    where: {
      ...(entity ? { entity } : {}),
      ...(entityId ? { entityId } : {}),
      ...(actorId ? { actorId } : {}),
      ...(action ? { action } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });

  return NextResponse.json({ entries });
}
