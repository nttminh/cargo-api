import { DynamicModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import * as Joi from 'joi';
import configuration from './configuration';
import { envSchema } from './env.validation';
import { envFiles } from './load-env';

/** Global, validated configuration for one service. */
export const configModule = (
  app: string,
  ...schemas: Record<string, Joi.Schema>[]
): Promise<DynamicModule> =>
  ConfigModule.forRoot({
    isGlobal: true,
    cache: true,
    envFilePath: envFiles(app),
    load: [configuration],
    validationSchema: envSchema(...schemas),
    validationOptions: { abortEarly: false, allowUnknown: true },
  });
