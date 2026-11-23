import './common/time/force-utc';
import { ClassSerializerInterceptor, RequestMethod, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory, Reflector } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Logger } from 'nestjs-pino';
import helmet from 'helmet';
import compression from 'compression';
import { AppModule } from './app.module';
import { setupApiDocs } from './docs/api-docs';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true });
  const config = app.get(ConfigService);
  const logger = app.get(Logger);
  app.useLogger(logger);

  // Behind an ingress / load balancer: trust X-Forwarded-* so req.ip and rate limiting work.
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  // Set before the OpenAPI document is generated so its paths include the prefix.
  const prefix = config.get<string>('apiPrefix', 'api/v1');
  app.setGlobalPrefix(prefix, {
    exclude: [
      { path: 'health/live', method: RequestMethod.GET },
      { path: 'health/ready', method: RequestMethod.GET },
    ],
  });

  app.use(compression());
  // Registered before helmet(): the docs page sets its own CSP for the Scalar bundle.
  if (config.get<boolean>('apiDocsEnabled')) setupApiDocs(app, prefix);
  app.use(helmet());
  const origins = config.get<string[]>('corsOrigins', []);
  app.enableCors({
    origin: origins.length ? origins : false,
    credentials: true,
    exposedHeaders: ['x-request-id'],
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
    }),
  );
  app.useGlobalInterceptors(new ClassSerializerInterceptor(app.get(Reflector)));

  // SIGTERM from Kubernetes -> stop accepting connections, close DB pool, exit.
  app.enableShutdownHooks();

  const port = config.get<number>('port', 3000);
  await app.listen(port, '0.0.0.0');
  logger.log(`Cargo API listening on :${port}/${prefix}`, 'Bootstrap');
}

bootstrap();
