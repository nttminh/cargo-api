import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, OpenAPIObject, SwaggerModule } from '@nestjs/swagger';

/** Internal path where each service serves its own OpenAPI document. Not routed by the gateway. */
export const SERVICE_SPEC_PATH = '/openapi.json';

/**
 * Builds the service's OpenAPI document and serves it at GET /openapi.json. The gateway merges
 * the documents of all services into the public API reference.
 * Call after setGlobalPrefix so the paths include the prefix.
 */
export function serveServiceSpec(app: INestApplication, title: string): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle(title)
    .setVersion(process.env.npm_package_version ?? '1.0.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  app
    .getHttpAdapter()
    .get(SERVICE_SPEC_PATH, (_req: unknown, res: { json(b: unknown): void }) => res.json(document));
  return document;
}
