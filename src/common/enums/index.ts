export enum TransportMode {
  AIR = 'AIR',
  SEA = 'SEA',
}

export enum LocationType {
  AIRPORT = 'AIRPORT',
  SEAPORT = 'SEAPORT',
}

export enum UserRole {
  ADMIN = 'ADMIN',
  OPERATOR = 'OPERATOR',
  CUSTOMER = 'CUSTOMER',
}

export enum ShipmentStatus {
  DRAFT = 'DRAFT',
  BOOKED = 'BOOKED',
  /** Cargo received at origin warehouse / CFS / terminal */
  RECEIVED = 'RECEIVED',
  DEPARTED = 'DEPARTED',
  IN_TRANSIT = 'IN_TRANSIT',
  ARRIVED = 'ARRIVED',
  CUSTOMS_HOLD = 'CUSTOMS_HOLD',
  CUSTOMS_CLEARED = 'CUSTOMS_CLEARED',
  OUT_FOR_DELIVERY = 'OUT_FOR_DELIVERY',
  DELIVERED = 'DELIVERED',
  CANCELLED = 'CANCELLED',
}

/** Sea freight load type: full container vs less-than-container. Air is always LOOSE. */
export enum LoadType {
  FCL = 'FCL',
  LCL = 'LCL',
  LOOSE = 'LOOSE',
}

export enum ContainerType {
  GP20 = '20GP',
  GP40 = '40GP',
  HC40 = '40HC',
  HC45 = '45HC',
  RF20 = '20RF',
  RF40 = '40RF',
  OT20 = '20OT',
  OT40 = '40OT',
  FR20 = '20FR',
  FR40 = '40FR',
}

export enum Incoterm {
  EXW = 'EXW',
  FCA = 'FCA',
  FAS = 'FAS',
  FOB = 'FOB',
  CFR = 'CFR',
  CIF = 'CIF',
  CPT = 'CPT',
  CIP = 'CIP',
  DAP = 'DAP',
  DPU = 'DPU',
  DDP = 'DDP',
}

export enum PackageType {
  PALLET = 'PALLET',
  CARTON = 'CARTON',
  CRATE = 'CRATE',
  DRUM = 'DRUM',
  BAG = 'BAG',
  ROLL = 'ROLL',
  PIECE = 'PIECE',
  OTHER = 'OTHER',
}
