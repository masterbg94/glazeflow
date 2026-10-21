import { describe, expect, it } from 'vitest';
import {
  MAX_DIMENSION_MM,
  MAX_QUANTITY_PER_ITEM,
  validateOrderBody,
  validateOrderItem,
  ValidationError,
} from './validation';

const validWindow = {
  kind: 'FINISHED_WINDOW',
  widthMm: 1200,
  heightMm: 1500,
  quantity: 2,
  profileId: 'p1',
  templateId: 't1',
  glazingLayers: 'DOUBLE',
  glassPanes: [
    { glassTypeId: 'g1', thicknessMm: 4 },
    { glassTypeId: 'g1', thicknessMm: 4 },
  ],
  hardware: [{ hardwareId: 'h1', quantity: 2 }],
  processingIds: ['pr1'],
};

describe('validateOrderItem', () => {
  it('accepts a well-formed item', () => {
    const item = validateOrderItem(validWindow, 0);
    expect(item.kind).toBe('FINISHED_WINDOW');
    expect(item.quantity).toBe(2);
    expect(item.widthMm).toBe(1200);
    expect(item.glassPanes).toHaveLength(2);
  });

  it('rejects a negative quantity', () => {
    expect(() => validateOrderItem({ ...validWindow, quantity: -1 }, 0)).toThrow(ValidationError);
  });

  it('rejects a zero quantity', () => {
    expect(() => validateOrderItem({ ...validWindow, quantity: 0 }, 0)).toThrow(ValidationError);
  });

  it('rejects a fractional quantity', () => {
    expect(() => validateOrderItem({ ...validWindow, quantity: 1.5 }, 0)).toThrow(ValidationError);
  });

  it('rejects an absurd quantity', () => {
    expect(() =>
      validateOrderItem({ ...validWindow, quantity: MAX_QUANTITY_PER_ITEM + 1 }, 0)
    ).toThrow(ValidationError);
  });

  it('rejects negative dimensions', () => {
    expect(() => validateOrderItem({ ...validWindow, widthMm: -1200 }, 0)).toThrow(ValidationError);
    expect(() => validateOrderItem({ ...validWindow, heightMm: -1200 }, 0)).toThrow(
      ValidationError
    );
  });

  it('rejects zero dimensions', () => {
    expect(() => validateOrderItem({ ...validWindow, widthMm: 0 }, 0)).toThrow(ValidationError);
  });

  it('rejects a dimension beyond the hard cap', () => {
    expect(() => validateOrderItem({ ...validWindow, widthMm: MAX_DIMENSION_MM + 1 }, 0)).toThrow(
      ValidationError
    );
  });

  it('rejects a non-numeric dimension', () => {
    expect(() => validateOrderItem({ ...validWindow, widthMm: '1200' }, 0)).toThrow(
      ValidationError
    );
  });

  it('rejects a finished window without a profile', () => {
    // The pricing engine drops the frame cost when no profile resolves, so a
    // window without one was priced as glass plus hardware only.
    expect(() => validateOrderItem({ ...validWindow, profileId: null }, 0)).toThrow(
      ValidationError
    );
    expect(() => validateOrderItem({ ...validWindow, profileId: '' }, 0)).toThrow(ValidationError);
  });

  it('does not require a profile for a glass-only item', () => {
    const item = validateOrderItem(
      {
        kind: 'GLASS_ONLY',
        widthMm: 800,
        heightMm: 1200,
        quantity: 1,
        glazingLayers: 'SINGLE',
        glassPanes: [{ glassTypeId: 'g1', thicknessMm: 4 }],
      },
      0
    );
    expect(item.profileId).toBeNull();
  });

  it('rejects an unknown product kind', () => {
    expect(() => validateOrderItem({ ...validWindow, kind: 'SPACESHIP' }, 0)).toThrow(
      ValidationError
    );
  });

  it('rejects a pane count that contradicts the layer count', () => {
    expect(() =>
      validateOrderItem(
        { ...validWindow, glazingLayers: 'TRIPLE', glassPanes: validWindow.glassPanes },
        0
      )
    ).toThrow(ValidationError);
  });

  it('rejects a negative hardware quantity', () => {
    expect(() =>
      validateOrderItem({ ...validWindow, hardware: [{ hardwareId: 'h1', quantity: -3 }] }, 0)
    ).toThrow(ValidationError);
  });

  it('rejects a negative raw profile length', () => {
    expect(() => validateOrderItem({ kind: 'RAW_PROFILE', lengthM: -3, quantity: 1 }, 0)).toThrow(
      ValidationError
    );
  });

  it('rejects a non-object item', () => {
    expect(() => validateOrderItem('nope', 0)).toThrow(ValidationError);
    expect(() => validateOrderItem(null, 0)).toThrow(ValidationError);
    expect(() => validateOrderItem([], 0)).toThrow(ValidationError);
  });
});

describe('validateOrderBody', () => {
  it('accepts a well-formed body', () => {
    const body = validateOrderBody({
      items: [validWindow],
      shippingAddress: '  Adresa  ',
      customerNotes: 'Napomena',
    });
    expect(body.items).toHaveLength(1);
    expect(body.shippingAddress).toBe('Adresa');
    expect(body.customerNotes).toBe('Napomena');
  });

  it('rejects a body with no items', () => {
    expect(() => validateOrderBody({ items: [] })).toThrow(ValidationError);
  });

  it('rejects a body with no items array', () => {
    expect(() => validateOrderBody({})).toThrow(ValidationError);
    expect(() => validateOrderBody({ items: null })).toThrow(ValidationError);
  });

  it('rejects a non-object body', () => {
    expect(() => validateOrderBody('nope')).toThrow(ValidationError);
    expect(() => validateOrderBody(null)).toThrow(ValidationError);
  });

  it('rejects an invalid requested date', () => {
    expect(() => validateOrderBody({ items: [validWindow], requestedDate: 'not-a-date' })).toThrow(
      ValidationError
    );
  });

  it('accepts a valid requested date', () => {
    const body = validateOrderBody({
      items: [validWindow],
      requestedDate: '2026-03-05T10:00:00.000Z',
    });
    expect(body.requestedDate).toBeInstanceOf(Date);
  });

  it('names the offending field in the error', () => {
    try {
      validateOrderBody({ items: [{ ...validWindow, quantity: -1 }] });
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(ValidationError);
      expect((err as ValidationError).field).toContain('quantity');
    }
  });
});
