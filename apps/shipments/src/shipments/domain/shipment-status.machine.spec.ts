import { canTransition, isTerminal, SHIPMENT_TRANSITIONS } from './shipment-status.machine';
import { ShipmentStatus as S } from '@cargo/common';

describe('shipment status machine', () => {
  it('defines transitions for every status', () => {
    for (const s of Object.values(S)) expect(SHIPMENT_TRANSITIONS[s]).toBeDefined();
  });

  it('allows the happy path end to end', () => {
    const path = [
      S.DRAFT,
      S.BOOKED,
      S.RECEIVED,
      S.DEPARTED,
      S.IN_TRANSIT,
      S.ARRIVED,
      S.CUSTOMS_HOLD,
      S.CUSTOMS_CLEARED,
      S.OUT_FOR_DELIVERY,
      S.DELIVERED,
    ];
    for (let i = 0; i < path.length - 1; i++) {
      expect(canTransition(path[i], path[i + 1])).toBe(true);
    }
  });

  it.each([
    [S.DRAFT, S.DELIVERED],
    [S.BOOKED, S.DEPARTED],
    [S.DEPARTED, S.CANCELLED],
    [S.ARRIVED, S.IN_TRANSIT],
    [S.DELIVERED, S.CANCELLED],
    [S.CANCELLED, S.BOOKED],
  ])('rejects %s -> %s', (from, to) => expect(canTransition(from, to)).toBe(false));

  it('allows cancellation only before departure', () => {
    expect(canTransition(S.DRAFT, S.CANCELLED)).toBe(true);
    expect(canTransition(S.BOOKED, S.CANCELLED)).toBe(true);
    expect(canTransition(S.RECEIVED, S.CANCELLED)).toBe(true);
    expect(canTransition(S.IN_TRANSIT, S.CANCELLED)).toBe(false);
  });

  it('treats DELIVERED and CANCELLED as terminal', () => {
    expect(isTerminal(S.DELIVERED)).toBe(true);
    expect(isTerminal(S.CANCELLED)).toBe(true);
    expect(isTerminal(S.IN_TRANSIT)).toBe(false);
    expect(SHIPMENT_TRANSITIONS[S.DELIVERED]).toHaveLength(0);
  });
});
