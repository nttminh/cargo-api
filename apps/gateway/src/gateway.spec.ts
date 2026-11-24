import { PATH_METADATA } from '@nestjs/common/constants';
import type { OpenAPIObject } from '@nestjs/swagger';
import { mergeSpecs, ownerOf } from './docs/merge-specs';
import { ProxyController } from './proxy/proxy.controller';
import { RESOURCE_OWNERS, Upstream } from './proxy/upstreams';

const spec = (paths: string[], tags: string[]): OpenAPIObject =>
  ({
    openapi: '3.0.0',
    info: { title: 'x', version: '1' },
    tags: tags.map((name) => ({ name })),
    paths: Object.fromEntries(paths.map((p) => [p, { get: { tags } }])),
    components: { schemas: { [`${tags[0]}Dto`]: { type: 'object' } } },
  }) as unknown as OpenAPIObject;

describe('mergeSpecs', () => {
  it('merges paths, schemas and tags and groups tags by service', () => {
    const doc = mergeSpecs([
      { name: 'identity', doc: spec(['/api/v1/auth/login'], ['auth']) },
      { name: 'masterData', doc: spec(['/api/v1/customers'], ['customers']) },
      { name: 'shipments', doc: spec(['/api/v1/shipments'], ['shipments']) },
    ]);
    expect(Object.keys(doc.paths)).toEqual([
      '/api/v1/auth/login',
      '/api/v1/customers',
      '/api/v1/shipments',
    ]);
    expect(Object.keys(doc.components!.schemas!)).toEqual([
      'authDto',
      'customersDto',
      'shipmentsDto',
    ]);
    expect((doc as unknown as Record<string, unknown>)['x-tagGroups']).toEqual([
      { name: 'Identity', tags: ['auth'] },
      { name: 'Master data', tags: ['customers'] },
      { name: 'Shipments', tags: ['shipments'] },
    ]);
    expect(doc.info.description).not.toContain('unavailable');
  });

  it('leaves out a service that is down and says so', () => {
    const doc = mergeSpecs([
      { name: 'identity', doc: spec(['/api/v1/auth/login'], ['auth']) },
      { name: 'masterData' },
      { name: 'shipments', doc: spec(['/api/v1/shipments'], ['shipments']) },
    ]);
    expect(Object.keys(doc.paths)).toEqual(['/api/v1/auth/login', '/api/v1/shipments']);
    expect(doc.info.description).toContain('Currently unavailable: master-data.');
  });
});

describe('routing table', () => {
  // Which upstream each ProxyController handler forwards to.
  const handlers: Record<string, Upstream> = {
    login: 'identity',
    track: 'shipments',
    identity: 'identity',
    masterData: 'masterData',
    shipments: 'shipments',
  };

  const routes = Object.entries(handlers).flatMap(([method, upstream]) => {
    const handler = ProxyController.prototype[method as keyof ProxyController];
    const paths = Reflect.getMetadata(PATH_METADATA, handler) as string | string[];
    return [paths].flat().map((path) => ({ path, upstream }));
  });

  it('routes every resource to the service that owns it', () => {
    for (const { path, upstream } of routes) {
      expect([path, RESOURCE_OWNERS[path.split('/')[0]]]).toEqual([path, upstream]);
    }
  });

  it('covers every resource', () => {
    const routed = new Set(routes.map((r) => r.path.split('/')[0]));
    expect([...routed].sort()).toEqual(Object.keys(RESOURCE_OWNERS).sort());
  });

  it('finds the owner of a documented path', () => {
    expect(ownerOf('/api/v1/shipments/{id}/events', 'api/v1')).toBe('shipments');
    expect(ownerOf('/api/v1/users', 'api/v1')).toBe('identity');
  });
});
