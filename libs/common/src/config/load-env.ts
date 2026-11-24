import { config as loadDotenv } from 'dotenv';
import { join } from 'path';

/**
 * Loads apps/<app>/.env, then the root .env, for scripts that run outside Nest (TypeORM CLI,
 * seeds, migrations). Real environment variables always win, and the app file wins over the
 * root file. No-op in containers, where there are no .env files.
 */
export function loadEnv(app: string): void {
  loadDotenv({ path: join(process.cwd(), 'apps', app, '.env'), quiet: true });
  loadDotenv({ path: join(process.cwd(), '.env'), quiet: true });
}

/** envFilePath for ConfigModule: same precedence as loadEnv(). */
export const envFiles = (app: string) => [join('apps', app, '.env'), '.env'];
