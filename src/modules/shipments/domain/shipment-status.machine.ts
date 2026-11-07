import { ShipmentStatus as S } from '../../../common/enums';

/**
 * Allowed shipment status transitions. Anything not listed is rejected.
 * DELIVERED and CANCELLED are terminal.
 */
export const SHIPMENT_TRANSITIONS: Readonly<Record<S, readonly S[]>> = {
  [S.DRAFT]: [S.BOOKED, S.CANCELLED],
  [S.BOOKED]: [S.RECEIVED, S.CANCELLED],
  [S.RECEIVED]: [S.DEPARTED, S.CANCELLED],
  [S.DEPARTED]: [S.IN_TRANSIT, S.ARRIVED],
  [S.IN_TRANSIT]: [S.ARRIVED],
  [S.ARRIVED]: [S.CUSTOMS_HOLD, S.CUSTOMS_CLEARED],
  [S.CUSTOMS_HOLD]: [S.CUSTOMS_CLEARED],
  [S.CUSTOMS_CLEARED]: [S.OUT_FOR_DELIVERY, S.DELIVERED],
  [S.OUT_FOR_DELIVERY]: [S.DELIVERED],
  [S.DELIVERED]: [],
  [S.CANCELLED]: [],
};

export const TERMINAL_STATUSES: readonly S[] = [S.DELIVERED, S.CANCELLED];

/** Statuses after which booking details (route, cargo) can no longer be edited. */
export const LOCKED_FOR_EDIT: readonly S[] = [
  S.DEPARTED,
  S.IN_TRANSIT,
  S.ARRIVED,
  S.CUSTOMS_HOLD,
  S.CUSTOMS_CLEARED,
  S.OUT_FOR_DELIVERY,
  S.DELIVERED,
  S.CANCELLED,
];

export const canTransition = (from: S, to: S): boolean => SHIPMENT_TRANSITIONS[from].includes(to);

export const isTerminal = (s: S) => TERMINAL_STATUSES.includes(s);
