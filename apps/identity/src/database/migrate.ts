/** Applies pending migrations to the identity database (Kubernetes initContainer). */
import { runMigrationsLocked, runScript } from '@cargo/common';
import dataSource from './data-source';

runScript('Migration', () => runMigrationsLocked(dataSource, 7_265_301));
