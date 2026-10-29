import { ClassSerializerInterceptor, RequestMethod, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory, Reflector } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Logger } from 'nestjs-pino';
import helmet from 'helmet';
import compression from 'compression';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true });
  const config = app.get(ConfigService);
  const logger = app.get(Logger);
  app.useLogger(logger);

  // Behind an ingress / load balancer: trust X-Forwarded-* so req.ip and rate limiting work.
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(helmet());
  app.use(compression());
  const origins = config.get<string[]>('corsOrigins', []);
  app.enableCors({
    origin: origins.length ? origins : false,
    credentials: true,
    exposedHeaders: ['x-request-id'],
  });

  const prefix = config.get<string>('apiPrefix', 'api/v1');
  app.setGlobalPrefix(prefix, {
    exclude: [
      { path: 'health/live', method: RequestMethod.GET },
      { path: 'health/ready', method: RequestMethod.GET },
    ],
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

  if (config.get<boolean>('swaggerEnabled')) {
    const doc = new DocumentBuilder()
      .setTitle('Cargo API')
      .setDescription(
        'Air & sea freight forwarding API: customers, airports/seaports, carriers, shipments, containers and tracking.',
      )
      .setVersion(process.env.npm_package_version ?? '1.0.0')
      .addBearerAuth()
      .build();
    SwaggerModule.setup(`${prefix}/docs`, app, SwaggerModule.createDocument(app, doc), {
      jsonDocumentUrl: `${prefix}/docs-json`,
    });
  }

  // SIGTERM from Kubernetes -> stop accepting connections, close DB pool, exit.
  app.enableShutdownHooks();

  const port = config.get<number>('port', 3000);
  await app.listen(port, '0.0.0.0');
  logger.log(`Cargo API listening on :${port}/${prefix}`, 'Bootstrap');
}

bootstrap();
