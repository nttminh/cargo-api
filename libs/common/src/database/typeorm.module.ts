import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { buildDataSourceOptions, ServiceDataSourceOptions } from './data-source';

export const typeOrmModule = (o: ServiceDataSourceOptions) =>
  TypeOrmModule.forRootAsync({
    inject: [ConfigService],
    useFactory: (config: ConfigService) => ({
      ...buildDataSourceOptions(o),
      migrationsRun: config.get<boolean>('database.runMigrations'),
      retryAttempts: 10,
      retryDelay: 3000,
    }),
  });
