// Status transition rules for role-based access control

export const STATUS_ORDER: OrderStatus[] = [
  'NEW',
  'QUOTE_AMENDMENT',
  'CONFIRMED',
  'IN_PRODUCTION',
  'READY',
  'DELIVERED',
  'CLOSED',
];

export const CANCELLABLE_STATUSES: OrderStatus[] = [
  'NEW',
  'QUOTE_AMENDMENT',
  'CONFIRMED',
  'IN_PRODUCTION',
  'READY',
  'DELIVERED',
];

export type OrderStatus =
  | 'NEW'
  | 'QUOTE_AMENDMENT'
  | 'CONFIRMED'
  | 'IN_PRODUCTION'
  | 'READY'
  | 'DELIVERED'
  | 'CLOSED'
  | 'CANCELLED';

export type CompanyRole =
  'COMPANY_ADMIN' | 'COMPANY_SALES' | 'COMPANY_PRODUCTION' | 'PRODUCTION_WORKER';
export type PlatformRole = 'SUPER_ADMIN' | 'COMPANY_ADMIN' | 'COMPANY_STAFF' | 'CUSTOMER';

export type UserRole = CompanyRole | 'SUPER_ADMIN' | 'COMPANY_STAFF' | 'CUSTOMER';

export interface TransitionRule {
  allowed: boolean;
  requiresApproval: boolean;
  approverRoles: CompanyRole[];
}

function getStatusIndex(status: OrderStatus): number {
  return STATUS_ORDER.indexOf(status);
}

function isForwardTransition(from: OrderStatus, to: OrderStatus): boolean {
  const fromIdx = getStatusIndex(from);
  const toIdx = getStatusIndex(to);
  return fromIdx !== -1 && toIdx !== -1 && toIdx > fromIdx;
}

function isBackwardTransition(from: OrderStatus, to: OrderStatus): boolean {
  const fromIdx = getStatusIndex(from);
  const toIdx = getStatusIndex(to);
  return fromIdx !== -1 && toIdx !== -1 && toIdx < fromIdx;
}

function isCancellation(status: OrderStatus): boolean {
  return status === 'CANCELLED';
}

function isMainCompanyUser(userRole: UserRole, platformRole: PlatformRole): boolean {
  return platformRole !== 'CUSTOMER';
}

function getApproverRoles(userRole: UserRole, platformRole: PlatformRole): CompanyRole[] {
  // For CustomerOrg users, approval comes from platform admins (SUPER_ADMIN, COMPANY_ADMIN)
  if (platformRole === 'CUSTOMER') {
    return ['COMPANY_ADMIN'];
  }
  // For main company users, approval comes from COMPANY_ADMIN
  return ['COMPANY_ADMIN'];
}

export function getTransitionRule(
  userRole: UserRole,
  fromStatus: OrderStatus,
  toStatus: OrderStatus,
  platformRole: PlatformRole = 'COMPANY_STAFF'
): TransitionRule {
  // Super admin can do anything
  if (userRole === 'SUPER_ADMIN' || platformRole === 'SUPER_ADMIN') {
    return { allowed: true, requiresApproval: false, approverRoles: [] };
  }

  // Company admin (main company or CustomerOrg) can do anything
  if (userRole === 'COMPANY_ADMIN') {
    return { allowed: true, requiresApproval: false, approverRoles: [] };
  }

  const isMainCompany = isMainCompanyUser(userRole, platformRole);
  const approverRoles = getApproverRoles(userRole, platformRole);

  // Production worker - only forward transitions, no cancellations
  if (userRole === 'PRODUCTION_WORKER') {
    if (isCancellation(toStatus)) {
      return { allowed: false, requiresApproval: false, approverRoles: [] };
    }
    if (isForwardTransition(fromStatus, toStatus)) {
      return { allowed: true, requiresApproval: false, approverRoles: [] };
    }
    return { allowed: false, requiresApproval: false, approverRoles: [] };
  }

  // Company production (manager) - can move forward, backward needs admin approval
  if (userRole === 'COMPANY_PRODUCTION') {
    if (isCancellation(toStatus)) {
      return { allowed: true, requiresApproval: true, approverRoles };
    }
    if (isForwardTransition(fromStatus, toStatus)) {
      return { allowed: true, requiresApproval: false, approverRoles: [] };
    }
    if (isBackwardTransition(fromStatus, toStatus)) {
      return { allowed: true, requiresApproval: true, approverRoles };
    }
    return { allowed: false, requiresApproval: false, approverRoles: [] };
  }

  // Company sales - similar to production
  if (userRole === 'COMPANY_SALES') {
    if (isCancellation(toStatus)) {
      return { allowed: true, requiresApproval: true, approverRoles };
    }
    if (isForwardTransition(fromStatus, toStatus)) {
      return { allowed: true, requiresApproval: false, approverRoles: [] };
    }
    if (isBackwardTransition(fromStatus, toStatus)) {
      return { allowed: true, requiresApproval: true, approverRoles };
    }
    return { allowed: false, requiresApproval: false, approverRoles: [] };
  }

  // Company staff (generic main company) - treat as production
  if (userRole === 'COMPANY_STAFF') {
    if (isCancellation(toStatus)) {
      return { allowed: true, requiresApproval: true, approverRoles: ['COMPANY_ADMIN'] };
    }
    if (isForwardTransition(fromStatus, toStatus)) {
      return { allowed: true, requiresApproval: false, approverRoles: [] };
    }
    if (isBackwardTransition(fromStatus, toStatus)) {
      return { allowed: true, requiresApproval: true, approverRoles: ['COMPANY_ADMIN'] };
    }
    return { allowed: false, requiresApproval: false, approverRoles: [] };
  }

  // CUSTOMER platform role without companyRole - can only view
  if (userRole === 'CUSTOMER') {
    return { allowed: false, requiresApproval: false, approverRoles: [] };
  }

  return { allowed: false, requiresApproval: false, approverRoles: [] };
}

export function getAllowedNextStatuses(
  userRole: UserRole,
  currentStatus: OrderStatus,
  platformRole: PlatformRole = 'COMPANY_STAFF'
): OrderStatus[] {
  return STATUS_ORDER.filter((status) => {
    const rule = getTransitionRule(userRole, currentStatus, status, platformRole);
    return rule.allowed && !rule.requiresApproval;
  });
}

export function getAllowedNextStatusesWithApproval(
  userRole: UserRole,
  currentStatus: OrderStatus,
  platformRole: PlatformRole = 'COMPANY_STAFF'
): { status: OrderStatus; requiresApproval: boolean; approverRoles: CompanyRole[] }[] {
  const result: { status: OrderStatus; requiresApproval: boolean; approverRoles: CompanyRole[] }[] =
    [];

  for (const status of STATUS_ORDER) {
    const rule = getTransitionRule(userRole, currentStatus, status, platformRole);
    if (rule.allowed) {
      result.push({
        status,
        requiresApproval: rule.requiresApproval,
        approverRoles: rule.approverRoles,
      });
    }
  }

  // Add cancellation if allowed
  const cancelRule = getTransitionRule(userRole, currentStatus, 'CANCELLED', platformRole);
  if (cancelRule.allowed) {
    result.push({
      status: 'CANCELLED',
      requiresApproval: cancelRule.requiresApproval,
      approverRoles: cancelRule.approverRoles,
    });
  }

  return result;
}
