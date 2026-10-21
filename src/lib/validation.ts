/**
 * Request-body validation for the order pipeline.
 *
 * The pricing engine is pure and trusts its caller, so every numeric input
 * that reaches it must be checked here first. A negative quantity or a
 * dimension outside the template bounds produces a wrong order total, and the
 * order is snapshotted — the wrong price is then permanent.
 */

export const MAX_ITEMS_PER_ORDER = 100;
export const MAX_QUANTITY_PER_ITEM = 10000;
export const MAX_DIMENSION_MM = 20000;
export const MAX_LENGTH_M = 1000;

export class ValidationError extends Error {
  constructor(
    message: string,
    readonly field?: string
  ) {
    super(message);
    this.name = 'ValidationError';
  }
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function requireInteger(value: unknown, field: string, min: number, max: number): number {
  if (!isFiniteNumber(value)) {
    throw new ValidationError(`${field} must be a number`, field);
  }
  if (!Number.isInteger(value)) {
    throw new ValidationError(`${field} must be an integer`, field);
  }
  if (value < min || value > max) {
    throw new ValidationError(`${field} must be between ${min} and ${max}`, field);
  }
  return value;
}

function requirePositiveNumber(value: unknown, field: string, max: number): number {
  if (!isFiniteNumber(value)) {
    throw new ValidationError(`${field} must be a number`, field);
  }
  if (value <= 0) {
    throw new ValidationError(`${field} must be greater than zero`, field);
  }
  if (value > max) {
    throw new ValidationError(`${field} must be at most ${max}`, field);
  }
  return value;
}

export const PRODUCT_KINDS = [
  'GLASS_ONLY',
  'RAW_PROFILE',
  'FINISHED_WINDOW',
  'FINISHED_DOOR',
  'HARDWARE',
] as const;
export type ProductKind = (typeof PRODUCT_KINDS)[number];

const DIMENSION_KINDS: ProductKind[] = ['GLASS_ONLY', 'FINISHED_WINDOW', 'FINISHED_DOOR'];

export interface ValidatedGlassPane {
  glassTypeId: string;
  thicknessMm: number;
}

export interface ValidatedHardware {
  hardwareId: string;
  quantity: number;
}

export interface ValidatedOrderItem {
  kind: ProductKind;
  templateId: string | null;
  widthMm: number | null;
  heightMm: number | null;
  lengthM: number | null;
  quantity: number;
  profileId: string | null;
  profileColor: string | null;
  glazingLayers: 'SINGLE' | 'DOUBLE' | 'TRIPLE';
  airGapMm: number;
  gasFill: string;
  glassPanes: ValidatedGlassPane[];
  hardware: ValidatedHardware[];
  processingIds: string[];
}

export interface ValidatedOrderBody {
  items: ValidatedOrderItem[];
  shippingAddress: string | null;
  customerNotes: string | null;
  requestedDate: Date | null;
}

const GLAZING_LAYERS = ['SINGLE', 'DOUBLE', 'TRIPLE'] as const;
const MAX_TEXT_LENGTH = 2000;

function optionalString(value: unknown, field: string): string | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string') {
    throw new ValidationError(`${field} must be a string`, field);
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  if (trimmed.length > MAX_TEXT_LENGTH) {
    throw new ValidationError(`${field} is too long`, field);
  }
  return trimmed;
}

function optionalId(value: unknown, field: string): string | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || value.length > 100) {
    throw new ValidationError(`${field} must be an id string`, field);
  }
  return value;
}

/**
 * Validate one order item. `template` bounds are applied by the caller because
 * the template row must be read from the database first.
 */
