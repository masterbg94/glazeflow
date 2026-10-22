import { PrismaClient } from '@prisma/client';

declare global {
  // eslint-disable-next-line no-var
  var prisma: PrismaClient | undefined;
}

export const prisma =
  global.prisma ||
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') global.prisma = prisma;

/**
 * SQLite does not enforce foreign keys unless the pragma is turned on, so a
 * deleted user or catalog row used to leave orders pointing at nothing. The
 * pragma is per connection and resets when a connection is opened, so it is
 * set on every start of the client.
 *
 * PostgreSQL enforces foreign keys on its own; nothing to do there.
 */
export const prismaReady: Promise<void> = (process.env.DATABASE_URL ?? '').startsWith('file:')
  ? prisma.$executeRawUnsafe('PRAGMA foreign_keys = ON').then(
      () => undefined,
      (err) => {
        console.error('[prisma] could not enable foreign key enforcement', err);
      }
    )
  : Promise.resolve();
