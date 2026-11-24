import type { OpenAPIObject } from '@nestjs/swagger';
import { RESOURCE_OWNERS, Upstream, UPSTREAM_NAMES } from '../proxy/upstreams';

const GROUP_TITLES: Record<Upstream, string> = {
  identity: 'Identity',
  masterData: 'Master data',
  shipments: 'Shipments',
};

/** Merges the services' documents: paths, schemas and tags, grouped by service. */
export function mergeSpecs(parts: { name: Upstream; doc?: OpenAPIObject }[]): OpenAPIObject {
  const missing = parts.filter((p) => !p.doc).map((p) => UPSTREAM_NAMES[p.name]);
  const merged: OpenAPIObject = {
    openapi: '3.0.0',
    info: {
      title: 'Cargo API',
      version: process.env.npm_package_version ?? '1.0.0',
      description:
        'Air & sea freight forwarding API: customers, airports/seaports, carriers, shipments, ' +
        'containers and tracking.' +
        (missing.length ? `\n\nCurrently unavailable: ${missing.join(', ')}.` : ''),
    },
    paths: {},
    components: {
      schemas: {},
      securitySchemes: { bearer: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } },
    },
    tags: [],
  };
  const groups: { name: string; tags: string[] }[] = [];

  for (const { name, doc } of parts) {
    if (!doc) continue;
    Object.assign(merged.paths, doc.paths);
    Object.assign(merged.components!.schemas!, doc.components?.schemas);

    // Tags in the order the service declares them, falling back to the order of its paths.
    const tags = new Set<string>((doc.tags ?? []).map((t) => t.name));
    for (const item of Object.values(doc.paths ?? {})) {
      for (const op of Object.values(item as Record<string, { tags?: string[] }>)) {
        op?.tags?.forEach((t) => tags.add(t));
      }
    }
    for (const t of tags) {
      if (!merged.tags!.some((x) => x.name === t)) merged.tags!.push({ name: t });
    }
    groups.push({ name: GROUP_TITLES[name], tags: [...tags] });
  }
  // Scalar shows tags grouped by service.
  (merged as OpenAPIObject & { 'x-tagGroups': unknown })['x-tagGroups'] = groups;
  return merged;
}

/** Owning service of a path like /api/v1/shipments/{id}. */
export const ownerOf = (path: string, prefix: string): Upstream | undefined =>
  RESOURCE_OWNERS[path.replace(`/${prefix}/`, '').split('/')[0]];
