/** Applies pending migrations to the master-data database (Kubernetes initContainer). */
import { runMigrationsLocked, runScript } from '@cargo/common';
import dataSource from './data-source';

runScript('Migration', () => runMigrationsLocked(dataSource, 7_265_311));
