import { ValueTransformer } from 'typeorm';

/** Postgres returns NUMERIC as string; convert to a JS number. */
export const numericTransformer: ValueTransformer = {
  to: (value?: number | null) => value,
  from: (value?: string | null) => (value === null || value === undefined ? value : Number(value)),
};
