/**
 * Idempotent seed of the initial admin user.
 *   dev:  npm run seed:identity
 *   prod: node dist/apps/identity/apps/identity/src/database/seed.js   (Kubernetes Job)
 */
import { runScript, UserRole } from '@cargo/common';
import dataSource from './data-source';
import { User } from '../users/user.entity';
import { UsersService } from '../users/users.service';

const KNOWN_DEV_PASSWORDS = ['DevAdmin123!', 'ChangeMe123!'];

async function seed() {
  const email = (process.env.SEED_ADMIN_EMAIL ?? 'admin@cargo.local').toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (!password) throw new Error('SEED_ADMIN_PASSWORD is required');
  // Passwords committed to this repo (.env.example, docker-compose, dev overlay) must never
  // reach a real environment. Local stacks run NODE_ENV=production too, so they opt in
  // explicitly with SEED_ALLOW_DEV_PASSWORD=true; production config never sets it.
  const isKnownDevPassword = KNOWN_DEV_PASSWORDS.includes(password);
  const allowDevPassword = process.env.SEED_ALLOW_DEV_PASSWORD === 'true';
  if (process.env.NODE_ENV === 'production' && isKnownDevPassword && !allowDevPassword) {
    throw new Error(
      'Refusing to seed a committed dev admin password in production. ' +
        'Set a unique SEED_ADMIN_PASSWORD (or SEED_ALLOW_DEV_PASSWORD=true for local stacks only).',
    );
  }

  await dataSource.initialize();
  try {
    const users = dataSource.getRepository(User);
    if (await users.exists({ where: { email } })) {
      console.log(`Admin user ${email} already exists`);
      return;
    }
    await users.save(
      users.create({
        email,
        fullName: 'System Administrator',
        role: UserRole.ADMIN,
        customerId: null,
        passwordHash: await UsersService.hashPassword(password),
      }),
    );
    console.log(`Created admin user ${email}`);
  } finally {
    await dataSource.destroy();
  }
}

runScript('Seed', seed);
