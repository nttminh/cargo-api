import { randomBytes } from 'node:crypto';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestExpressApplication } from '@nestjs/platform-express';
import type { OpenAPIObject } from '@nestjs/swagger';
import { apiReference, NestJSReferenceConfiguration } from '@scalar/nestjs-api-reference';
import type { Request, Response } from 'express';
import { dump } from 'js-yaml';
import { SERVICE_SPEC_PATH } from '@cargo/common';
import { Upstream, UPSTREAM_NAMES } from '../proxy/upstreams';
import { mergeSpecs } from './merge-specs';

/**
 * Scalar's browser bundle, pinned to an exact version so the docs page doesn't change when Scalar
 * publishes a release. Bump deliberately, together with @scalar/nestjs-api-reference.
 */
const SCALAR_CDN = 'https://cdn.jsdelivr.net/npm/@scalar/api-reference@1.83.0';
const CACHE_MS = 30_000;
const FETCH_TIMEOUT_MS = 3_000;

/**
 * One public API reference for the whole system. Each service serves its own OpenAPI document
 * internally (GET /openapi.json); the gateway fetches and merges them.
 *   GET /{prefix}/docs        Scalar API reference
 *   GET /{prefix}/docs-json   merged OpenAPI JSON
 *   GET /{prefix}/docs-yaml   merged OpenAPI YAML
 * A service that is down is left out (and named in the description) until it is back.
 *
 * Must be called before the global helmet() middleware: the docs page sends its own CSP that
 * allows the pinned Scalar bundle via a per-request nonce, while every other route keeps
 * helmet's strict default policy.
 */
export function setupApiDocs(app: NestExpressApplication, prefix: string): void {
  const config = app.get(ConfigService);
  const logger = new Logger('ApiDocs');
  const upstreams: Record<Upstream, string> = {
    identity: config.getOrThrow('upstreams.identity'),
    masterData: config.getOrThrow('upstreams.masterData'),
    shipments: config.getOrThrow('upstreams.shipments'),
  };

  let cached: { at: number; doc: OpenAPIObject } | undefined;
  const merged = async (): Promise<OpenAPIObject> => {
    if (cached && Date.now() - cached.at < CACHE_MS) return cached.doc;
    const parts = await Promise.all(
      (Object.keys(upstreams) as Upstream[]).map(async (name) => {
        try {
          const res = await fetch(new URL(SERVICE_SPEC_PATH, upstreams[name]), {
            signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
          });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return { name, doc: (await res.json()) as OpenAPIObject };
        } catch (err) {
          logger.warn(
            `OpenAPI from ${UPSTREAM_NAMES[name]} unavailable: ${(err as Error).message}`,
          );
          return { name, doc: undefined };
        }
      }),
    );
    const doc = mergeSpecs(parts);
    // Only cache a complete document, so a service that was down shows up as soon as it is back.
    if (parts.every((p) => p.doc)) cached = { at: Date.now(), doc };
    return doc;
  };

  const http = app.getHttpAdapter();
  http.get(`/${prefix}/docs-json`, async (_req: Request, res: Response) => {
    res.json(await merged());
  });
  http.get(`/${prefix}/docs-yaml`, async (_req: Request, res: Response) => {
    res.type('text/yaml').send(dump(await merged(), { noRefs: true }));
  });

  const scalarConfig: NestJSReferenceConfiguration = {
    pageTitle: 'Cargo API Reference',
    cdn: SCALAR_CDN,
    // Load the spec from our own endpoint instead of inlining it into every page.
    url: `/${prefix}/docs-json`,
    persistAuth: true,
    // Hide Scalar's hosted-platform features: the localhost toolbar/promo and the chat assistant
    // (which would send the spec to Scalar's servers; the CSP blocks it anyway).
    showDeveloperTools: 'never',
    agent: { disabled: true },
    defaultHttpClient: { targetKey: 'node', clientKey: 'fetch' },
  };

  http.get(`/${prefix}/docs`, (req: Request, res: Response) => {
    // A fresh nonce per response; the wrapper stamps it on its <script> and <style> tags.
    const nonce = randomBytes(16).toString('base64');
    res.set({
      'Content-Security-Policy': [
        "default-src 'self'",
        `script-src 'nonce-${nonce}'`,
        // Scalar injects component styles at runtime, so styles can't be nonce-only.
        "style-src 'self' 'unsafe-inline'",
        "font-src 'self' data: https://fonts.scalar.com",
        "img-src 'self' data: https:",
        "connect-src 'self'",
        "object-src 'none'",
        "base-uri 'none'",
        "form-action 'none'",
        "frame-ancestors 'none'",
      ].join('; '),
      'Cache-Control': 'no-store',
      'Referrer-Policy': 'no-referrer',
      'X-Content-Type-Options': 'nosniff',
    });
    (apiReference({ ...scalarConfig, nonce }) as (req: Request, res: Response) => void)(req, res);
  });
}
