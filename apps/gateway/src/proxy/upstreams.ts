/** Backend services behind the gateway. */
export type Upstream = 'identity' | 'masterData' | 'shipments';

export const UPSTREAM_NAMES: Record<Upstream, string> = {
  identity: 'identity',
  masterData: 'master-data',
  shipments: 'shipments',
};

/**
 * Which service owns which top-level resource, for the API reference (tag groups) and for
 * reading the routing table at a glance. Routing itself is declared in ProxyController.
 */
export const RESOURCE_OWNERS: Record<string, Upstream> = {
  auth: 'identity',
  users: 'identity',
  customers: 'masterData',
  locations: 'masterData',
  carriers: 'masterData',
  shipments: 'shipments',
  tracking: 'shipments',
  freight: 'shipments',
};
