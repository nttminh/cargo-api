/**
 * Event contracts shared by producers and consumers. Topic names carry a version: a breaking
 * change to a payload gets a new topic (v2) instead of changing v1 in place.
 */
export const Topics = {
  /** Latest state of each customer, keyed by customer id. Compacted. */
  customers: 'masterdata.customers.v1',
  /** Latest state of each airport / seaport, keyed by location id. Compacted. */
  locations: 'masterdata.locations.v1',
  /** Latest state of each carrier, keyed by carrier id. Compacted. */
  carriers: 'masterdata.carriers.v1',
  /** Shipment lifecycle events, keyed by shipment id. Time-retained. */
  shipments: 'shipments.events.v1',
} as const;

export type Topic = (typeof Topics)[keyof typeof Topics];

/**
 * Compacted topics keep at least the latest message per key forever, so a new consumer (or a
 * rebuilt replica) can always replay the full current state from the beginning.
 */
export const COMPACTED_TOPICS: readonly Topic[] = [
  Topics.customers,
  Topics.locations,
  Topics.carriers,
];

export const EventTypes = {
  CustomerUpserted: 'CustomerUpserted',
  LocationUpserted: 'LocationUpserted',
  CarrierUpserted: 'CarrierUpserted',
  ShipmentCreated: 'ShipmentCreated',
  ShipmentStatusChanged: 'ShipmentStatusChanged',
} as const;

export type EventType = (typeof EventTypes)[keyof typeof EventTypes];

/** Every message value is one envelope, serialized as JSON. */
export interface EventEnvelope<T = unknown> {
  /** Unique per event; consumers may use it for de-duplication and tracing. */
  id: string;
  type: EventType;
  /** ISO 8601, UTC. */
  occurredAt: string;
  data: T;
}

// ---- Master data snapshots (event-carried state transfer) ---------------------------------------
// `version` increases on every change of the record. Consumers ignore a snapshot that is not
// newer than what they already have, so redelivered or reordered messages are harmless.

export interface CustomerSnapshot {
  id: string;
  version: number;
  code: string;
  companyName: string;
  countryCode: string;
  isActive: boolean;
}

export interface LocationSnapshot {
  id: string;
  version: number;
  type: 'AIRPORT' | 'SEAPORT';
  code: string;
  name: string;
  city: string;
  countryCode: string;
  timezone: string;
  latitude: number | null;
  longitude: number | null;
  isActive: boolean;
}

export interface CarrierSnapshot {
  id: string;
  version: number;
  mode: 'AIR' | 'SEA';
  code: string;
  name: string;
  awbPrefix: string | null;
  isActive: boolean;
}

// ---- Shipment events ----------------------------------------------------------------------------

export interface ShipmentCreated {
  id: string;
  reference: string;
  mode: 'AIR' | 'SEA';
  customerId: string;
  originId: string;
  destinationId: string;
  status: string;
}

export interface ShipmentStatusChanged {
  id: string;
  reference: string;
  customerId: string;
  from: string;
  to: string;
  /** When the change happened in the real world (ISO 8601, UTC). */
  at: string;
  locationId: string | null;
}
