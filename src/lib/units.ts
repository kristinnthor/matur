export type Unit =
  | 'g' | 'kg'
  | 'ml' | 'dl' | 'l' | 'tsk' | 'msk'
  | 'stk' | 'rif' | 'búnt' | 'dós' | 'pakki' | 'sneið' | 'klípa';

export type UnitClass = 'mass' | 'volume' | 'count';

export interface UnitDef {
  class: UnitClass;
  /** Multiply an amount in this unit by this factor to get the canonical value. */
  toCanonical: number;
}

export const UNITS: Record<Unit, UnitDef> = {
  g:  { class: 'mass',   toCanonical: 1 },
  kg: { class: 'mass',   toCanonical: 1000 },

  ml:  { class: 'volume', toCanonical: 1 },
  dl:  { class: 'volume', toCanonical: 100 },
  l:   { class: 'volume', toCanonical: 1000 },
  tsk: { class: 'volume', toCanonical: 5 },
  msk: { class: 'volume', toCanonical: 15 },

  stk:     { class: 'count', toCanonical: 1 },
  rif:     { class: 'count', toCanonical: 1 },
  'búnt':  { class: 'count', toCanonical: 1 },
  'dós':   { class: 'count', toCanonical: 1 },
  pakki:   { class: 'count', toCanonical: 1 },
  'sneið': { class: 'count', toCanonical: 1 },
  'klípa': { class: 'count', toCanonical: 1 },
};

export function toCanonical(amount: number, unit: Unit): number {
  return amount * UNITS[unit].toCanonical;
}