export function validateOrderItem(raw: unknown, index: number): ValidatedOrderItem {
  const at = `items[${index}]`;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new ValidationError(`${at} must be an object`);
  }
  const item = raw as Record<string, unknown>;

  if (!PRODUCT_KINDS.includes(item.kind as ProductKind)) {
    throw new ValidationError(`${at}.kind is not a valid product kind`, `${at}.kind`);
  }
  const kind = item.kind as ProductKind;

  const quantity = requireInteger(item.quantity ?? 1, `${at}.quantity`, 1, MAX_QUANTITY_PER_ITEM);

  let widthMm: number | null = null;
  let heightMm: number | null = null;
  let lengthM: number | null = null;

  if (DIMENSION_KINDS.includes(kind)) {
    widthMm = requireInteger(item.widthMm, `${at}.widthMm`, 1, MAX_DIMENSION_MM);
    heightMm = requireInteger(item.heightMm, `${at}.heightMm`, 1, MAX_DIMENSION_MM);
  } else if (kind === 'RAW_PROFILE') {
    lengthM = requirePositiveNumber(item.lengthM, `${at}.lengthM`, MAX_LENGTH_M);
  }

  // A finished unit without a profile is priced as glass + hardware only,
  // because the pricing engine skips the frame when no profile resolves.
  if (kind === 'FINISHED_WINDOW' || kind === 'FINISHED_DOOR') {
    const profileId = optionalId(item.profileId, `${at}.profileId`);
    if (!profileId) {
      throw new ValidationError(`${at}.profileId is required for ${kind}`, `${at}.profileId`);
    }
  }

  const templateId = optionalId(item.templateId, `${at}.templateId`);

  const rawLayers = item.glazingLayers ?? 'DOUBLE';
  if (!GLAZING_LAYERS.includes(rawLayers as (typeof GLAZING_LAYERS)[number])) {
    throw new ValidationError(`${at}.glazingLayers is not valid`, `${at}.glazingLayers`);
  }
  const glazingLayers = rawLayers as (typeof GLAZING_LAYERS)[number];

  const glassPanes: ValidatedGlassPane[] = [];
  if (item.glassPanes !== undefined && item.glassPanes !== null) {
    if (!Array.isArray(item.glassPanes)) {
      throw new ValidationError(`${at}.glassPanes must be an array`, `${at}.glassPanes`);
    }
    if (item.glassPanes.length > 10) {
      throw new ValidationError(`${at}.glassPanes has too many entries`, `${at}.glassPanes`);
    }
    for (const [paneIndex, rawPane] of item.glassPanes.entries()) {
      if (!rawPane || typeof rawPane !== 'object') {
        throw new ValidationError(`${at}.glassPanes[${paneIndex}] must be an object`);
      }
      const pane = rawPane as Record<string, unknown>;
      const glassTypeId = optionalId(
        pane.glassTypeId,
        `${at}.glassPanes[${paneIndex}].glassTypeId`
      );
      if (!glassTypeId) {
        throw new ValidationError(
          `${at}.glassPanes[${paneIndex}].glassTypeId is required`,
          `${at}.glassPanes[${paneIndex}].glassTypeId`
        );
      }
      glassPanes.push({
        glassTypeId,
        thicknessMm: requireInteger(
          pane.thicknessMm,
          `${at}.glassPanes[${paneIndex}].thicknessMm`,
          1,
          100
        ),
      });
    }
  }

  // The layer count and the pane count must agree, otherwise the stored
  // `glazingLayers` contradicts the priced panes.
  if (DIMENSION_KINDS.includes(kind) && glassPanes.length > 0) {
    const expected = glazingLayers === 'SINGLE' ? 1 : glazingLayers === 'DOUBLE' ? 2 : 3;
    if (glassPanes.length !== expected) {
      throw new ValidationError(
        `${at}.glassPanes has ${glassPanes.length} entries but ${glazingLayers} needs ${expected}`,
        `${at}.glassPanes`
      );
    }
  }

  const hardware: ValidatedHardware[] = [];
  if (item.hardware !== undefined && item.hardware !== null) {
    if (!Array.isArray(item.hardware)) {
      throw new ValidationError(`${at}.hardware must be an array`, `${at}.hardware`);
    }
    if (item.hardware.length > 50) {
      throw new ValidationError(`${at}.hardware has too many entries`, `${at}.hardware`);
    }
    for (const [hwIndex, rawHw] of item.hardware.entries()) {
      if (!rawHw || typeof rawHw !== 'object') {
        throw new ValidationError(`${at}.hardware[${hwIndex}] must be an object`);
      }
      const hw = rawHw as Record<string, unknown>;
      const hardwareId = optionalId(hw.hardwareId, `${at}.hardware[${hwIndex}].hardwareId`);
      if (!hardwareId) {
        throw new ValidationError(
          `${at}.hardware[${hwIndex}].hardwareId is required`,
          `${at}.hardware[${hwIndex}].hardwareId`
        );
      }
      hardware.push({
        hardwareId,
        quantity: requireInteger(
          hw.quantity ?? 1,
          `${at}.hardware[${hwIndex}].quantity`,
          1,
          MAX_QUANTITY_PER_ITEM
        ),
      });
    }
  }

  const processingIds: string[] = [];
  if (item.processingIds !== undefined && item.processingIds !== null) {
    if (!Array.isArray(item.processingIds)) {
      throw new ValidationError(`${at}.processingIds must be an array`, `${at}.processingIds`);
    }
    if (item.processingIds.length > 20) {
      throw new ValidationError(`${at}.processingIds has too many entries`, `${at}.processingIds`);
    }
    for (const [pidIndex, rawPid] of item.processingIds.entries()) {
      const pid = optionalId(rawPid, `${at}.processingIds[${pidIndex}]`);
      if (!pid) {
        throw new ValidationError(
          `${at}.processingIds[${pidIndex}] must be an id string`,
          `${at}.processingIds[${pidIndex}]`
        );
      }
      if (!processingIds.includes(pid)) processingIds.push(pid);
    }
  }

  const airGapMm = requireInteger(item.airGapMm ?? 16, `${at}.airGapMm`, 0, 100);
  const gasFill = optionalString(item.gasFill, `${at}.gasFill`) ?? 'air';

  return {
    kind,
    templateId,
    widthMm,
    heightMm,
    lengthM,
    quantity,
    profileId: optionalId(item.profileId, `${at}.profileId`),
    profileColor: optionalString(item.profileColor, `${at}.profileColor`),
    glazingLayers,
    airGapMm,
    gasFill,
    glassPanes,
    hardware,
    processingIds,
  };
}

/** Validate the whole `POST /api/orders` body. */
export function validateOrderBody(body: unknown): ValidatedOrderBody {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new ValidationError('Request body must be an object');
  }
  const raw = body as Record<string, unknown>;

  if (!Array.isArray(raw.items)) {
    throw new ValidationError('items must be an array', 'items');
  }
  if (raw.items.length === 0) {
    throw new ValidationError('items must not be empty', 'items');
  }
  if (raw.items.length > MAX_ITEMS_PER_ORDER) {
    throw new ValidationError(`items must contain at most ${MAX_ITEMS_PER_ORDER} entries`, 'items');
  }

  const items = raw.items.map((item, index) => validateOrderItem(item, index));

  let requestedDate: Date | null = null;
  if (raw.requestedDate) {
    const parsed = new Date(raw.requestedDate as string);
    if (Number.isNaN(parsed.getTime())) {
      throw new ValidationError('requestedDate is not a valid date', 'requestedDate');
    }
    requestedDate = parsed;
  }

  return {
    items,
    shippingAddress: optionalString(raw.shippingAddress, 'shippingAddress'),
    customerNotes: optionalString(raw.customerNotes, 'customerNotes'),
    requestedDate,
  };
}
