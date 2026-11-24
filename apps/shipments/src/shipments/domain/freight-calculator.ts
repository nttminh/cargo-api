import { TransportMode } from '@cargo/common';

export interface PackageMeasure {
  quantity: number;
  /** Gross weight per piece, kg */
  weightKg: number;
  lengthCm?: number | null;
  widthCm?: number | null;
  heightCm?: number | null;
}

export interface FreightTotals {
  totalPieces: number;
  grossWeightKg: number;
  volumeCbm: number;
  /** Air: IATA volumetric weight (L x W x H cm / 6000) */
  volumetricWeightKg: number | null;
  /** Air: max(gross, volumetric), rounded up to the next 0.5 kg */
  chargeableWeightKg: number | null;
  /** Sea LCL: W/M revenue tons = max(gross tonnes, cbm), minimum 1 */
  revenueTons: number | null;
}

/** IATA standard volumetric divisor: 6000 cm3 per kg (approx. 166.67 kg per m3). */
export const AIR_VOLUMETRIC_DIVISOR = 6000;
export const SEA_MIN_REVENUE_TONS = 1;

const round = (n: number, dp: number) => {
  const f = 10 ** dp;
  return Math.round((n + Number.EPSILON) * f) / f;
};

export const roundUpToHalf = (n: number) => Math.ceil(round(n, 6) * 2) / 2;

export function calculateFreight(mode: TransportMode, packages: PackageMeasure[]): FreightTotals {
  let pieces = 0;
  let gross = 0;
  let volumeCm3 = 0;

  for (const p of packages) {
    pieces += p.quantity;
    gross += p.weightKg * p.quantity;
    if (p.lengthCm && p.widthCm && p.heightCm) {
      volumeCm3 += p.lengthCm * p.widthCm * p.heightCm * p.quantity;
    }
  }

  const grossWeightKg = round(gross, 3);
  const volumeCbm = round(volumeCm3 / 1_000_000, 4);

  if (mode === TransportMode.AIR) {
    const volumetricWeightKg = round(volumeCm3 / AIR_VOLUMETRIC_DIVISOR, 3);
    return {
      totalPieces: pieces,
      grossWeightKg,
      volumeCbm,
      volumetricWeightKg,
      chargeableWeightKg: pieces ? roundUpToHalf(Math.max(grossWeightKg, volumetricWeightKg)) : 0,
      revenueTons: null,
    };
  }

  return {
    totalPieces: pieces,
    grossWeightKg,
    volumeCbm,
    volumetricWeightKg: null,
    chargeableWeightKg: null,
    revenueTons: pieces
      ? round(Math.max(grossWeightKg / 1000, volumeCbm, SEA_MIN_REVENUE_TONS), 3)
      : 0,
  };
}
