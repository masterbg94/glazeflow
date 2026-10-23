import bcrypt from 'bcryptjs';

/**
 * Password policy and hashing.
 *
 * Rules are enforced on every path that creates a password: the tenant-user
 * registration route and the company-user creation route. bcrypt cost is 12
 * everywhere — the seed used 10, which is below the current recommendation.
 */
export const MIN_PASSWORD_LENGTH = 12;

/**
 * bcrypt only reads the first 72 bytes of a password. A longer password is
 * silently truncated, so two different passwords that share the first 72 bytes
 * are interchangeable. Reject instead of pretending the extra length counts.
 */
export const MAX_PASSWORD_LENGTH = 72;

export const BCRYPT_ROUNDS = 12;

/** Passwords that are in every credential-stuffing list. */
const COMMON_PASSWORDS = [
  'password',
  'password123',
  'password123!',
  'passw0rd',
  '123456789012',
  '1234567890123',
  'qwertyuiop12',
  'qwerty123456',
  'letmein12345',
  'welcome12345',
  'iloveyou1234',
  'admin123456',
  'administrator',
  'changeme123',
  'glazeflow',
  'glazeflow123',
];

export interface PasswordPolicyResult {
  ok: boolean;
  errors: string[];
}

export interface PasswordContext {
  /** The account's email — the password must not contain any part of it. */
  email?: string | null;
  name?: string | null;
}

/**
 * Validate a password against the policy. Returns every failure so the caller
 * can show all of them at once.
 */
export function checkPasswordPolicy(
  password: string,
  context: PasswordContext = {}
): PasswordPolicyResult {
  const errors: string[] = [];

  if (typeof password !== 'string' || password.length === 0) {
    return { ok: false, errors: ['Password is required'] };
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    errors.push(`Password must be at least ${MIN_PASSWORD_LENGTH} characters long`);
  }
  if (password.length > MAX_PASSWORD_LENGTH) {
    errors.push(`Password must be at most ${MAX_PASSWORD_LENGTH} characters long`);
  }
  if (!/[a-z]/.test(password)) errors.push('Password must contain a lowercase letter');
  if (!/[A-Z]/.test(password)) errors.push('Password must contain an uppercase letter');
  if (!/[0-9]/.test(password)) errors.push('Password must contain a digit');
  if (!/[^A-Za-z0-9]/.test(password)) errors.push('Password must contain a symbol');

  const lower = password.toLowerCase();
  if (COMMON_PASSWORDS.some((common) => lower === common || lower.includes(common))) {
    errors.push('Password is too common');
  }

  const email = context.email?.toLowerCase() ?? '';
  if (email) {
    const localPart = email.split('@')[0];
    // A password made of the account's own name is not a secret.
    for (const part of [localPart, localPart.split(/[._-]/)[0]]) {
      if (part && part.length >= 4 && lower.includes(part)) {
        errors.push('Password must not contain the account name or email');
        break;
      }
    }
  }

  const name = context.name?.toLowerCase() ?? '';
  if (name && name.length >= 4 && lower.includes(name)) {
    errors.push('Password must not contain the account name');
  }

  return { ok: errors.length === 0, errors };
}

/** Hash a password with the policy cost factor. */
export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

/** Compare a password against a stored hash. */
export function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}
