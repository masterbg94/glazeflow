import { describe, expect, it } from 'vitest';
import {
  BCRYPT_ROUNDS,
  checkPasswordPolicy,
  hashPassword,
  MAX_PASSWORD_LENGTH,
  MIN_PASSWORD_LENGTH,
  verifyPassword,
} from './password-policy';

describe('checkPasswordPolicy', () => {
  it('accepts a strong password', () => {
    const result = checkPasswordPolicy('Gzf!Dobav#2026Kr4pN8');
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('rejects a password that is too short', () => {
    const result = checkPasswordPolicy('Ab1!xyz');
    expect(result.ok).toBe(false);
    expect(result.errors.join(' ')).toContain(String(MIN_PASSWORD_LENGTH));
  });

  it('rejects a password longer than bcrypt reads', () => {
    const result = checkPasswordPolicy('Aa1!' + 'x'.repeat(MAX_PASSWORD_LENGTH));
    expect(result.ok).toBe(false);
    expect(result.errors.join(' ')).toContain(String(MAX_PASSWORD_LENGTH));
  });

  it('requires every character class', () => {
    const result = checkPasswordPolicy('alllowercase123');
    expect(result.ok).toBe(false);
    const errors = result.errors.join(' ');
    expect(errors).toContain('uppercase');
    expect(errors).toContain('symbol');
  });

  it('rejects the old seed password', () => {
    expect(checkPasswordPolicy('Password123!').ok).toBe(false);
  });

  it('rejects a password built from the account name', () => {
    const result = checkPasswordPolicy('Gzf!Radnik#2026Yc2rL5', { email: 'radnik@acme.test' });
    expect(result.ok).toBe(false);
    expect(result.errors.join(' ')).toContain('account name');
  });

  it('rejects a password built from the account email', () => {
    const result = checkPasswordPolicy('Kupac#2026!Strong', { email: 'kupac@customers.test' });
    expect(result.ok).toBe(false);
  });
});

describe('hashPassword / verifyPassword', () => {
  it('hashes with cost 12 and verifies the right password only', async () => {
    const hash = await hashPassword('Gzf!Dobav#2026Kr4pN8');
    expect(hash).toMatch(/^\$2[aby]\$12\$/);
    expect(await verifyPassword('Gzf!Dobav#2026Kr4pN8', hash)).toBe(true);
    expect(await verifyPassword('wrong-password', hash)).toBe(false);
    expect(BCRYPT_ROUNDS).toBe(12);
  });
});
