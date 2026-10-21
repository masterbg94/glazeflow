// Status transition rules for role-based access control
//
// This module is the single source of truth for the transition matrix. It is
// imported by both the server routes and the Kanban client, so the two cannot
// drift apart. Do not copy these rules into a component.

export const STATUS_ORDER: OrderStatus[] = [
  'NEW',
  'QUOTE_AMENDMENT',
  'CONFIRMED',
  'IN_PRODUCTION',
  'READY',
  'DELIVERED',
  'CLOSED',
  'CANCELLED',
];

/** The pipeline, without CANCELLED. A forward move is a step along this list. */
export const PIPELINE_ORDER: OrderStatus[] = [
  'NEW',
  'QUOTE_AMENDMENT',
  'CONFIRMED',
  'IN_PRODUCTION',
  'READY',
  'DELIVERED',
  'CLOSED',
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

export type CompanyRole = 'COMPANY_ADMIN' | 'COMPANY_SALES' | 'COMPANY_PRODUCTION';
export type PlatformRole = 'SUPER_ADMIN' | 'COMPANY_ADMIN' | 'COMPANY_STAFF' | 'CUSTOMER';

export type UserRole = CompanyRole | 'SUPER_ADMIN' | 'COMPANY_STAFF' | 'CUSTOMER';

export interface TransitionRule {
  allowed: boolean;
  requiresApproval: boolean;
  approverRoles: CompanyRole[];
}

export const ALL_ORDER_STATUSES: OrderStatus[] = [
  'NEW',
  'QUOTE_AMENDMENT',
  'CONFIRMED',
  'IN_PRODUCTION',
  'READY',
  'DELIVERED',
  'CLOSED',
  'CANCELLED',
];

/** Guard against an arbitrary string reaching `Order.status`. */
export function isOrderStatus(value: unknown): value is OrderStatus {
  return typeof value === 'string' && (ALL_ORDER_STATUSES as string[]).includes(value);
}

function getStatusIndex(status: OrderStatus): number {
  return PIPELINE_ORDER.indexOf(status);
}

function isForwardTransition(fromStatus: OrderStatus, toStatus: OrderStatus): boolean {
  const fromIdx = getStatusIndex(fromStatus);
  const toIdx = getStatusIndex(toStatus);
  return fromIdx !== -1 && toIdx !== -1 && toIdx > fromIdx;
}

function isBackwardTransition(fromStatus: OrderStatus, toStatus: OrderStatus): boolean {
  const fromIdx = getStatusIndex(fromStatus);
  const toIdx = getStatusIndex(toStatus);
  return fromIdx !== -1 && toIdx !== -1 && toIdx < fromIdx;
}

/**
 * The next stage along the pipeline. A forward move may only skip stages that
 * are explicitly allowed to be skipped — otherwise a `NEW` order could jump
 * straight to `CLOSED` and skip production entirely.
 */
const ALLOWED_FORWARD_SKIPS: OrderStatus[][] = [
  // From NEW, a supplier may cancel or confirm, but not jump to DELIVERED.
  ['NEW', 'CONFIRMED'],
  // A confirmed order may be cancelled at any point before delivery.
  ['CONFIRMED', 'IN_PRODUCTION'],
  ['IN_PRODUCTION', 'READY'],
];

function isAllowedForwardStep(fromStatus: OrderStatus, toStatus: OrderStatus): boolean {
  const fromIdx = PIPELINE_ORDER.indexOf(fromStatus);
  const toIdx = PIPELINE_ORDER.indexOf(toStatus);
  if (fromIdx === -1 || toIdx === -1) return false;
  if (toIdx === fromIdx + 1) return true;
  return ALLOWED_FORWARD_SKIPS.some((pair) => pair[0] === fromStatus && pair[1] === toStatus);
}

function isCancellation(status: OrderStatus): boolean {
  return status === 'CANCELLED';
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
  if (!isOrderStatus(toStatus) || !isOrderStatus(fromStatus)) {
    return { allowed: false, requiresApproval: false, approverRoles: [] };
  }

  // Super admin can do anything
  if (userRole === 'SUPER_ADMIN' || platformRole === 'SUPER_ADMIN') {
    return { allowed: true, requiresApproval: false, approverRoles: [] };
  }

  // Company admin (main company) can do anything. Note this checks
  // `platformRole` only: the caller must not merge the two role dimensions.
  if (userRole === 'COMPANY_ADMIN' && platformRole === 'COMPANY_ADMIN') {
    return { allowed: true, requiresApproval: false, approverRoles: [] };
  }

  const approverRoles = getApproverRoles(userRole, platformRole);

  // Tenant customer users: no pipeline transitions.
  // Only allowed: cancel own order while still NEW (direct, no approval).
  if (platformRole === 'CUSTOMER') {
    if (isCancellation(toStatus) && fromStatus === 'NEW') {
      return { allowed: true, requiresApproval: false, approverRoles: [] };
    }
    return { allowed: false, requiresApproval: false, approverRoles: [] };
  }

  // Company staff (main company) - can move forward freely, backward/cancellation needs admin approval
  if (platformRole === 'COMPANY_STAFF') {
    if (isCancellation(toStatus)) {
      return { allowed: true, requiresApproval: true, approverRoles: ['COMPANY_ADMIN'] };
    }
    if (isAllowedForwardStep(fromStatus, toStatus)) {
      return { allowed: true, requiresApproval: false, approverRoles: [] };
    }
    if (isBackwardTransition(fromStatus, toStatus)) {
      return { allowed: true, requiresApproval: true, approverRoles: ['COMPANY_ADMIN'] };
    }
    return { allowed: false, requiresApproval: false, approverRoles: [] };
  }

  // COMPANY_PRODUCTION (manager) - can move forward freely, backward/cancellation needs admin approval
  if (userRole === 'COMPANY_PRODUCTION') {
    if (isCancellation(toStatus)) {
      return { allowed: true, requiresApproval: true, approverRoles };
    }
    if (isAllowedForwardStep(fromStatus, toStatus)) {
      return { allowed: true, requiresApproval: false, approverRoles: [] };
    }
    if (isBackwardTransition(fromStatus, toStatus)) {
      return { allowed: true, requiresApproval: true, approverRoles };
    }
    return { allowed: false, requiresApproval: false, approverRoles: [] };
  }

  // COMPANY_SALES - same as production
  if (userRole === 'COMPANY_SALES') {
    if (isCancellation(toStatus)) {
      return { allowed: true, requiresApproval: true, approverRoles };
    }
    if (isAllowedForwardStep(fromStatus, toStatus)) {
      return { allowed: true, requiresApproval: false, approverRoles: [] };
    }
    if (isBackwardTransition(fromStatus, toStatus)) {
      return { allowed: true, requiresApproval: true, approverRoles };
    }
    return { allowed: false, requiresApproval: false, approverRoles: [] };
  }

  return { allowed: false, requiresApproval: false, approverRoles: [] };
}

/**
 * The effective role of the caller. The two role dimensions answer different
 * questions and must never be merged into one string: `platformRole` is the
 * access level, `companyRole` is the job. Merging them grants admin rights to
 * a `COMPANY_STAFF` user who happens to hold `companyRole: COMPANY_ADMIN`.
 */
export function effectiveUserRole(
  platformRole: PlatformRole,
  companyRole: CompanyRole | null | undefined
): UserRole {
  if (platformRole === 'CUSTOMER') return 'CUSTOMER';
  if (platformRole === 'SUPER_ADMIN') return 'SUPER_ADMIN';
  if (platformRole === 'COMPANY_ADMIN') return 'COMPANY_ADMIN';
  if (companyRole === 'COMPANY_ADMIN') return 'COMPANY_ADMIN';
  if (companyRole === 'COMPANY_PRODUCTION') return 'COMPANY_PRODUCTION';
  if (companyRole === 'COMPANY_SALES') return 'COMPANY_SALES';
  return 'COMPANY_STAFF';
}

export function getAllowedNextStatuses(
  userRole: UserRole,
  currentStatus: OrderStatus,
  platformRole: PlatformRole = 'COMPANY_STAFF'
): OrderStatus[] {
  return PIPELINE_ORDER.filter((status) => {
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

  for (const status of PIPELINE_ORDER) {
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
