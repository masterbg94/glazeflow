import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSessionUser } from '@/lib/rbac';

/**
 * Pending status-transition requests.
 *
 * Without this the approval chain was write-only: a staff member could
 * request a backward move, a transition row was created, and no one could
 * ever see or approve it in the app.
 */
export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Only main-company staff approve transitions. A tenant never can.
  if (user.platformRole === 'CUSTOMER' || user.customerOrgId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let where: { companyId: string } | { customerOrgId: string };
  if (user.platformRole === 'SUPER_ADMIN') {
    where = { companyId: user.companyId ?? '' };
    if (!user.companyId) {
      // A SUPER_ADMIN without a company still sees every request.
      const all = await prisma.orderStatusTransition.findMany({
        where: { status: 'PENDING' },
        include: {
          order: { select: { id: true, orderNumber: true, status: true, companyId: true } },
          requester: { select: { id: true, name: true, platformRole: true } },
        },
        orderBy: { createdAt: 'desc' },
      });
      return NextResponse.json({ transitions: all });
    }
  } else {
    if (!user.companyId) {
      return NextResponse.json({ error: 'No company' }, { status: 403 });
    }
    where = { companyId: user.companyId };
  }

  const transitions = await prisma.orderStatusTransition.findMany({
    where: { status: 'PENDING', order: where },
    include: {
      order: {
        select: {
          id: true,
          orderNumber: true,
          status: true,
          companyId: true,
          customerOrgId: true,
          customerOrg: { select: { name: true } },
        },
      },
      requester: { select: { id: true, name: true, platformRole: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  return NextResponse.json({ transitions });
}
