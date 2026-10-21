import { describe, expect, it } from 'vitest';
import {
  effectiveUserRole,
  getAllowedNextStatuses,
  getAllowedNextStatusesWithApproval,
  getTransitionRule,
  isOrderStatus,
} from './status-transitions';

describe('isOrderStatus', () => {
  it('accepts every schema status', () => {
    for (const s of [
      'NEW',
      'QUOTE_AMENDMENT',
      'CONFIRMED',
      'IN_PRODUCTION',
      'READY',
      'DELIVERED',
      'CLOSED',
      'CANCELLED',
    ]) {
      expect(isOrderStatus(s)).toBe(true);
    }
  });

  it('rejects an arbitrary string', () => {
    expect(isOrderStatus('GARBAGE')).toBe(false);
    expect(isOrderStatus('new')).toBe(false);
    expect(isOrderStatus(undefined)).toBe(false);
    expect(isOrderStatus(42)).toBe(false);
  });
});

describe('getTransitionRule', () => {
  it('lets a super admin do anything without approval', () => {
    const rule = getTransitionRule('SUPER_ADMIN', 'NEW', 'CLOSED', 'SUPER_ADMIN');
    expect(rule.allowed).toBe(true);
    expect(rule.requiresApproval).toBe(false);
  });

  it('lets a main-company admin do anything without approval', () => {
    const rule = getTransitionRule('COMPANY_ADMIN', 'READY', 'NEW', 'COMPANY_ADMIN');
    expect(rule.allowed).toBe(true);
    expect(rule.requiresApproval).toBe(false);
  });

  it('requires approval for a backward move by staff', () => {
    const rule = getTransitionRule('COMPANY_STAFF', 'DELIVERED', 'CONFIRMED', 'COMPANY_STAFF');
    expect(rule.allowed).toBe(true);
    expect(rule.requiresApproval).toBe(true);
  });

  it('requires approval for a cancellation by staff', () => {
    const rule = getTransitionRule('COMPANY_STAFF', 'NEW', 'CANCELLED', 'COMPANY_STAFF');
    expect(rule.allowed).toBe(true);
    expect(rule.requiresApproval).toBe(true);
  });

  it('does not let staff skip the pipeline', () => {
    // NEW -> CLOSED used to be allowed: the rule was "any later index is forward".
    const rule = getTransitionRule('COMPANY_STAFF', 'NEW', 'CLOSED', 'COMPANY_STAFF');
    expect(rule.allowed).toBe(false);
  });

  it('does not let staff skip from NEW to DELIVERED', () => {
    const rule = getTransitionRule('COMPANY_STAFF', 'NEW', 'DELIVERED', 'COMPANY_STAFF');
    expect(rule.allowed).toBe(false);
  });

  it('allows the next stage', () => {
    const rule = getTransitionRule('COMPANY_STAFF', 'NEW', 'QUOTE_AMENDMENT', 'COMPANY_STAFF');
    expect(rule.allowed).toBe(true);
    expect(rule.requiresApproval).toBe(false);
  });

  it('lets a tenant cancel its own NEW order directly', () => {
    const rule = getTransitionRule('CUSTOMER', 'NEW', 'CANCELLED', 'CUSTOMER');
    expect(rule.allowed).toBe(true);
    expect(rule.requiresApproval).toBe(false);
  });

  it('does not let a tenant move an order forward', () => {
    const rule = getTransitionRule('CUSTOMER', 'NEW', 'CONFIRMED', 'CUSTOMER');
    expect(rule.allowed).toBe(false);
  });

  it('does not let a tenant cancel after the order left NEW', () => {
    const rule = getTransitionRule('CUSTOMER', 'CONFIRMED', 'CANCELLED', 'CUSTOMER');
    expect(rule.allowed).toBe(false);
  });

  it('rejects an unknown status', () => {
    const rule = getTransitionRule('COMPANY_ADMIN', 'NEW', 'GARBAGE' as never, 'COMPANY_ADMIN');
    expect(rule.allowed).toBe(false);
  });

  it('does not treat a company admin as omnipotent through the platform role alone', () => {
    // A COMPANY_STAFF who holds companyRole COMPANY_ADMIN is a staff member
    // for the pipeline, not an administrator.
    const rule = getTransitionRule('COMPANY_STAFF', 'NEW', 'CLOSED', 'COMPANY_STAFF');
    expect(rule.allowed).toBe(false);
  });
});

describe('effectiveUserRole', () => {
  it('keeps the platform role for a customer', () => {
    expect(effectiveUserRole('CUSTOMER', 'COMPANY_ADMIN')).toBe('CUSTOMER');
  });

  it('keeps the platform role for a super admin', () => {
    expect(effectiveUserRole('SUPER_ADMIN', 'COMPANY_ADMIN')).toBe('SUPER_ADMIN');
  });

  it('uses the platform role for a company admin', () => {
    expect(effectiveUserRole('COMPANY_ADMIN', 'COMPANY_SALES')).toBe('COMPANY_ADMIN');
  });

  it('falls back to the company role for staff', () => {
    expect(effectiveUserRole('COMPANY_STAFF', 'COMPANY_PRODUCTION')).toBe('COMPANY_PRODUCTION');
    expect(effectiveUserRole('COMPANY_STAFF', 'COMPANY_SALES')).toBe('COMPANY_SALES');
  });

  it('defaults to staff with no company role', () => {
    expect(effectiveUserRole('COMPANY_STAFF', null)).toBe('COMPANY_STAFF');
  });
});

describe('getAllowedNextStatuses', () => {
  it('lists only the next stage for staff', () => {
    const next = getAllowedNextStatuses('COMPANY_STAFF', 'NEW', 'COMPANY_STAFF');
    expect(next).toContain('QUOTE_AMENDMENT');
    expect(next).not.toContain('CLOSED');
  });

  it('offers nothing to a tenant beyond cancel', () => {
    const next = getAllowedNextStatuses('CUSTOMER', 'NEW', 'CUSTOMER');
    expect(next).toEqual([]);
  });
});

describe('getAllowedNextStatusesWithApproval', () => {
  it('marks the backward moves that need approval', () => {
    const options = getAllowedNextStatusesWithApproval(
      'COMPANY_STAFF',
      'DELIVERED',
      'COMPANY_STAFF'
    );
    const backward = options.find((o) => o.status === 'CONFIRMED');
    expect(backward?.requiresApproval).toBe(true);
  });

  it('includes the cancellation option for staff', () => {
    const options = getAllowedNextStatusesWithApproval('COMPANY_STAFF', 'NEW', 'COMPANY_STAFF');
    const cancel = options.find((o) => o.status === 'CANCELLED');
    expect(cancel).toBeDefined();
    expect(cancel?.requiresApproval).toBe(true);
  });
});
