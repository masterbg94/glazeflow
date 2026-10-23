import type { Prisma } from '@prisma/client';
import { prisma } from './prisma';

/** Who made the change. The session user and the Prisma user both fit. */
export interface AuditActor {
  id: string;
  email?: string | null;
  platformRole?: string | null;
}

/**
 * Audit trail.
 *
 * Every state change writes one row: who did it, on what, with what payload.
 * Without it there is no way to prove that a record was not changed, because
 * the application code is the only thing standing between a request and the
 * database.
 */
export interface AuditInput {
  /** What happened, e.g. `order.status.change`. */
  action: string;
  /** The kind of record, e.g. `Order`. */
  entity: string;
  /** The id of the changed record. */
  entityId?: string | null;
  /** The actor. Null for a failed login, where the identity is not proven. */
  actor?: AuditActor | null;
  /** Extra context: old and new values, the request address. */
  metadata?: unknown;
  ip?: string | null;
}

/**
 * Write one audit row. A failure here must never fail the request that was
 * being audited, so every error is swallowed and logged.
 */
export async function recordAudit(input: AuditInput): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        action: input.action,
        entity: input.entity,
        entityId: input.entityId ?? null,
        actorId: input.actor?.id ?? null,
        actorEmail: input.actor?.email ?? null,
        actorRole: input.actor?.platformRole ?? null,
        ip: input.ip ?? null,
        metadata: (input.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
      },
    });
  } catch (err) {
    console.error('[audit] failed to write audit row', err);
  }
}

/** Audit helper for a change made by the signed-in user. */
export async function auditFromSession(
  user: AuditActor | null | undefined,
  input: Omit<AuditInput, 'actor'>
): Promise<void> {
  await recordAudit({ ...input, actor: user ?? null });
}
