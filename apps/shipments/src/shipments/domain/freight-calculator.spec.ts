import { calculateFreight, roundUpToHalf } from './freight-calculator';
import { TransportMode } from '@cargo/common';

describe('calculateFreight', () => {
  describe('AIR', () => {
    it('uses volumetric weight when cargo is light and bulky', () => {
      // 2 x (100 x 100 x 100 cm) = 2 m3 -> 2,000,000 cm3 / 6000 = 333.333 kg volumetric
      const r = calculateFreight(TransportMode.AIR, [
        { quantity: 2, weightKg: 50, lengthCm: 100, widthCm: 100, heightCm: 100 },
      ]);
      expect(r.totalPieces).toBe(2);
      expect(r.grossWeightKg).toBe(100);
      expect(r.volumeCbm).toBe(2);
      expect(r.volumetricWeightKg).toBeCloseTo(333.333, 3);
      expect(r.chargeableWeightKg).toBe(333.5);
      expect(r.revenueTons).toBeNull();
    });

    it('uses gross weight when cargo is dense', () => {
      const r = calculateFreight(TransportMode.AIR, [
        { quantity: 1, weightKg: 500.2, lengthCm: 50, widthCm: 50, heightCm: 50 },
      ]);
      expect(r.volumetricWeightKg).toBeCloseTo(20.833, 3);
      expect(r.chargeableWeightKg).toBe(500.5);
    });

    it('treats packages without dimensions as zero volume', () => {
      const r = calculateFreight(TransportMode.AIR, [{ quantity: 3, weightKg: 10 }]);
      expect(r.volumeCbm).toBe(0);
      expect(r.chargeableWeightKg).toBe(30);
    });

    it('sums multiple package lines', () => {
      const r = calculateFreight(TransportMode.AIR, [
        { quantity: 2, weightKg: 10, lengthCm: 60, widthCm: 40, heightCm: 40 },
        { quantity: 1, weightKg: 100, lengthCm: 120, widthCm: 80, heightCm: 100 },
      ]);
      expect(r.totalPieces).toBe(3);
      expect(r.grossWeightKg).toBe(120);
      // 2 x 96,000 + 960,000 = 1,152,000 cm3
      expect(r.volumeCbm).toBe(1.152);
      expect(r.chargeableWeightKg).toBe(192);
    });
  });

  describe('SEA (W/M)', () => {
    it('charges by volume when cbm > tonnes', () => {
      const r = calculateFreight(TransportMode.SEA, [
        { quantity: 10, weightKg: 100, lengthCm: 120, widthCm: 100, heightCm: 150 },
      ]);
      expect(r.grossWeightKg).toBe(1000);
      expect(r.volumeCbm).toBe(18);
      expect(r.revenueTons).toBe(18);
      expect(r.chargeableWeightKg).toBeNull();
    });

    it('charges by weight when tonnes > cbm', () => {
      const r = calculateFreight(TransportMode.SEA, [
        { quantity: 4, weightKg: 1000, lengthCm: 100, widthCm: 100, heightCm: 50 },
      ]);
      expect(r.volumeCbm).toBe(2);
      expect(r.revenueTons).toBe(4);
    });

    it('applies the 1 revenue-ton minimum', () => {
      const r = calculateFreight(TransportMode.SEA, [
        { quantity: 1, weightKg: 50, lengthCm: 50, widthCm: 50, heightCm: 50 },
      ]);
      expect(r.revenueTons).toBe(1);
    });
  });

  it('returns zeros for no packages', () => {
    expect(calculateFreight(TransportMode.AIR, []).chargeableWeightKg).toBe(0);
    expect(calculateFreight(TransportMode.SEA, []).revenueTons).toBe(0);
  });
});

describe('roundUpToHalf', () => {
  it.each([
    [10, 10],
    [10.01, 10.5],
    [10.5, 10.5],
    [10.51, 11],
    [0.1, 0.5],
  ])('%p -> %p', (input, expected) => expect(roundUpToHalf(input)).toBe(expected));
});
